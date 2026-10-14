import { createHash, randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import type { OrderRecord } from "../routes/orders";
import { verifyOrderPlanningProposal, type LaneMatchCandidate, type OrderPlanningProposal } from "./orderPlanningService";

export const ORDER_PLANNING_DECISION_SCHEMA_VERSION = "1.0";

export type PlanningDecisionType = "APPROVED" | "REJECTED";
export type OrderPlanningDecision = {
  schemaVersion: string;
  decisionId: string;
  workspaceId: string;
  orderId: string;
  proposalId: string;
  proposalContentHash: string;
  decision: PlanningDecisionType;
  reason: string | null;
  plannedLoadId: string | null;
  decidedBy: string;
  decidedAt: string;
  contentHash: string;
  integrity?: "VERIFIED" | "FAILED";
};

export type PlannedLoadRecord = {
  schemaVersion: "1.0";
  loadId: string;
  displayId: string;
  workspaceId: string;
  status: "PLANNED";
  sourceProposalId: string;
  sourceProposalContentHash: string;
  planningDecisionId: string;
  orderIds: string[];
  orderMeids: string[];
  laneId: string;
  laneName: string;
  laneType: string;
  originFacilityId: unknown;
  destinationFacilityId: unknown;
  businessUnitId: unknown;
  businessUnitName: unknown;
  equipmentType: unknown;
  loadAssumption: unknown;
  carrier: LaneMatchCandidate["activeAwards"][number]["carrier"];
  award: LaneMatchCandidate["activeAwards"][number];
  plannedPickup: unknown;
  plannedDelivery: unknown;
  createdBy: string;
  createdAt: string;
};

export class PlanningDecisionConflict extends Error {}
export class PlanningDecisionValidationError extends Error {}

const localDecisions = new Map<string, OrderPlanningDecision>();
const localLoads = new Map<string, PlannedLoadRecord>();

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
}

export function hashOrderPlanningDecision(decision: Omit<OrderPlanningDecision, "contentHash"> | OrderPlanningDecision) {
  const { contentHash: _contentHash, integrity: _integrity, ...content } = decision as OrderPlanningDecision;
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export function verifyOrderPlanningDecision(decision: OrderPlanningDecision): OrderPlanningDecision {
  return { ...decision, integrity: hashOrderPlanningDecision(decision) === decision.contentHash ? "VERIFIED" : "FAILED" };
}

function recommendedCandidate(proposal: OrderPlanningProposal) {
  return proposal.candidates.find((candidate) => candidate.laneId === proposal.recommendedLaneId);
}

export function validatePlanningDecision(input: {
  workspaceId: string;
  order: OrderRecord;
  proposal: OrderPlanningProposal;
  decision: PlanningDecisionType;
  reason?: string;
}) {
  const { workspaceId, order, proposal, decision } = input;
  if (order.workspaceId !== workspaceId || proposal.workspaceId !== workspaceId || proposal.orderId !== order.orderId) {
    throw new PlanningDecisionValidationError("Order and proposal must belong to the authenticated workspace.");
  }
  if (order.status !== "READY_TO_PLAN") throw new PlanningDecisionConflict("This order is no longer ready to plan.");
  if (verifyOrderPlanningProposal(proposal).integrity !== "VERIFIED") {
    throw new PlanningDecisionValidationError("Only an integrity-verified planning proposal can be decided.");
  }
  if (decision === "REJECTED" && !input.reason?.trim()) {
    throw new PlanningDecisionValidationError("A reason is required when rejecting a planning proposal.");
  }
  if (decision === "APPROVED") {
    const candidate = recommendedCandidate(proposal);
    if (!candidate || candidate.disposition === "INELIGIBLE") {
      throw new PlanningDecisionValidationError("The proposal has no approvable lane recommendation.");
    }
    if (candidate.findings.some((finding) => finding.severity === "BLOCKER")) {
      throw new PlanningDecisionValidationError("Resolve blocking findings before approving this proposal.");
    }
    if (!candidate.activeAwards.length) {
      throw new PlanningDecisionValidationError("An active carrier award is required before creating a planned load.");
    }
    const selectedAward = candidate.activeAwards.find((item) => item.awardType === "PRIMARY") ?? candidate.activeAwards[0];
    if (!candidate.eligibleCarriers.some((carrier) => carrier.externalPartnerId === selectedAward.carrier.externalPartnerId)) {
      throw new PlanningDecisionValidationError("The awarded carrier must be eligible for this lane before creating a planned load.");
    }
  }
}

export function buildPlanningDecisionRecords(input: {
  workspaceId: string;
  order: OrderRecord;
  proposal: OrderPlanningProposal;
  decision: PlanningDecisionType;
  reason?: string;
  actor: string;
  now?: string;
  loadId?: string;
}) {
  validatePlanningDecision(input);
  const decidedAt = input.now ?? new Date().toISOString();
  const decisionId = randomUUID();
  const candidate = recommendedCandidate(input.proposal);
  const loadId = input.decision === "APPROVED" ? input.loadId ?? randomUUID() : null;
  const withoutHash: Omit<OrderPlanningDecision, "contentHash"> = {
    schemaVersion: ORDER_PLANNING_DECISION_SCHEMA_VERSION,
    decisionId,
    workspaceId: input.workspaceId,
    orderId: input.order.orderId,
    proposalId: input.proposal.proposalId,
    proposalContentHash: input.proposal.contentHash,
    decision: input.decision,
    reason: input.reason?.trim() || null,
    plannedLoadId: loadId,
    decidedBy: input.actor,
    decidedAt,
  };
  const decision = { ...withoutHash, contentHash: hashOrderPlanningDecision(withoutHash) };
  if (!candidate || !loadId) return { decision, load: null };
  const award = candidate.activeAwards.find((item) => item.awardType === "PRIMARY") ?? candidate.activeAwards[0];
  const load: PlannedLoadRecord = {
    schemaVersion: "1.0",
    loadId,
    displayId: `SIL-${loadId.replace(/-/g, "").slice(0, 10).toUpperCase()}`,
    workspaceId: input.workspaceId,
    status: "PLANNED",
    sourceProposalId: input.proposal.proposalId,
    sourceProposalContentHash: input.proposal.contentHash,
    planningDecisionId: decisionId,
    orderIds: [input.order.orderId],
    orderMeids: [String(input.order.silTestMeid || input.order.meid || "")].filter(Boolean),
    laneId: candidate.laneId,
    laneName: candidate.laneName,
    laneType: candidate.laneType,
    originFacilityId: candidate.laneSnapshot.originFacilityId,
    destinationFacilityId: candidate.laneSnapshot.destinationFacilityId,
    businessUnitId: candidate.laneSnapshot.businessUnitId,
    businessUnitName: candidate.laneSnapshot.businessUnitName,
    equipmentType: candidate.laneSnapshot.equipmentType,
    loadAssumption: candidate.laneSnapshot.loadAssumption,
    carrier: award.carrier,
    award,
    plannedPickup: input.order.earliestPickup,
    plannedDelivery: input.order.latestDelivery,
    createdBy: input.actor,
    createdAt: decidedAt,
  };
  return { decision, load };
}

export async function decideOrderPlanningProposal(input: {
  workspaceId: string;
  order: OrderRecord;
  proposal: OrderPlanningProposal;
  decision: PlanningDecisionType;
  reason?: string;
  actor: string;
}) {
  if (!isFirestorePrimaryEnabled()) {
    const key = `${input.workspaceId}:${input.proposal.proposalId}`;
    const existing = localDecisions.get(key);
    if (existing) {
      if (existing.decision !== input.decision) throw new PlanningDecisionConflict("This proposal already has a different decision.");
      return { decision: verifyOrderPlanningDecision(existing), load: existing.plannedLoadId ? localLoads.get(existing.plannedLoadId) ?? null : null, order: input.order, idempotent: true };
    }
    const records = buildPlanningDecisionRecords(input);
    localDecisions.set(key, records.decision);
    if (records.load) localLoads.set(records.load.loadId, records.load);
    return { ...records, order: records.load ? { ...input.order, status: "ASSIGNED_TO_LOAD", plannedLoadId: records.load.loadId, updatedAt: records.decision.decidedAt } : input.order, idempotent: false };
  }

  const decisionRef = intakeCollection(input.workspaceId, "orderPlanningDecisions").doc(input.proposal.proposalId);
  const orderRef = intakeCollection(input.workspaceId, "orders").doc(input.order.orderId);
  return decisionRef.firestore.runTransaction(async (transaction) => {
    const [decisionSnapshot, orderSnapshot] = await Promise.all([transaction.get(decisionRef), transaction.get(orderRef)]);
    if (decisionSnapshot.exists) {
      const existing = decisionSnapshot.data() as OrderPlanningDecision;
      if (existing.decision !== input.decision) throw new PlanningDecisionConflict("This proposal already has a different decision.");
      const existingLoad = existing.plannedLoadId
        ? (await transaction.get(intakeCollection(input.workspaceId, "plannedLoads").doc(existing.plannedLoadId))).data() as PlannedLoadRecord | undefined
        : undefined;
      return { decision: verifyOrderPlanningDecision(existing), load: existingLoad ?? null, order: orderSnapshot.data() as OrderRecord, idempotent: true };
    }
    const currentOrder = orderSnapshot.data() as OrderRecord | undefined;
    if (!currentOrder || currentOrder.workspaceId !== input.workspaceId) throw new PlanningDecisionValidationError("Order not found in this workspace.");
    const records = buildPlanningDecisionRecords({ ...input, order: currentOrder });
    const loadRef = records.load ? intakeCollection(input.workspaceId, "plannedLoads").doc(records.load.loadId) : null;
    transaction.create(decisionRef, records.decision);
    if (records.load && loadRef) {
      transaction.create(loadRef, records.load);
      transaction.update(orderRef, { status: "ASSIGNED_TO_LOAD", plannedLoadId: records.load.loadId, updatedAt: records.decision.decidedAt });
    }
    return { ...records, order: records.load ? { ...currentOrder, status: "ASSIGNED_TO_LOAD", plannedLoadId: records.load.loadId, updatedAt: records.decision.decidedAt } : currentOrder, idempotent: false };
  });
}

export async function listOrderPlanningDecisions(workspaceId: string, orderId: string) {
  if (!isFirestorePrimaryEnabled()) return [...localDecisions.values()].filter((item) => item.workspaceId === workspaceId && item.orderId === orderId).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)).map(verifyOrderPlanningDecision);
  const snapshot = await intakeCollection(workspaceId, "orderPlanningDecisions").where("orderId", "==", orderId).get();
  return snapshot.docs.map((doc) => doc.data() as OrderPlanningDecision).filter((item) => item.workspaceId === workspaceId).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)).map(verifyOrderPlanningDecision);
}
