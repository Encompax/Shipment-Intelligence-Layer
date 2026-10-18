import { createHash, randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import type { OrderPlanningProposal, RoutePlanLeg } from "./orderPlanningService";

export type JourneySegment = {
  sequence: number;
  orderId: string;
  orderMeid?: string;
  proposalId: string;
  laneId: string;
  laneName: string;
  laneType: string;
  originFacilityId: string;
  destinationFacilityId: string;
  plannedPickup: string;
  plannedDelivery: string;
  disposition: string;
};

export type ShipmentJourney = {
  schemaVersion: "1.0";
  journeyId: string;
  workspaceId: string;
  orderIds: string[];
  status: "CONNECTED" | "REVIEW_REQUIRED";
  segments: JourneySegment[];
  findings: Array<{ severity: "WARNING" | "INFO"; code: string; message: string }>;
  createdBy: string;
  createdAt: string;
  contentHash: string;
  integrity?: "VERIFIED" | "FAILED";
};

const localJourneys = new Map<string, ShipmentJourney[]>();
const comparable = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
const hash = (value: Record<string, unknown>) => createHash("sha256").update(canonical(value)).digest("hex");

function selectedLegs(proposal: OrderPlanningProposal) {
  const route = proposal.routePlans.find((item) => item.routePlanId === proposal.recommendedRoutePlanId) ?? proposal.routePlans[0];
  return (route?.legs ?? []).map((leg) => ({ proposal, leg }));
}

export function buildShipmentJourney(input: { workspaceId: string; proposals: OrderPlanningProposal[]; actor: string; now?: string }): ShipmentJourney {
  if (input.proposals.length < 2) throw new Error("Select at least two matched orders to build a shipment journey.");
  if (input.proposals.some((proposal) => proposal.workspaceId !== input.workspaceId || proposal.integrity !== "VERIFIED")) throw new Error("Every journey order requires verified tenant-scoped planning evidence.");
  const nodes = input.proposals.flatMap(selectedLegs);
  if (nodes.length < 2) throw new Error("At least two planned route segments are required.");
  const destinations = new Set(nodes.map(({ leg }) => comparable(leg.candidate.laneSnapshot.destinationFacilityId)));
  const roots = nodes.filter(({ leg }) => !destinations.has(comparable(leg.candidate.laneSnapshot.originFacilityId)));
  const assigned = new Map<number, number>();
  (roots.length ? roots : [nodes[0]]).forEach((root) => assigned.set(nodes.indexOf(root), 1));
  let changed = true;
  while (changed) {
    changed = false;
    nodes.forEach(({ leg }, index) => {
      if (assigned.has(index)) return;
      const parentSequences = nodes.flatMap(({ leg: parent }, parentIndex) => assigned.has(parentIndex) && comparable(parent.candidate.laneSnapshot.destinationFacilityId) === comparable(leg.candidate.laneSnapshot.originFacilityId) ? [assigned.get(parentIndex)!] : []);
      if (parentSequences.length) { assigned.set(index, Math.min(...parentSequences) + 1); changed = true; }
    });
  }
  const disconnectedCount = nodes.length - assigned.size;
  nodes.forEach((_, index) => { if (!assigned.has(index)) assigned.set(index, Math.max(0, ...assigned.values()) + 1); });
  const ordered = nodes.map((node, index) => ({ ...node, sequence: assigned.get(index)! })).sort((a, b) => a.sequence - b.sequence || a.leg.plannedPickup.localeCompare(b.leg.plannedPickup));
  const segments = ordered.map(({ proposal, leg, sequence }) => ({
    sequence, orderId: proposal.orderId, orderMeid: proposal.orderMeid, proposalId: proposal.proposalId,
    laneId: leg.candidate.laneId, laneName: leg.candidate.laneName, laneType: leg.candidate.laneType,
    originFacilityId: leg.candidate.laneSnapshot.originFacilityId, destinationFacilityId: leg.candidate.laneSnapshot.destinationFacilityId,
    plannedPickup: leg.plannedPickup, plannedDelivery: leg.plannedDelivery, disposition: leg.candidate.disposition,
  }));
  const hasMultipleRoots = roots.length > 1;
  const gapCount = disconnectedCount + (hasMultipleRoots ? roots.length - 1 : 0);
  const findings = gapCount ? [{ severity: "WARNING" as const, code: "JOURNEY_HANDOFF_GAP", message: `${gapCount} route branch${gapCount === 1 ? "" : "es"} cannot be traced to the same upstream handoff and require review.` }] : [{ severity: "INFO" as const, code: "JOURNEY_CONNECTED", message: "Every segment connects through a shared facility handoff. Parallel branches share the same segment number." }];
  const base = { schemaVersion: "1.0" as const, journeyId: randomUUID(), workspaceId: input.workspaceId, orderIds: [...new Set(segments.map((segment) => segment.orderId))], status: gapCount ? "REVIEW_REQUIRED" as const : "CONNECTED" as const, segments, findings, createdBy: input.actor, createdAt: input.now ?? new Date().toISOString() };
  return { ...base, contentHash: hash(base) };
}

export async function saveShipmentJourney(journey: ShipmentJourney) {
  if (isFirestorePrimaryEnabled()) await intakeCollection(journey.workspaceId, "shipmentJourneys").doc(journey.journeyId).create(journey);
  else localJourneys.set(journey.workspaceId, [journey, ...(localJourneys.get(journey.workspaceId) ?? [])]);
}

export async function listShipmentJourneys(workspaceId: string, orderId?: string) {
  const records = isFirestorePrimaryEnabled()
    ? (await (orderId ? intakeCollection(workspaceId, "shipmentJourneys").where("orderIds", "array-contains", orderId) : intakeCollection(workspaceId, "shipmentJourneys")).get()).docs.map((doc) => doc.data() as ShipmentJourney)
    : (localJourneys.get(workspaceId) ?? []).filter((journey) => !orderId || journey.orderIds.includes(orderId));
  return records.filter((journey) => journey.workspaceId === workspaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((journey) => {
    const { contentHash, integrity: _integrity, ...base } = journey;
    return { ...journey, integrity: contentHash === hash(base) ? "VERIFIED" as const : "FAILED" as const };
  });
}
