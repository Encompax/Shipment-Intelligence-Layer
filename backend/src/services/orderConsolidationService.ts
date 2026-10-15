import { createHash, randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import type { OrderRecord } from "../routes/orders";
import { intakeCollection } from "./intake/intakeStore";
import { weightInPounds } from "./equipmentCapacity";
import { verifyOrderPlanningProposal, type OrderPlanningProposal, type PlanningAward, type RoutePlanLeg } from "./orderPlanningService";
import type { PlannedLoadRecord } from "./orderPlanningDecisionService";

export const ORDER_CONSOLIDATION_SCHEMA_VERSION = "1.0";

export type ConsolidationGroup = {
  groupId: string;
  groupKey: string;
  role: RoutePlanLeg["role"];
  laneType: string;
  laneId: string;
  laneName: string;
  orderIds: string[];
  orderMeids: string[];
  sourceProposalIds: string[];
  sourceProposalHashes: string[];
  plannedPickup: string;
  plannedDelivery: string;
  equipmentType: string;
  loadAssumption: string;
  originFacilityId: string;
  destinationFacilityId: string;
  businessUnitId: string;
  businessUnitName: string;
  carrierId: string;
  carrierName: string;
  award: PlanningAward;
  totalWeightLbs: number;
  totalPallets: number;
  maxWeightLbs: number | null;
  maxPallets: number | null;
  utilization: { weightPercent: number | null; palletPercent: number | null };
  status: "READY" | "SINGLE_ORDER" | "CAPACITY_EXCEEDED";
  findings: Array<{ severity: "BLOCKER" | "INFO"; code: string; message: string }>;
};

export type OrderConsolidationProposal = {
  schemaVersion: "1.0";
  consolidationProposalId: string;
  workspaceId: string;
  status: "PENDING_REVIEW";
  orderSnapshots: Record<string, unknown>[];
  groups: ConsolidationGroup[];
  excludedOrders: Array<{ orderId: string; reason: string }>;
  createdBy: string;
  createdAt: string;
  contentHash: string;
  integrity?: "VERIFIED" | "FAILED";
};

export type OrderConsolidationDecision = {
  schemaVersion: "1.0";
  decisionId: string;
  workspaceId: string;
  consolidationProposalId: string;
  consolidationProposalContentHash: string;
  decision: "APPROVED" | "REJECTED";
  reason: string | null;
  plannedLoadIds: string[];
  decidedBy: string;
  decidedAt: string;
  contentHash: string;
  integrity?: "VERIFIED" | "FAILED";
};

const localProposals = new Map<string, OrderConsolidationProposal[]>();
const localDecisions = new Map<string, OrderConsolidationDecision>();
const clean = (value: unknown) => String(value ?? "").trim();
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
};

export function hashOrderConsolidationProposal(proposal: Omit<OrderConsolidationProposal, "contentHash"> | OrderConsolidationProposal) {
  const { contentHash: _hash, integrity: _integrity, ...content } = proposal as OrderConsolidationProposal;
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export function verifyOrderConsolidationProposal(proposal: OrderConsolidationProposal) {
  return { ...proposal, integrity: hashOrderConsolidationProposal(proposal) === proposal.contentHash ? "VERIFIED" as const : "FAILED" as const };
}

export function buildOrderConsolidationProposal(input: { workspaceId: string; orders: OrderRecord[]; proposals: Map<string, OrderPlanningProposal>; actor: string; now?: string }) {
  const buckets = new Map<string, Array<{ order: OrderRecord; proposal: OrderPlanningProposal; leg: RoutePlanLeg }>>();
  const excludedOrders: OrderConsolidationProposal["excludedOrders"] = [];
  for (const order of input.orders.filter((item) => item.workspaceId === input.workspaceId && item.status === "READY_TO_PLAN")) {
    const proposal = input.proposals.get(order.orderId);
    const verified = proposal ? verifyOrderPlanningProposal(proposal) : null;
    const route = verified?.routePlans.find((item) => item.routePlanId === verified.recommendedRoutePlanId);
    if (!verified || verified.integrity !== "VERIFIED" || !route || route.disposition === "INELIGIBLE") {
      excludedOrders.push({ orderId: order.orderId, reason: "A current verified and eligible route plan is required." });
      continue;
    }
    for (const leg of route.legs) {
      const award = leg.candidate.activeAwards.find((item) => item.awardType === "PRIMARY") ?? leg.candidate.activeAwards[0];
      if (!award) { excludedOrders.push({ orderId: order.orderId, reason: `An active carrier award is required for ${leg.candidate.laneName}.` }); continue; }
      const baseKey = leg.role === "FINAL_MILE" ? route.finalMileGroupKey : route.consolidationKey;
      const key = [leg.role, baseKey, leg.plannedPickup, leg.plannedDelivery, clean(leg.candidate.laneSnapshot.equipmentType), award.carrier.externalPartnerId].join("|");
      buckets.set(key, [...(buckets.get(key) ?? []), { order, proposal: verified, leg }]);
    }
  }
  const groups: ConsolidationGroup[] = [...buckets.entries()].map(([groupKey, members]) => {
    const { leg } = members[0];
    const award = leg.candidate.activeAwards.find((item) => item.awardType === "PRIMARY") ?? leg.candidate.activeAwards[0];
    const rule = leg.candidate.capacityRule;
    const totalWeightLbs = Math.round(members.reduce((sum, item) => sum + (weightInPounds(item.order.weight, item.order.weightUom) ?? 0), 0) * 100) / 100;
    const totalPallets = members.reduce((sum, item) => sum + (Number(item.order.palletQuantity) || 0), 0);
    const capacityExceeded = Boolean(rule && (totalWeightLbs > rule.maxWeightLbs || totalPallets > rule.maxPallets));
    const status: ConsolidationGroup["status"] = capacityExceeded ? "CAPACITY_EXCEEDED" : members.length > 1 ? "READY" : "SINGLE_ORDER";
    const findings: ConsolidationGroup["findings"] = capacityExceeded
      ? [{ severity: "BLOCKER", code: "CONSOLIDATED_CAPACITY_EXCEEDED", message: `Combined demand exceeds the ${rule?.equipmentType} limit of ${rule?.maxWeightLbs.toLocaleString("en-US")} LBS or ${rule?.maxPallets} pallets.` }]
      : [{ severity: "INFO", code: members.length > 1 ? "CONSOLIDATION_READY" : "SINGLE_ORDER_GROUP", message: members.length > 1 ? `${members.length} compatible orders can share this scheduled load.` : "This scheduled leg currently contains one order." }];
    return {
      groupId: randomUUID(), groupKey, role: leg.role, laneType: leg.candidate.laneType, laneId: leg.candidate.laneId, laneName: leg.candidate.laneName,
      orderIds: members.map(({ order }) => order.orderId), orderMeids: members.map(({ order }) => clean(order.silTestMeid || order.meid)).filter(Boolean),
      sourceProposalIds: members.map(({ proposal }) => proposal.proposalId), sourceProposalHashes: members.map(({ proposal }) => proposal.contentHash),
      plannedPickup: leg.plannedPickup, plannedDelivery: leg.plannedDelivery, equipmentType: clean(leg.candidate.laneSnapshot.equipmentType),
      loadAssumption: clean(leg.candidate.laneSnapshot.loadAssumption), originFacilityId: clean(leg.candidate.laneSnapshot.originFacilityId), destinationFacilityId: clean(leg.candidate.laneSnapshot.destinationFacilityId),
      businessUnitId: clean(leg.candidate.laneSnapshot.businessUnitId), businessUnitName: clean(leg.candidate.laneSnapshot.businessUnitName),
      carrierId: award.carrier.externalPartnerId, carrierName: award.carrier.scac || award.carrier.name,
      award,
      totalWeightLbs, totalPallets, maxWeightLbs: rule?.maxWeightLbs ?? null, maxPallets: rule?.maxPallets ?? null,
      utilization: { weightPercent: rule ? Math.round(totalWeightLbs / rule.maxWeightLbs * 1000) / 10 : null, palletPercent: rule ? Math.round(totalPallets / rule.maxPallets * 1000) / 10 : null },
      status, findings,
    };
  }).sort((a, b) => a.plannedPickup.localeCompare(b.plannedPickup) || a.laneName.localeCompare(b.laneName));
  const withoutHash: Omit<OrderConsolidationProposal, "contentHash"> = {
    schemaVersion: ORDER_CONSOLIDATION_SCHEMA_VERSION, consolidationProposalId: randomUUID(), workspaceId: input.workspaceId, status: "PENDING_REVIEW",
    orderSnapshots: input.orders.filter((order) => groups.some((group) => group.orderIds.includes(order.orderId))).map((order) => JSON.parse(JSON.stringify(order))),
    groups, excludedOrders, createdBy: input.actor, createdAt: input.now ?? new Date().toISOString(),
  };
  return { ...withoutHash, contentHash: hashOrderConsolidationProposal(withoutHash) };
}

export async function saveOrderConsolidationProposal(proposal: OrderConsolidationProposal) {
  if (isFirestorePrimaryEnabled()) await intakeCollection(proposal.workspaceId, "orderConsolidationProposals").doc(proposal.consolidationProposalId).create(JSON.parse(JSON.stringify(proposal)));
  else localProposals.set(proposal.workspaceId, [...(localProposals.get(proposal.workspaceId) ?? []), proposal]);
}

export async function listOrderConsolidationProposals(workspaceId: string) {
  const records = isFirestorePrimaryEnabled()
    ? (await intakeCollection(workspaceId, "orderConsolidationProposals").get()).docs.map((doc) => doc.data() as OrderConsolidationProposal)
    : localProposals.get(workspaceId) ?? [];
  return records.filter((item) => item.workspaceId === workspaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(verifyOrderConsolidationProposal);
}

export function hashOrderConsolidationDecision(decision: Omit<OrderConsolidationDecision, "contentHash"> | OrderConsolidationDecision) {
  const { contentHash: _hash, integrity: _integrity, ...content } = decision as OrderConsolidationDecision;
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export function verifyOrderConsolidationDecision(decision: OrderConsolidationDecision) {
  return { ...decision, integrity: hashOrderConsolidationDecision(decision) === decision.contentHash ? "VERIFIED" as const : "FAILED" as const };
}

export function buildOrderConsolidationDecision(input: { proposal: OrderConsolidationProposal; decision: "APPROVED" | "REJECTED"; reason?: string; actor: string; now?: string }) {
  const verified = verifyOrderConsolidationProposal(input.proposal);
  if (verified.integrity !== "VERIFIED") throw new Error("Only an integrity-verified consolidation proposal can be decided.");
  if (input.decision === "REJECTED" && !clean(input.reason)) throw new Error("A reason is required when rejecting a consolidation proposal.");
  if (input.decision === "APPROVED" && (!verified.groups.length || verified.groups.some((group) => group.status === "CAPACITY_EXCEEDED"))) throw new Error("Resolve all consolidation blockers before approval.");
  const decisionId = randomUUID();
  const decidedAt = input.now ?? new Date().toISOString();
  const loadIds = input.decision === "APPROVED" ? verified.groups.map(() => randomUUID()) : [];
  const withoutHash: Omit<OrderConsolidationDecision, "contentHash"> = {
    schemaVersion: "1.0", decisionId, workspaceId: verified.workspaceId, consolidationProposalId: verified.consolidationProposalId,
    consolidationProposalContentHash: verified.contentHash, decision: input.decision, reason: clean(input.reason) || null,
    plannedLoadIds: loadIds, decidedBy: input.actor, decidedAt,
  };
  const decision = { ...withoutHash, contentHash: hashOrderConsolidationDecision(withoutHash) };
  const loads: PlannedLoadRecord[] = input.decision === "APPROVED" ? verified.groups.map((group, index) => ({
    schemaVersion: "1.0", loadId: loadIds[index], displayId: `SIL-${loadIds[index].replace(/-/g, "").slice(0, 10).toUpperCase()}`,
    workspaceId: verified.workspaceId, status: "PLANNED", sourceProposalId: verified.consolidationProposalId,
    sourceProposalContentHash: verified.contentHash, planningDecisionId: decisionId, orderIds: group.orderIds, orderMeids: group.orderMeids,
    laneId: group.laneId, laneName: group.laneName, laneType: group.laneType,
    originFacilityId: group.originFacilityId, destinationFacilityId: group.destinationFacilityId, businessUnitId: group.businessUnitId,
    businessUnitName: group.businessUnitName, equipmentType: group.equipmentType, loadAssumption: group.loadAssumption,
    carrier: group.award.carrier, award: group.award, plannedPickup: group.plannedPickup, plannedDelivery: group.plannedDelivery,
    createdBy: input.actor, createdAt: decidedAt,
  })) : [];
  return { decision, loads };
}

export async function getOrderConsolidationDecision(workspaceId: string, proposalId: string) {
  if (!isFirestorePrimaryEnabled()) {
    const decision = localDecisions.get(`${workspaceId}:${proposalId}`);
    return decision ? verifyOrderConsolidationDecision(decision) : null;
  }
  const snapshot = await intakeCollection(workspaceId, "orderConsolidationDecisions").doc(proposalId).get();
  const decision = snapshot.data() as OrderConsolidationDecision | undefined;
  return decision?.workspaceId === workspaceId ? verifyOrderConsolidationDecision(decision) : null;
}

export function registerLocalOrderConsolidationDecision(decision: OrderConsolidationDecision) {
  localDecisions.set(`${decision.workspaceId}:${decision.consolidationProposalId}`, decision);
}
