import { createHash, randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import type { OrderRecord } from "../routes/orders";
import { intakeCollection } from "./intake/intakeStore";
import { weightInPounds } from "./equipmentCapacity";
import { verifyOrderPlanningProposal, type OrderPlanningProposal, type RoutePlanLeg } from "./orderPlanningService";

export const ORDER_CONSOLIDATION_SCHEMA_VERSION = "1.0";

export type ConsolidationGroup = {
  groupId: string;
  groupKey: string;
  role: RoutePlanLeg["role"];
  laneId: string;
  laneName: string;
  orderIds: string[];
  orderMeids: string[];
  sourceProposalIds: string[];
  sourceProposalHashes: string[];
  plannedPickup: string;
  plannedDelivery: string;
  equipmentType: string;
  carrierId: string;
  carrierName: string;
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

const localProposals = new Map<string, OrderConsolidationProposal[]>();
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
      groupId: randomUUID(), groupKey, role: leg.role, laneId: leg.candidate.laneId, laneName: leg.candidate.laneName,
      orderIds: members.map(({ order }) => order.orderId), orderMeids: members.map(({ order }) => clean(order.silTestMeid || order.meid)).filter(Boolean),
      sourceProposalIds: members.map(({ proposal }) => proposal.proposalId), sourceProposalHashes: members.map(({ proposal }) => proposal.contentHash),
      plannedPickup: leg.plannedPickup, plannedDelivery: leg.plannedDelivery, equipmentType: clean(leg.candidate.laneSnapshot.equipmentType),
      carrierId: award.carrier.externalPartnerId, carrierName: award.carrier.scac || award.carrier.name,
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
