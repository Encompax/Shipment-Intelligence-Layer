import { createHash, randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import type { OrderPlanningProposal, LaneMatchCandidate, PlanningFinding } from "./orderPlanningService";

export type ResolutionOption = {
  optionId: string;
  actionType: "CHANGE_ORDER_EQUIPMENT" | "CHANGE_ORDER_DELIVERY" | "ALLOW_ORDER_DELIVERY_DAY" | "SPLIT_ORDER" | "BUILD_ROUTE_CHAIN" | "APPLY_CORRECTION_SET";
  title: string; explanation: string; operationalEffect: string; costEffect: string; parameters: Record<string, unknown>;
  executable: boolean; requiresApproval: true; evidenceCodes: string[];
};
export type PlanningResolutionDraft = {
  schemaVersion: "1.0"; draftId: string; workspaceId: string; orderId: string; proposalId: string; proposalContentHash: string;
  option: ResolutionOption; status: "PENDING_APPROVAL"; createdBy: string; createdAt: string; contentHash: string; integrity?: "VERIFIED" | "FAILED";
};
export type PlanningResolutionDecision = {
  schemaVersion: "1.0"; decisionId: string; workspaceId: string; draftId: string; decision: "APPROVED" | "REJECTED";
  reason: string | null; decidedBy: string; decidedAt: string; resultingProposalIds: string[]; contentHash: string; integrity?: "VERIFIED" | "FAILED";
};
const localDrafts = new Map<string, PlanningResolutionDraft[]>();
const localDecisions = new Map<string, PlanningResolutionDecision[]>();
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
const hash = (value: Record<string, unknown>) => createHash("sha256").update(canonical(value)).digest("hex");
const withoutIntegrity = <T extends { contentHash?: string; integrity?: string }>(value: T) => { const { contentHash: _h, integrity: _i, ...rest } = value; return rest; };
const weekday = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const cost = (candidate: LaneMatchCandidate) => candidate.activeAwards.length
  ? `Uses the current ${candidate.activeAwards[0].currency} ${candidate.activeAwards[0].rate} ${candidate.activeAwards[0].rateUnit.replace(/_/g, " ").toLowerCase()} award; final cost depends on created load count.`
  : "No active awarded rate is available, so cost must be reviewed before tendering.";

export function buildPlanningResolutionAnalysis(proposal: OrderPlanningProposal) {
  const order = proposal.orderSnapshot;
  const selectedRoutePlan = proposal.routePlans?.find((plan) => plan.routePlanId === proposal.recommendedRoutePlanId);
  const routePlan = selectedRoutePlan?.disposition === "INELIGIBLE" ? undefined : selectedRoutePlan;
  const normalizedType = String(order.orderType || "").toUpperCase();
  const inferredLaneType = normalizedType === "FINAL_MILE" || normalizedType === "INBOUND" || normalizedType === "ADHOC" || normalizedType === "LINEHAUL"
    ? normalizedType
    : String(order.modeType || "").toUpperCase() === "LTL" || ["BOX TRUCK", "26 FT DRY VAN"].includes(String(order.equipmentType || "").toUpperCase())
      ? "FINAL_MILE"
      : "LINEHAUL";
  const relevantCandidates = routePlan
    ? routePlan.legs.map((leg) => leg.candidate)
    : proposal.candidates.filter((candidate) => candidate.laneType === inferredLaneType);
  // A single best segment is the correction target. Other lane evaluations remain
  // immutable diagnostics and must not become proposed changes for this order.
  const analysisCandidates = routePlan ? relevantCandidates : relevantCandidates.slice(0, 1);
  const findings = analysisCandidates.flatMap((candidate) => candidate.findings.map((finding: PlanningFinding) => ({ laneId: candidate.laneId, laneName: candidate.laneName, ...finding })));
  const changes: Array<Record<string, unknown>> = [];
  const unresolved: string[] = [];
  const evidenceCodes = [...new Set(findings.map((finding) => finding.code))];
  for (const candidate of analysisCandidates) {
    const codes = new Set(candidate.findings.map((finding) => finding.code));
    if (codes.has("ROUTE_MISMATCH")) unresolved.push(`Confirm this order's origin and destination; they do not match ${candidate.laneName}.`);
    if (codes.has("BUSINESS_UNIT_MISMATCH")) unresolved.push(`Choose the business unit authorized for ${candidate.laneName}.`);
    if (codes.has("SERVICE_TYPE_MISMATCH")) unresolved.push(`Confirm the order service type before using ${candidate.laneName}.`);
    if ((codes.has("WEIGHT_CAPACITY_EXCEEDED") || codes.has("PALLET_CAPACITY_EXCEEDED")) && candidate.capacityRule) {
      const weight = Number(order.weight || 0) * (String(order.weightUom || "LBS").toUpperCase() === "KG" ? 2.2046226218 : 1);
      const pallets = Number(order.palletQuantity || 0);
      const count = Math.max(2, Math.ceil(weight / candidate.capacityRule.maxWeightLbs), Math.ceil(pallets / candidate.capacityRule.maxPallets));
      unresolved.push(`Split the order into ${count} loads or select a compatible higher-capacity ${candidate.laneType.replace(/_/g, " ").toLowerCase()} lane.`);
    }
    if (codes.has("MODE_MISMATCH") && !codes.has("ROUTE_MISMATCH")) changes.push({ kind: "ORDER_FIELD", field: "modeType", value: candidate.laneSnapshot.loadAssumption, laneId: candidate.laneId, label: `Use ${candidate.laneSnapshot.loadAssumption} mode for ${candidate.laneName}.` });
    if (codes.has("EQUIPMENT_MISMATCH") && !codes.has("ROUTE_MISMATCH") && !codes.has("WEIGHT_CAPACITY_EXCEEDED") && !codes.has("PALLET_CAPACITY_EXCEEDED")) changes.push({ kind: "ORDER_FIELD", field: "equipmentType", value: candidate.laneSnapshot.equipmentType, laneId: candidate.laneId, label: `Use ${candidate.laneSnapshot.equipmentType} for ${candidate.laneName}.` });
    for (const [code, source, label] of [["PICKUP_DAY_MISMATCH", order.earliestPickup, "pickup"], ["DELIVERY_DAY_MISMATCH", order.latestDelivery, "delivery"]] as const) {
      if (codes.has(code)) changes.push({ kind: "SCHEDULE_EXCEPTION", findingCode: code, requestedDay: weekday[new Date(String(source)).getDay()], laneId: candidate.laneId, label: `Allow this order's ${label} day on ${candidate.laneName} without changing the lane schedule.` });
    }
  }
  const executable = changes.length > 0 && unresolved.length === 0;
  const parameters = { changes, unresolved, inferredLaneType };
  const option: ResolutionOption | null = findings.length ? {
    optionId: createHash("sha256").update(`${proposal.proposalId}:APPLY_CORRECTION_SET:${canonical(parameters)}`).digest("hex").slice(0, 16),
    actionType: "APPLY_CORRECTION_SET", title: "Proposed order correction", requiresApproval: true,
    explanation: unresolved.length ? "SIL found issues that require order input before a safe correction can be applied." : "SIL combined the compatible corrections into one order-specific change set.",
    operationalEffect: changes.length ? changes.map((change) => String(change.label)).join(" ") : "No automatic order change is safe from the current evidence.",
    costEffect: analysisCandidates[0] ? cost(analysisCandidates[0]) : "No compatible lane and rate were identified.",
    parameters, executable, evidenceCodes,
  } : null;
  const response = !analysisCandidates.length
    ? `No ${inferredLaneType.replace(/_/g, " ").toLowerCase()} lane is compatible with this order. Unrelated lane types were excluded from the proposed changes.`
    : executable
      ? "SIL reviewed the relevant segment evidence and prepared one governed correction package. Accept applies the order-specific changes and reruns matching; the lane remains unchanged."
      : "SIL reviewed the relevant segment evidence as one case. Resolve the listed order inputs with Modify order; unrelated lane evaluations are not included as proposed changes.";
  return { proposalId: proposal.proposalId, orderId: proposal.orderId, outcome: proposal.outcome, inferredLaneType, findings, options: option ? [option] : [], response };
}

export async function createPlanningResolutionDraft(input: { workspaceId: string; actor: string; proposal: OrderPlanningProposal; option: ResolutionOption }) {
  const base = { schemaVersion: "1.0" as const, draftId: randomUUID(), workspaceId: input.workspaceId, orderId: input.proposal.orderId, proposalId: input.proposal.proposalId, proposalContentHash: input.proposal.contentHash, option: input.option, status: "PENDING_APPROVAL" as const, createdBy: input.actor, createdAt: new Date().toISOString() };
  const draft = { ...base, contentHash: hash(base) };
  if (isFirestorePrimaryEnabled()) await intakeCollection(input.workspaceId, "planningResolutionDrafts").doc(draft.draftId).create(draft); else localDrafts.set(input.workspaceId, [...(localDrafts.get(input.workspaceId) ?? []), draft]);
  return { ...draft, integrity: "VERIFIED" as const };
}
export async function getPlanningResolutionDraft(workspaceId: string, draftId: string) {
  const record = isFirestorePrimaryEnabled() ? (await intakeCollection(workspaceId, "planningResolutionDrafts").doc(draftId).get()).data() as PlanningResolutionDraft | undefined : (localDrafts.get(workspaceId) ?? []).find((item) => item.draftId === draftId);
  if (!record || record.workspaceId !== workspaceId) return null; return { ...record, integrity: hash(withoutIntegrity(record)) === record.contentHash ? "VERIFIED" as const : "FAILED" as const };
}
export async function recordPlanningResolutionDecision(input: { workspaceId: string; draftId: string; decision: "APPROVED" | "REJECTED"; reason?: string; actor: string; resultingProposalIds?: string[] }) {
  const previous = isFirestorePrimaryEnabled() ? (await intakeCollection(input.workspaceId, "planningResolutionDecisions").where("draftId", "==", input.draftId).get()).docs[0]?.data() as PlanningResolutionDecision | undefined : (localDecisions.get(input.workspaceId) ?? []).find((item) => item.draftId === input.draftId);
  if (previous) throw new Error("This resolution draft already has a decision.");
  const base = { schemaVersion: "1.0" as const, decisionId: randomUUID(), workspaceId: input.workspaceId, draftId: input.draftId, decision: input.decision, reason: input.reason?.trim() || null, decidedBy: input.actor, decidedAt: new Date().toISOString(), resultingProposalIds: input.resultingProposalIds ?? [] };
  const record = { ...base, contentHash: hash(base) };
  if (isFirestorePrimaryEnabled()) await intakeCollection(input.workspaceId, "planningResolutionDecisions").doc(record.decisionId).create(record); else localDecisions.set(input.workspaceId, [...(localDecisions.get(input.workspaceId) ?? []), record]);
  return { ...record, integrity: "VERIFIED" as const };
}
