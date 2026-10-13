import { randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import type { AwardRecord, EligibilityRecord, LaneRecord, LaneType } from "../routes/lanes";
import type { OrderRecord } from "../routes/orders";

export type PlanningFinding = {
  category: "ROUTE" | "BUSINESS_UNIT" | "SERVICE_TYPE" | "MODE" | "EQUIPMENT" | "EFFECTIVE_DATE" | "PICKUP_SCHEDULE" | "DELIVERY_SCHEDULE" | "ELIGIBILITY" | "AWARD";
  severity: "BLOCKER" | "WARNING" | "INFO";
  code: string;
  message: string;
  scoreImpact: number;
};

export type PlanningCarrier = {
  externalPartnerId: string;
  name: string;
  scac?: string;
};

export type PlanningAward = {
  awardId: string;
  awardType: string;
  rate: number;
  currency: string;
  rateUnit: string;
  effectiveFrom: string;
  effectiveTo?: string;
  carrier: PlanningCarrier;
};

export type LaneMatchCandidate = {
  laneId: string;
  laneName: string;
  laneType: LaneType;
  score: number;
  disposition: "MATCH" | "REVIEW" | "INELIGIBLE";
  findings: PlanningFinding[];
  eligibleCarriers: PlanningCarrier[];
  activeAwards: PlanningAward[];
  laneSnapshot: Pick<LaneRecord, "originFacilityId" | "destinationFacilityId" | "businessUnitId" | "businessUnitName" | "equipmentType" | "loadAssumption" | "dispatchDays" | "terminalArrivalDays" | "storeDeliveryDays" | "effectiveFrom" | "effectiveTo">;
};

export type OrderPlanningProposal = {
  proposalId: string;
  workspaceId: string;
  orderId: string;
  orderMeid?: string;
  status: "PENDING_REVIEW";
  outcome: "MATCHED" | "REVIEW_REQUIRED" | "NO_MATCH";
  recommendedLaneId?: string;
  candidates: LaneMatchCandidate[];
  createdBy: string;
  createdAt: string;
};

type PartnerRecord = { id?: string; externalPartnerId?: string; name?: string; organizationName?: string; scac?: string };
const localProposals = new Map<string, OrderPlanningProposal[]>();
const clean = (value: unknown) => String(value ?? "").trim();
const comparable = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const datePart = (value: unknown) => clean(value).slice(0, 10);
const timePart = (value: unknown) => clean(value).slice(11, 16);
const weekday = (value: unknown) => {
  const date = datePart(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][new Date(`${date}T12:00:00Z`).getUTCDay()];
};
const intendedLaneTypes = (orderType: unknown): LaneType[] => {
  switch (clean(orderType).toUpperCase()) {
    case "INBOUND": return ["INBOUND"];
    case "ADHOC": return ["ADHOC"];
    case "LINEHAUL": return ["LINEHAUL"];
    case "FINAL_MILE": return ["FINAL_MILE"];
    default: return ["LINEHAUL", "FINAL_MILE"];
  }
};
const modeAssumption = (value: unknown) => clean(value).toUpperCase() === "TL" ? "TL" : clean(value).toUpperCase() === "LTL" ? "LTL" : "";
const partnerId = (partner: PartnerRecord) => clean(partner.id || partner.externalPartnerId);

function addFinding(findings: PlanningFinding[], finding: PlanningFinding) {
  findings.push(finding);
}

export function scoreOrderLane(input: {
  order: OrderRecord;
  lane: LaneRecord;
  eligibility: EligibilityRecord[];
  awards: AwardRecord[];
  partners: PartnerRecord[];
}): LaneMatchCandidate {
  const { order, lane } = input;
  const findings: PlanningFinding[] = [];
  let score = 100;
  const assess = (matches: boolean, finding: PlanningFinding) => { if (!matches) { score -= finding.scoreImpact; addFinding(findings, finding); } };

  assess(comparable(order.originId) === comparable(lane.originFacilityId) && comparable(order.destinationId) === comparable(lane.destinationFacilityId), {
    category: "ROUTE", severity: "BLOCKER", code: "ROUTE_MISMATCH", message: "Order origin and destination do not match this lane.", scoreImpact: 35,
  });
  assess([lane.businessUnitId, lane.businessUnitName].some((value) => comparable(value) === comparable(order.businessUnit)), {
    category: "BUSINESS_UNIT", severity: "BLOCKER", code: "BUSINESS_UNIT_MISMATCH", message: "Order business unit does not match this lane.", scoreImpact: 15,
  });
  assess(intendedLaneTypes(order.orderType).includes(lane.laneType), {
    category: "SERVICE_TYPE", severity: "BLOCKER", code: "SERVICE_TYPE_MISMATCH", message: `Order type is not compatible with ${lane.laneType.toLowerCase().replace("_", " ")}.`, scoreImpact: 10,
  });
  assess(!modeAssumption(order.modeType) || !lane.loadAssumption || modeAssumption(order.modeType) === lane.loadAssumption, {
    category: "MODE", severity: "BLOCKER", code: "MODE_MISMATCH", message: `Order mode ${clean(order.modeType) || "not set"} does not match lane assumption ${lane.loadAssumption || "not set"}.`, scoreImpact: 10,
  });
  assess(!clean(order.equipmentType) || !lane.equipmentType || comparable(order.equipmentType) === comparable(lane.equipmentType), {
    category: "EQUIPMENT", severity: "BLOCKER", code: "EQUIPMENT_MISMATCH", message: `Order equipment ${clean(order.equipmentType)} does not match lane equipment ${lane.equipmentType}.`, scoreImpact: 10,
  });

  const pickupDate = datePart(order.earliestPickup);
  const deliveryDate = datePart(order.latestDelivery);
  assess((!lane.effectiveFrom || pickupDate >= lane.effectiveFrom) && (!lane.effectiveTo || deliveryDate <= lane.effectiveTo), {
    category: "EFFECTIVE_DATE", severity: "BLOCKER", code: "OUTSIDE_EFFECTIVE_PERIOD", message: "Order pickup or delivery is outside the lane effective period.", scoreImpact: 8,
  });
  assess(!lane.dispatchDays?.length || lane.dispatchDays.includes(weekday(order.earliestPickup)), {
    category: "PICKUP_SCHEDULE", severity: "WARNING", code: "PICKUP_DAY_MISMATCH", message: `Pickup falls on ${weekday(order.earliestPickup) || "an unknown day"}, outside the lane dispatch schedule.`, scoreImpact: 5,
  });
  const deliveryDays = lane.laneType === "FINAL_MILE" ? lane.storeDeliveryDays : lane.terminalArrivalDays;
  assess(!deliveryDays?.length || deliveryDays.includes(weekday(order.latestDelivery)), {
    category: "DELIVERY_SCHEDULE", severity: "WARNING", code: "DELIVERY_DAY_MISMATCH", message: `Delivery falls on ${weekday(order.latestDelivery) || "an unknown day"}, outside the lane delivery schedule.`, scoreImpact: 5,
  });
  if (lane.laneType === "LINEHAUL" && lane.standardCarrierArrivalStart && lane.standardCarrierArrivalEnd && timePart(order.earliestPickup)) {
    assess(timePart(order.earliestPickup) >= lane.standardCarrierArrivalStart && timePart(order.earliestPickup) <= lane.standardCarrierArrivalEnd, {
      category: "PICKUP_SCHEDULE", severity: "WARNING", code: "PICKUP_TIME_MISMATCH", message: `Pickup time is outside the carrier arrival/load window of ${lane.standardCarrierArrivalStart} to ${lane.standardCarrierArrivalEnd}.`, scoreImpact: 4,
    });
  }
  if (lane.laneType !== "FINAL_MILE" && lane.terminalArrivalStart && lane.terminalArrivalEnd && timePart(order.latestDelivery)) {
    assess(timePart(order.latestDelivery) >= lane.terminalArrivalStart && timePart(order.latestDelivery) <= lane.terminalArrivalEnd, {
      category: "DELIVERY_SCHEDULE", severity: "WARNING", code: "DELIVERY_TIME_MISMATCH", message: `Delivery time is outside the destination terminal arrival window of ${lane.terminalArrivalStart} to ${lane.terminalArrivalEnd}.`, scoreImpact: 4,
    });
  }

  const eligibleRecords = input.eligibility.filter((item) => item.laneId === lane.laneId && item.status === "ELIGIBLE");
  const eligibleCarriers = eligibleRecords.map((item) => {
    const partner = input.partners.find((candidate) => partnerId(candidate) === item.externalPartnerId);
    return { externalPartnerId: item.externalPartnerId, name: clean(partner?.name || partner?.organizationName) || "Registered carrier", scac: clean(partner?.scac) || undefined };
  });
  if (!eligibleCarriers.length) addFinding(findings, { category: "ELIGIBILITY", severity: "WARNING", code: "NO_ELIGIBLE_CARRIERS", message: "No eligible carriers are assigned to this lane.", scoreImpact: 0 });

  const activeAwards = input.awards
    .filter((award) => award.laneId === lane.laneId && award.status === "ACTIVE" && (!award.effectiveFrom || pickupDate >= award.effectiveFrom) && (!award.effectiveTo || pickupDate <= award.effectiveTo))
    .map((award) => {
      const partner = input.partners.find((candidate) => partnerId(candidate) === award.externalPartnerId);
      return {
        awardId: award.awardId, awardType: award.awardType, rate: award.rate, currency: award.currency, rateUnit: award.rateUnit,
        effectiveFrom: award.effectiveFrom, effectiveTo: award.effectiveTo,
        carrier: { externalPartnerId: award.externalPartnerId, name: clean(partner?.name || partner?.organizationName) || "Registered carrier", scac: clean(partner?.scac) || undefined },
      };
    });
  if (!activeAwards.length) addFinding(findings, { category: "AWARD", severity: "WARNING", code: "NO_ACTIVE_AWARD", message: "No carrier award is active for the order pickup date.", scoreImpact: 0 });
  const blockerCount = findings.filter((finding) => finding.severity === "BLOCKER").length;
  const warningCount = findings.filter((finding) => finding.severity === "WARNING").length;
  return {
    laneId: lane.laneId,
    laneName: lane.name,
    laneType: lane.laneType,
    score: Math.max(0, score),
    disposition: blockerCount ? "INELIGIBLE" : warningCount ? "REVIEW" : "MATCH",
    findings,
    eligibleCarriers,
    activeAwards,
    laneSnapshot: {
      originFacilityId: lane.originFacilityId, destinationFacilityId: lane.destinationFacilityId,
      businessUnitId: lane.businessUnitId, businessUnitName: lane.businessUnitName,
      equipmentType: lane.equipmentType, loadAssumption: lane.loadAssumption, dispatchDays: lane.dispatchDays,
      terminalArrivalDays: lane.terminalArrivalDays, storeDeliveryDays: lane.storeDeliveryDays,
      effectiveFrom: lane.effectiveFrom, effectiveTo: lane.effectiveTo,
    },
  };
}

export function buildOrderPlanningProposal(input: {
  workspaceId: string;
  order: OrderRecord;
  lanes: LaneRecord[];
  eligibility: EligibilityRecord[];
  awards: AwardRecord[];
  partners: PartnerRecord[];
  actor: string;
}): OrderPlanningProposal {
  if (!input.workspaceId || input.order.workspaceId !== input.workspaceId) throw new Error("Order does not belong to the requested workspace.");
  const candidates = input.lanes
    .filter((lane) => lane.workspaceId === input.workspaceId && lane.status === "ACTIVE")
    .map((lane) => scoreOrderLane({ order: input.order, lane, eligibility: input.eligibility, awards: input.awards, partners: input.partners }))
    .sort((left, right) => right.score - left.score || left.laneName.localeCompare(right.laneName));
  const recommended = candidates.find((candidate) => candidate.disposition !== "INELIGIBLE");
  return {
    proposalId: randomUUID(), workspaceId: input.workspaceId, orderId: input.order.orderId,
    orderMeid: clean(input.order.silTestMeid || input.order.meid) || undefined,
    status: "PENDING_REVIEW",
    outcome: !recommended ? "NO_MATCH" : recommended.disposition === "MATCH" ? "MATCHED" : "REVIEW_REQUIRED",
    recommendedLaneId: recommended?.laneId,
    candidates: candidates.slice(0, 10), createdBy: input.actor, createdAt: new Date().toISOString(),
  };
}

export async function saveOrderPlanningProposal(proposal: OrderPlanningProposal) {
  if (isFirestorePrimaryEnabled()) {
    const stored = JSON.parse(JSON.stringify(proposal)) as OrderPlanningProposal;
    await intakeCollection(proposal.workspaceId, "orderPlanningProposals").doc(proposal.proposalId).create(stored);
  }
  else localProposals.set(proposal.workspaceId, [...(localProposals.get(proposal.workspaceId) ?? []), proposal]);
}

export async function getLatestOrderPlanningProposal(workspaceId: string, orderId: string) {
  const proposals = isFirestorePrimaryEnabled()
    ? (await intakeCollection(workspaceId, "orderPlanningProposals").where("orderId", "==", orderId).get()).docs.map((doc) => doc.data() as OrderPlanningProposal)
    : localProposals.get(workspaceId) ?? [];
  return proposals
    .filter((proposal) => proposal.workspaceId === workspaceId && proposal.orderId === orderId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}
