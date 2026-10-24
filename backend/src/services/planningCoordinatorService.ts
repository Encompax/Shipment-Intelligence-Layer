import { createHash, randomUUID } from "crypto";
import OpenAI from "openai";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import { buildPlanningResolutionAnalysis } from "./planningResolutionService";
import type { OrderPlanningProposal } from "./orderPlanningService";

export const PLANNING_COORDINATOR_PROMPT_VERSION = "sil-planning-coordinator-v1";
export type CoordinatorAction = "APPROVE_PLAN" | "REVIEW_WARNINGS" | "PREPARE_CORRECTION" | "MODIFY_ORDER" | "HOLD";
type ActionCandidate = { action: CoordinatorAction; executable: boolean; requiresApproval: boolean; resolutionOptionId: string | null; reason: string };
export type PlanningCoordinatorCase = {
  orderId: string; orderMeid: string; reference: string; proposalId: string; proposalContentHash: string;
  outcome: string; blockerCount: number; warningCount: number; allowedActions: ActionCandidate[];
  selectedAction: CoordinatorAction; executable: boolean; requiresApproval: boolean; resolutionOptionId: string | null;
  rationale: string; operationalEffect: string; costEffect: string; confidence: number; priority: number;
  actionDraftId: string;
};
export type PlanningCoordinatorActionDraft = {
  schemaVersion: "1.0"; actionDraftId: string; workspaceId: string; coordinatorRunId: string; orderId: string;
  proposalId: string; proposalContentHash: string; supersedesActionDraftId: string | null; revision: number;
  status: "DRAFT"; selectedAction: CoordinatorAction; allowedActions: CoordinatorAction[]; routePlanId: string | null;
  inputs: Record<string, unknown>; rationale: string; createdBy: string; createdAt: string; contentHash: string;
};
export type PlanningCoordinatorRun = {
  schemaVersion: "1.0"; coordinatorRunId: string; workspaceId: string; status: "PENDING_APPROVAL";
  summary: string; cases: PlanningCoordinatorCase[]; provider: "OPENAI" | "RULES"; model: string;
  promptVersion: string; responseId: string | null; createdBy: string; createdAt: string; contentHash: string;
};

const localRuns = new Map<string, PlanningCoordinatorRun[]>();
const localDrafts = new Map<string, PlanningCoordinatorActionDraft[]>();
let client: OpenAI | undefined;
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
const clean = (value: unknown) => String(value ?? "").trim();
const schema = {
  type: "object", additionalProperties: false, required: ["summary", "cases"],
  properties: {
    summary: { type: "string" },
    cases: { type: "array", items: { type: "object", additionalProperties: false, required: ["orderId", "selectedAction", "rationale", "operationalEffect", "costEffect", "confidence", "priority"], properties: {
      orderId: { type: "string" }, selectedAction: { type: "string", enum: ["APPROVE_PLAN", "REVIEW_WARNINGS", "PREPARE_CORRECTION", "MODIFY_ORDER", "HOLD"] },
      rationale: { type: "string" }, operationalEffect: { type: "string" }, costEffect: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, priority: { type: "integer", minimum: 1, maximum: 100 },
    } } },
  },
} as const;

function candidatesFor(proposal: OrderPlanningProposal): ActionCandidate[] {
  const resolution = buildPlanningResolutionAnalysis(proposal);
  const blockers = proposal.routePlans.find((route) => route.routePlanId === proposal.recommendedRoutePlanId)?.findings.filter((finding) => finding.severity === "BLOCKER").length ?? proposal.recommendation?.blockerCount ?? 0;
  const warnings = proposal.routePlans.find((route) => route.routePlanId === proposal.recommendedRoutePlanId)?.findings.filter((finding) => finding.severity === "WARNING").length ?? proposal.recommendation?.warningCount ?? 0;
  if (proposal.outcome === "MATCHED" && blockers === 0) return [{ action: "APPROVE_PLAN", executable: true, requiresApproval: true, resolutionOptionId: null, reason: "The verified route has no blockers." }, { action: "HOLD", executable: true, requiresApproval: false, resolutionOptionId: null, reason: "Keep the case in planning without changing operational records." }];
  if (proposal.outcome === "REVIEW_REQUIRED" && blockers === 0) return [{ action: "REVIEW_WARNINGS", executable: true, requiresApproval: true, resolutionOptionId: null, reason: `${warnings} warning${warnings === 1 ? "" : "s"} require operator review before approval.` }, { action: "HOLD", executable: true, requiresApproval: false, resolutionOptionId: null, reason: "Keep the case in planning." }];
  const correction = resolution.options.find((option) => option.executable);
  return correction
    ? [{ action: "PREPARE_CORRECTION", executable: true, requiresApproval: true, resolutionOptionId: correction.optionId, reason: correction.explanation }, { action: "MODIFY_ORDER", executable: true, requiresApproval: true, resolutionOptionId: null, reason: "Open the source order for a planner-defined correction." }, { action: "HOLD", executable: true, requiresApproval: false, resolutionOptionId: null, reason: "Keep the case unchanged." }]
    : [{ action: "MODIFY_ORDER", executable: true, requiresApproval: true, resolutionOptionId: null, reason: resolution.response }, { action: "HOLD", executable: true, requiresApproval: false, resolutionOptionId: null, reason: "Keep the case unchanged." }];
}

function evidenceFor(proposal: OrderPlanningProposal) {
  const allowedActions = candidatesFor(proposal);
  const route = proposal.routePlans.find((item) => item.routePlanId === proposal.recommendedRoutePlanId);
  const findings = (route?.findings ?? proposal.candidates[0]?.findings ?? []).map((finding) => ({ severity: finding.severity, code: finding.code, message: finding.message }));
  return { orderId: proposal.orderId, orderMeid: proposal.orderMeid ?? "", reference: clean(proposal.orderSnapshot.primaryReference), proposalId: proposal.proposalId, outcome: proposal.outcome, allowedActions, route: route ? { planType: route.planType, score: route.score, finalDeliveryAt: route.finalDeliveryAt, commitmentLatestAt: route.commitmentLatestAt, segments: route.legs.map((leg) => ({ role: leg.role, laneName: leg.candidate.laneName, carrier: leg.candidate.activeAwards[0]?.carrier.name ?? null, rate: leg.candidate.activeAwards[0]?.rate ?? null, rateUnit: leg.candidate.activeAwards[0]?.rateUnit ?? null })) } : null, findings };
}

export async function coordinatePlanning(input: { workspaceId: string; proposals: OrderPlanningProposal[]; actor: string; safetyIdentifier?: string }): Promise<PlanningCoordinatorRun> {
  if (!input.proposals.length) throw new Error("At least one verified planning proposal is required.");
  if (input.proposals.some((proposal) => proposal.workspaceId !== input.workspaceId || proposal.integrity !== "VERIFIED")) throw new Error("Every planning case requires verified tenant-scoped evidence.");
  const evidence = input.proposals.map(evidenceFor);
  let provider: PlanningCoordinatorRun["provider"] = "RULES"; let model = "governed-rules"; let responseId: string | null = null;
  let response = { summary: `${evidence.length} planning case${evidence.length === 1 ? " is" : "s are"} organized by the next governed action.`, cases: evidence.map((item, index) => ({ orderId: item.orderId, selectedAction: item.allowedActions[0].action, rationale: item.allowedActions[0].reason, operationalEffect: item.allowedActions[0].action === "APPROVE_PLAN" ? "Approval can create the planned load without tendering it." : "The case remains in planning until its governed action is approved.", costEffect: "Use the active awarded rate when present; no unsupported cost estimate was introduced.", confidence: 1, priority: index + 1 })) };
  if (process.env.OPENAI_API_KEY) {
    try {
      client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: Number(process.env.SIL_OPENAI_TIMEOUT_MS ?? 20_000), maxRetries: Number(process.env.SIL_OPENAI_MAX_RETRIES ?? 1) });
      model = process.env.SIL_OPENAI_MODEL ?? "gpt-5.6-terra";
      const result = await client.responses.create({ model, store: false, reasoning: { effort: "medium" }, max_output_tokens: 1800, safety_identifier: input.safetyIdentifier,
        instructions: `You are the SIL AI Planning Coordinator. Turn verified tenant-scoped planning evidence into one clear next action per order. Select only an action explicitly listed in that case's allowedActions. Prefer advancing valid work, but never bypass blockers, invent routes, rates, capacity, schedules, or carrier authority. Combine the full finding set into a concise rationale. State operational and cost consequences using supplied evidence only. You prepare governed work; you do not execute changes, approve plans, create loads, or tender freight. Rank urgent blockers and commitment risks first.`,
        input: JSON.stringify({ planningCases: evidence }), text: { verbosity: "medium", format: { type: "json_schema", name: "sil_planning_coordinator", strict: true, schema } },
      });
      response = JSON.parse(result.output_text); provider = "OPENAI"; responseId = result.id;
    } catch (error) { console.error("SIL planning coordinator request failed", { errorName: error instanceof Error ? error.name : "UnknownError" }); }
  }
  const aiByOrder = new Map(response.cases.map((item: any) => [clean(item.orderId), item]));
  const cases = evidence.map((item, index): PlanningCoordinatorCase => {
    const suggested: any = aiByOrder.get(item.orderId); const allowed = item.allowedActions.find((candidate) => candidate.action === suggested?.selectedAction) ?? item.allowedActions[0];
    return { orderId: item.orderId, orderMeid: item.orderMeid, reference: item.reference, proposalId: item.proposalId, proposalContentHash: input.proposals[index].contentHash, outcome: item.outcome,
      blockerCount: item.findings.filter((finding) => finding.severity === "BLOCKER").length, warningCount: item.findings.filter((finding) => finding.severity === "WARNING").length, allowedActions: item.allowedActions,
      selectedAction: allowed.action, executable: allowed.executable, requiresApproval: allowed.requiresApproval, resolutionOptionId: allowed.resolutionOptionId,
      rationale: clean(suggested?.rationale) || allowed.reason, operationalEffect: clean(suggested?.operationalEffect) || "The case remains within governed planning.", costEffect: clean(suggested?.costEffect) || "No cost evidence was supplied.", confidence: Math.max(0, Math.min(1, Number(suggested?.confidence ?? 1))), priority: Math.max(1, Math.min(100, Number(suggested?.priority ?? index + 1))), actionDraftId: randomUUID() };
  }).sort((a, b) => a.priority - b.priority);
  const base = { schemaVersion: "1.0" as const, coordinatorRunId: randomUUID(), workspaceId: input.workspaceId, status: "PENDING_APPROVAL" as const, summary: clean(response.summary).slice(0, 2000), cases, provider, model, promptVersion: PLANNING_COORDINATOR_PROMPT_VERSION, responseId, createdBy: input.actor, createdAt: new Date().toISOString() };
  const run = { ...base, contentHash: createHash("sha256").update(canonical(base)).digest("hex") };
  const proposalsByOrder = new Map(input.proposals.map((proposal) => [proposal.orderId, proposal]));
  const drafts = cases.map((planningCase) => buildActionDraft(run.coordinatorRunId, planningCase, proposalsByOrder.get(planningCase.orderId)!, input.actor));
  if (isFirestorePrimaryEnabled()) {
    const batch = intakeCollection(input.workspaceId, "planningCoordinatorRuns").doc(run.coordinatorRunId).firestore.batch();
    batch.create(intakeCollection(input.workspaceId, "planningCoordinatorRuns").doc(run.coordinatorRunId), run);
    drafts.forEach((draft) => batch.create(intakeCollection(input.workspaceId, "planningCoordinatorDrafts").doc(draft.actionDraftId), draft));
    await batch.commit();
  } else {
    localRuns.set(input.workspaceId, [run, ...(localRuns.get(input.workspaceId) ?? [])]);
    localDrafts.set(input.workspaceId, [...drafts, ...(localDrafts.get(input.workspaceId) ?? [])]);
  }
  return run;
}

function buildActionDraft(runId: string, planningCase: PlanningCoordinatorCase, proposal: OrderPlanningProposal, actor: string): PlanningCoordinatorActionDraft {
  const snapshot = proposal.orderSnapshot as Record<string, unknown>;
  const inputs = Object.fromEntries(["originId", "destinationId", "businessUnit", "earliestPickup", "latestDelivery", "modeType", "orderType", "equipmentType", "weight", "weightUom", "palletQuantity", "scac"].map((field) => [field, snapshot[field] ?? null]));
  const base = { schemaVersion: "1.0" as const, actionDraftId: planningCase.actionDraftId, workspaceId: proposal.workspaceId, coordinatorRunId: runId, orderId: proposal.orderId, proposalId: proposal.proposalId, proposalContentHash: proposal.contentHash, supersedesActionDraftId: null, revision: 1, status: "DRAFT" as const, selectedAction: planningCase.selectedAction, allowedActions: planningCase.allowedActions.map((item) => item.action), routePlanId: proposal.recommendedRoutePlanId ?? null, inputs, rationale: planningCase.rationale, createdBy: actor, createdAt: new Date().toISOString() };
  return { ...base, contentHash: createHash("sha256").update(canonical(base)).digest("hex") };
}

export async function getPlanningCoordinatorDraft(workspaceId: string, draftId: string) {
  if (isFirestorePrimaryEnabled()) {
    const snapshot = await intakeCollection(workspaceId, "planningCoordinatorDrafts").doc(draftId).get();
    const draft = snapshot.exists ? snapshot.data() as PlanningCoordinatorActionDraft : null;
    return draft?.workspaceId === workspaceId ? draft : null;
  }
  return (localDrafts.get(workspaceId) ?? []).find((draft) => draft.actionDraftId === draftId) ?? null;
}

export async function revisePlanningCoordinatorDraft(input: { workspaceId: string; draft: PlanningCoordinatorActionDraft; actor: string; selectedAction?: unknown; inputs?: unknown; rationale?: unknown }) {
  const selectedAction = clean(input.selectedAction || input.draft.selectedAction) as CoordinatorAction;
  if (!input.draft.allowedActions.includes(selectedAction)) throw new Error("The selected action is not allowed by the verified planning case.");
  const editable = new Set(["originId", "destinationId", "businessUnit", "earliestPickup", "latestDelivery", "modeType", "orderType", "equipmentType", "weight", "weightUom", "palletQuantity", "scac"]);
  const requested = input.inputs && typeof input.inputs === "object" ? input.inputs as Record<string, unknown> : {};
  if (Object.keys(requested).some((field) => !editable.has(field))) throw new Error("The draft contains an unsupported planning input.");
  const nextId = randomUUID();
  const base = { ...input.draft, actionDraftId: nextId, supersedesActionDraftId: input.draft.actionDraftId, revision: input.draft.revision + 1, selectedAction, inputs: { ...input.draft.inputs, ...requested }, rationale: clean(input.rationale || input.draft.rationale).slice(0, 2000), createdBy: input.actor, createdAt: new Date().toISOString(), contentHash: "" };
  const revised = { ...base, contentHash: createHash("sha256").update(canonical({ ...base, contentHash: undefined })).digest("hex") };
  if (isFirestorePrimaryEnabled()) await intakeCollection(input.workspaceId, "planningCoordinatorDrafts").doc(nextId).create(revised);
  else localDrafts.set(input.workspaceId, [revised, ...(localDrafts.get(input.workspaceId) ?? [])]);
  return revised;
}

export async function listPlanningCoordinatorRuns(workspaceId: string) {
  const records = isFirestorePrimaryEnabled() ? (await intakeCollection(workspaceId, "planningCoordinatorRuns").get()).docs.map((doc) => doc.data() as PlanningCoordinatorRun) : localRuns.get(workspaceId) ?? [];
  return records.filter((run) => run.workspaceId === workspaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
