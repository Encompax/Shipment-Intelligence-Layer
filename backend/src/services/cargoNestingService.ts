import { createHash, randomUUID } from "crypto";
import type { OrderRecord } from "../routes/orders";
import type { AwardRecord, LaneRecord } from "../routes/lanes";
import { getEquipmentCapacityRule, weightInPounds } from "./equipmentCapacity";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import { calculateRouteSchedule } from "./orderPlanningService";

const clean = (value: unknown) => String(value ?? "").trim();
const comparable = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.entries(value as Record<string, unknown>).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;

export type CargoAllocationInput = { orderId: string; weightLbs?: number; pallets?: number; cases?: number; eaches?: number; attributes?: Record<string, string> };
export type CargoNestingProposal = {
  schemaVersion: "1.0"; cargoNestingId: string; workspaceId: string; status: "PENDING_REVIEW";
  parentOrder: Record<string, unknown>; parentLane: { laneId: string; name: string; originFacilityId: string; destinationFacilityId: string; equipmentType: string; plannedPickup: string; plannedDelivery: string };
  allocations: Array<{ allocationId: string; orderId: string; sourceOrderUpdatedAt: string; orderMeid: string; reference: string; destinationFacilityId: string; finalMileLaneId: string; finalMileLaneName: string; plannedPickup: string; plannedDelivery: string; weightLbs: number; pallets: number; cases: number; eaches: number; attributes: Record<string,string>; custody: Array<{ sequence: number; event: string; facilityId: string; status: string; expectedAt: string }> }>;
  capacity: { manifestWeightLbs: number; manifestPallets: number; allocatedWeightLbs: number; allocatedPallets: number; maxWeightLbs: number | null; maxPallets: number | null; weightPercent: number | null; palletPercent: number | null };
  findings: Array<{ severity: "BLOCKER" | "WARNING" | "INFO"; code: string; message: string }>;
  filters: string[]; visibleFields: string[]; createdBy: string; createdAt: string; contentHash: string;
};
const localProposals = new Map<string, CargoNestingProposal[]>();

export function buildCargoNestingProposal(input: { workspaceId: string; parent: OrderRecord; children: OrderRecord[]; allocations: CargoAllocationInput[]; lanes: LaneRecord[]; awards: AwardRecord[]; actor: string; filters?: string[]; visibleFields?: string[]; now?: string }): CargoNestingProposal {
  if (input.parent.workspaceId !== input.workspaceId || input.children.some((order) => order.workspaceId !== input.workspaceId)) throw new Error("Cargo nesting records must belong to the authenticated workspace.");
  const parentLane = input.lanes.find((lane) => lane.status === "ACTIVE" && lane.laneType === "LINEHAUL" && comparable(lane.originFacilityId) === comparable(input.parent.originId) && comparable(lane.destinationFacilityId) === comparable(input.parent.destinationId));
  if (!parentLane) throw new Error("The parent order requires an active Linehaul lane connecting its origin and cross-dock destination.");
  const findings: CargoNestingProposal["findings"] = [];
  const parentSchedule = calculateRouteSchedule(input.parent, [parentLane]);
  if (parentSchedule.finalDeliveryAt > clean(input.parent.latestDelivery)) findings.push({ severity: "BLOCKER", code: "LINEHAUL_COMMITMENT_MISSED", message: `The Linehaul reaches the cross-dock at ${parentSchedule.finalDeliveryAt}, after its commitment of ${clean(input.parent.latestDelivery)}.` });
  const allocations = input.allocations.map((requested) => {
    const order = input.children.find((candidate) => candidate.orderId === requested.orderId);
    if (!order) throw new Error("Every cargo allocation must reference a selected tenant order.");
    const finalMileLane = input.lanes.find((lane) => lane.status === "ACTIVE" && lane.laneType === "FINAL_MILE" && comparable(lane.originFacilityId) === comparable(parentLane.destinationFacilityId) && comparable(lane.destinationFacilityId) === comparable(order.destinationId));
    if (!finalMileLane) findings.push({ severity: "BLOCKER", code: "FINAL_MILE_LANE_REQUIRED", message: `${clean(order.primaryReference)} has no active Final Mile lane from the parent cross-dock to its destination.` });
    else if (!input.awards.some((award) => award.status === "ACTIVE" && award.laneId === finalMileLane.laneId)) findings.push({ severity: "WARNING", code: "FINAL_MILE_AWARD_REQUIRED", message: `${finalMileLane.name} has no active carrier award.` });
    const downstreamOrder = { ...order, earliestPickup: parentSchedule.finalDeliveryAt } as OrderRecord;
    const downstreamSchedule = finalMileLane ? calculateRouteSchedule(downstreamOrder, [finalMileLane]) : { legs: [{ plannedPickup: "", plannedDelivery: "" }], finalDeliveryAt: "" };
    if (finalMileLane && downstreamSchedule.finalDeliveryAt > clean(order.latestDelivery)) findings.push({ severity: "BLOCKER", code: "FINAL_MILE_COMMITMENT_MISSED", message: `${clean(order.primaryReference)} cannot depart until the Linehaul handoff and would deliver at ${downstreamSchedule.finalDeliveryAt}, after its commitment of ${clean(order.latestDelivery)}.` });
    const numericValues = [requested.weightLbs, requested.pallets, requested.cases, requested.eaches].filter((value) => value !== undefined);
    if (numericValues.some((value) => !Number.isFinite(value) || Number(value) < 0)) throw new Error("Cargo allocation quantities must be non-negative numbers.");
    const attributes = Object.fromEntries(Object.entries(requested.attributes ?? {}).slice(0, 20).map(([key, value]) => [clean(key).slice(0, 80), clean(value).slice(0, 500)]).filter(([key]) => key));
    return {
      allocationId: randomUUID(), orderId: order.orderId, sourceOrderUpdatedAt: clean(order.updatedAt), orderMeid: clean(order.silTestMeid || order.meid), reference: clean(order.primaryReference), destinationFacilityId: clean(order.destinationId),
      finalMileLaneId: finalMileLane?.laneId ?? "", finalMileLaneName: finalMileLane?.name ?? "Lane required",
      plannedPickup: downstreamSchedule.legs[0].plannedPickup, plannedDelivery: downstreamSchedule.legs[0].plannedDelivery,
      weightLbs: requested.weightLbs ?? weightInPounds(order.weight, order.weightUom) ?? 0, pallets: requested.pallets ?? Number(order.palletQuantity || 0), cases: requested.cases ?? Number(order.caseQuantity || 0), eaches: requested.eaches ?? Number(order.eachQuantity || 0), attributes,
      custody: [
        { sequence: 1, event: "ALLOCATED_TO_LINEHAUL", facilityId: clean(parentLane.originFacilityId), status: "PLANNED", expectedAt: parentSchedule.legs[0].plannedPickup },
        { sequence: 2, event: "IN_TRANSIT_IN_PARENT_LOAD", facilityId: clean(parentLane.destinationFacilityId), status: "PLANNED", expectedAt: parentSchedule.legs[0].plannedPickup },
        { sequence: 3, event: "CROSSDOCK_RECEIPT", facilityId: clean(parentLane.destinationFacilityId), status: "PENDING", expectedAt: parentSchedule.finalDeliveryAt },
        { sequence: 4, event: "AVAILABLE_FOR_FINAL_MILE", facilityId: clean(parentLane.destinationFacilityId), status: "PENDING", expectedAt: downstreamSchedule.legs[0].plannedPickup },
      ],
    };
  });
  const allocatedWeightLbs = allocations.reduce((sum, item) => sum + item.weightLbs, 0);
  const allocatedPallets = allocations.reduce((sum, item) => sum + item.pallets, 0);
  const manifestWeightLbs = weightInPounds(input.parent.weight, input.parent.weightUom) ?? 0;
  const manifestPallets = Number(input.parent.palletQuantity || 0);
  const capacityRule = getEquipmentCapacityRule(parentLane.equipmentType);
  if (allocatedWeightLbs > manifestWeightLbs || allocatedPallets > manifestPallets) findings.push({ severity: "BLOCKER", code: "ALLOCATION_EXCEEDS_MANIFEST", message: "Nested cargo exceeds the parent Linehaul manifest total. Increase the manifest or reduce child allocations." });
  if (capacityRule && (manifestWeightLbs > capacityRule.maxWeightLbs || manifestPallets > capacityRule.maxPallets)) findings.push({ severity: "BLOCKER", code: "LINEHAUL_CAPACITY_EXCEEDED", message: `The parent manifest exceeds ${capacityRule.maxWeightLbs.toLocaleString()} LBS or ${capacityRule.maxPallets} pallets for ${capacityRule.equipmentType}.` });
  if (!input.awards.some((award) => award.status === "ACTIVE" && award.laneId === parentLane.laneId)) findings.push({ severity: "WARNING", code: "LINEHAUL_AWARD_REQUIRED", message: `${parentLane.name} has no active carrier award.` });
  if (!findings.some((finding) => finding.severity === "BLOCKER")) findings.push({ severity: "INFO", code: "CARGO_NESTING_READY", message: `${allocations.length} downstream order${allocations.length === 1 ? " is" : "s are"} nested within the Linehaul manifest for governed review.` });
  const withoutHash = {
    schemaVersion: "1.0" as const, cargoNestingId: randomUUID(), workspaceId: input.workspaceId, status: "PENDING_REVIEW" as const,
    parentOrder: JSON.parse(JSON.stringify(input.parent)), parentLane: { laneId: parentLane.laneId, name: parentLane.name, originFacilityId: parentLane.originFacilityId, destinationFacilityId: parentLane.destinationFacilityId, equipmentType: clean(parentLane.equipmentType), plannedPickup: parentSchedule.legs[0].plannedPickup, plannedDelivery: parentSchedule.legs[0].plannedDelivery }, allocations,
    capacity: { manifestWeightLbs, manifestPallets, allocatedWeightLbs, allocatedPallets, maxWeightLbs: capacityRule?.maxWeightLbs ?? null, maxPallets: capacityRule?.maxPallets ?? null, weightPercent: capacityRule ? Math.round(manifestWeightLbs / capacityRule.maxWeightLbs * 1000) / 10 : null, palletPercent: capacityRule ? Math.round(manifestPallets / capacityRule.maxPallets * 1000) / 10 : null },
    findings, filters: input.filters ?? [], visibleFields: input.visibleFields ?? ["reference","destination","weight","pallets","lane","custody"], createdBy: input.actor, createdAt: input.now ?? new Date().toISOString(),
  };
  return { ...withoutHash, contentHash: createHash("sha256").update(canonical(withoutHash)).digest("hex") };
}

export async function saveCargoNestingProposal(proposal: CargoNestingProposal) {
  if (isFirestorePrimaryEnabled()) await intakeCollection(proposal.workspaceId, "cargoNestingProposals").doc(proposal.cargoNestingId).create(JSON.parse(JSON.stringify(proposal)));
  else localProposals.set(proposal.workspaceId, [...(localProposals.get(proposal.workspaceId) ?? []), proposal]);
}

export async function listCargoNestingProposals(workspaceId: string) {
  const records = isFirestorePrimaryEnabled()
    ? (await intakeCollection(workspaceId, "cargoNestingProposals").get()).docs.map((doc) => doc.data() as CargoNestingProposal)
    : localProposals.get(workspaceId) ?? [];
  return records.filter((item) => item.workspaceId === workspaceId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
