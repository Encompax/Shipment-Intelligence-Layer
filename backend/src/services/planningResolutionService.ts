import { createHash, randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import type { OrderPlanningProposal, LaneMatchCandidate, PlanningFinding } from "./orderPlanningService";

export type ResolutionOption = {
  optionId: string;
  actionType: "CHANGE_ORDER_EQUIPMENT" | "CHANGE_ORDER_DELIVERY" | "ALLOW_ORDER_DELIVERY_DAY" | "SPLIT_ORDER" | "BUILD_ROUTE_CHAIN";
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
function nextAllowedDate(value: unknown, days: string[]) {
  const source = new Date(String(value)); if (!Number.isFinite(source.getTime()) || !days.length) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(source); candidate.setDate(source.getDate() + offset);
    if (days.includes(weekday[candidate.getDay()])) {
      const part = (number: number) => String(number).padStart(2, "0");
      return `${candidate.getFullYear()}-${part(candidate.getMonth() + 1)}-${part(candidate.getDate())}T${part(candidate.getHours())}:${part(candidate.getMinutes())}`;
    }
  }
  return null;
}
const cost = (candidate: LaneMatchCandidate) => candidate.activeAwards.length
  ? `Uses the current ${candidate.activeAwards[0].currency} ${candidate.activeAwards[0].rate} ${candidate.activeAwards[0].rateUnit.replace(/_/g, " ").toLowerCase()} award; final cost depends on created load count.`
  : "No active awarded rate is available, so cost must be reviewed before tendering.";

export function buildPlanningResolutionAnalysis(proposal: OrderPlanningProposal) {
  const options: ResolutionOption[] = [];
  const order = proposal.orderSnapshot;
  const routePlan = proposal.routePlans?.find((plan) => plan.routePlanId === proposal.recommendedRoutePlanId);
  const analysisCandidates = routePlan?.planType === "HUB_SPOKE" ? routePlan.legs.map((leg) => leg.candidate) : proposal.candidates;
  const add = (option: Omit<ResolutionOption, "optionId" | "requiresApproval">) => {
    const key = `${option.actionType}:${canonical(option.parameters)}`;
    if (!options.some((item) => `${item.actionType}:${canonical(item.parameters)}` === key)) options.push({ ...option, optionId: createHash("sha256").update(`${proposal.proposalId}:${key}`).digest("hex").slice(0, 16), requiresApproval: true });
  };
  for (const candidate of analysisCandidates) {
    const codes = candidate.findings.map((finding) => finding.code);
    if (codes.some((code) => ["WEIGHT_CAPACITY_EXCEEDED", "PALLET_CAPACITY_EXCEEDED"].includes(code)) && candidate.capacityRule) {
      const weight = Number(order.weight || 0) * (String(order.weightUom || "LBS").toUpperCase() === "KG" ? 2.2046226218 : 1);
      const pallets = Number(order.palletQuantity || 0);
      const count = Math.max(2, Math.ceil(weight / candidate.capacityRule.maxWeightLbs), Math.ceil(pallets / candidate.capacityRule.maxPallets));
      add({ actionType: "SPLIT_ORDER", title: `Split into ${count} ${candidate.capacityRule.equipmentType} loads`, explanation: `Divide the order so each planned load remains within ${candidate.capacityRule.maxWeightLbs.toLocaleString()} LBS and ${candidate.capacityRule.maxPallets} pallets.`, operationalEffect: `Creates ${count} separately planned loads and requires capacity for each.`, costEffect: `${cost(candidate)} Multiple loads can multiply linehaul or stop charges.`, parameters: { laneId: candidate.laneId, loadCount: count }, executable: false, evidenceCodes: codes.filter((code) => code.includes("CAPACITY")) });
    }
    const deliveryFinding = candidate.findings.find((finding) => finding.code === "DELIVERY_DAY_MISMATCH");
    const allowedDays = candidate.laneType === "FINAL_MILE" ? candidate.laneSnapshot.storeDeliveryDays : candidate.laneSnapshot.terminalArrivalDays;
    const nextDelivery = deliveryFinding ? nextAllowedDate(order.latestDelivery, allowedDays || []) : null;
    if (deliveryFinding && nextDelivery) add({ actionType: "CHANGE_ORDER_DELIVERY", title: `Move delivery to ${weekday[new Date(nextDelivery).getDay()]}`, explanation: `Move the order's latest delivery to the next day allowed by ${candidate.laneName}.`, operationalEffect: "Changes the customer delivery commitment and runs lane matching again.", costEffect: cost(candidate), parameters: { latestDelivery: nextDelivery, laneId: candidate.laneId }, executable: true, evidenceCodes: [deliveryFinding.code] });
    if (deliveryFinding) add({ actionType: "ALLOW_ORDER_DELIVERY_DAY", title: `Allow ${weekday[new Date(String(order.latestDelivery)).getDay()]} for this order only`, explanation: `Create a temporary exception for this order without changing ${candidate.laneName} or its reusable delivery schedule.`, operationalEffect: "Applies only while planning this order, reruns matching, and logs the exception as a recurring data-quality signal.", costEffect: "No lane rate or permanent schedule changes are assumed; the planner remains responsible for confirming facility and carrier availability.", parameters: { laneId: candidate.laneId, requestedDay: weekday[new Date(String(order.latestDelivery)).getDay()], findingCode: deliveryFinding.code }, executable: true, evidenceCodes: [deliveryFinding.code] });
  }
  const equipmentCandidates = analysisCandidates.filter((candidate) => candidate.capacityRule && !candidate.findings.some((finding) => ["ROUTE_MISMATCH", "BUSINESS_UNIT_MISMATCH", "WEIGHT_CAPACITY_EXCEEDED", "PALLET_CAPACITY_EXCEEDED"].includes(finding.code)));
  equipmentCandidates.forEach((candidate) => add({ actionType: "CHANGE_ORDER_EQUIPMENT", title: `Use ${candidate.capacityRule!.equipmentType}`, explanation: `Use the configured ${candidate.capacityRule!.maxWeightLbs.toLocaleString()} LBS / ${candidate.capacityRule!.maxPallets}-pallet capacity.`, operationalEffect: "Changes the order equipment request and reruns lane matching.", costEffect: cost(candidate), parameters: { equipmentType: candidate.capacityRule!.equipmentType, laneId: candidate.laneId }, executable: true, evidenceCodes: ["WEIGHT_CAPACITY_EXCEEDED", "PALLET_CAPACITY_EXCEEDED"] }));
  if (!routePlan && proposal.candidates.some((candidate) => candidate.laneType === "LINEHAUL") && proposal.candidates.some((candidate) => candidate.laneType === "FINAL_MILE")) add({ actionType: "BUILD_ROUTE_CHAIN", title: "Build a Linehaul-to-Final-Mile route chain", explanation: "Plan the order through an intermediate terminal instead of requiring one lane to cover the entire route.", operationalEffect: "Creates separate Linehaul and Final Mile segments with a governed handoff between them.", costEffect: "Requires separate segment awards and exposes total landed transportation cost.", parameters: {}, executable: false, evidenceCodes: ["ROUTE_MISMATCH"] });
  const findings = analysisCandidates.flatMap((candidate) => candidate.findings.map((finding: PlanningFinding) => ({ laneId: candidate.laneId, laneName: candidate.laneName, ...finding })));
  const response = options.length
    ? "Proposed governed resolution paths are shown below. Select one to prepare an action draft. Nothing changes until you explicitly approve an executable draft."
    : routePlan
      ? `I reviewed the ${routePlan.planType === "HUB_SPOKE" ? "hub-and-spoke" : "direct"} route plan and found no correction that should be prepared automatically. Review the segment evidence and carrier awards before approval.`
      : "I could not identify a safe automatic correction. Review the proposal evidence with a planner or Data Steward.";
  return { proposalId: proposal.proposalId, orderId: proposal.orderId, outcome: proposal.outcome, findings, options, response };
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
