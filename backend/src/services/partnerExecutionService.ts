import { createHash, randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import { listTenderQueue } from "./tenderQueueService";

export type ExecutionStatus = "CARRIER_ACCEPTED" | "DISPATCHED" | "AT_PICKUP" | "IN_TRANSIT" | "DELIVERED";
export type ExecutionEventType = "DISPATCH_CONFIRMED" | "ARRIVED_PICKUP" | "PICKED_UP" | "IN_TRANSIT" | "ETA_UPDATED" | "DELIVERED";
export type PartnerExecutionEvent = { schemaVersion: "1.0"; eventId: string; workspaceId: string; loadId: string; tenderId: string; externalPartnerId: string; eventType: ExecutionEventType; priorStatus: ExecutionStatus; resultingStatus: ExecutionStatus; estimatedArrival: string | null; location: string | null; note: string | null; reportedBy: string; occurredAt: string; recordedAt: string; contentHash: string; integrity?: "VERIFIED" | "FAILED" };
export type PartnerExecutionState = { workspaceId: string; loadId: string; externalPartnerId: string; status: ExecutionStatus; latestEta: string | null; latestEventId: string | null; updatedAt: string };

const transitions: Record<ExecutionEventType, { from: ExecutionStatus[]; to?: ExecutionStatus }> = {
  DISPATCH_CONFIRMED: { from: ["CARRIER_ACCEPTED"], to: "DISPATCHED" }, ARRIVED_PICKUP: { from: ["DISPATCHED"], to: "AT_PICKUP" },
  PICKED_UP: { from: ["DISPATCHED", "AT_PICKUP"], to: "IN_TRANSIT" }, IN_TRANSIT: { from: ["IN_TRANSIT"] },
  ETA_UPDATED: { from: ["CARRIER_ACCEPTED", "DISPATCHED", "AT_PICKUP", "IN_TRANSIT"] }, DELIVERED: { from: ["IN_TRANSIT"], to: "DELIVERED" },
};
const localEvents = new Map<string, PartnerExecutionEvent[]>();
const localStates = new Map<string, PartnerExecutionState>();
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
const hash = (value: Record<string, unknown>) => createHash("sha256").update(canonical(value)).digest("hex");
const withoutHash = (event: PartnerExecutionEvent) => Object.fromEntries(Object.entries(event).filter(([key]) => !["contentHash", "integrity"].includes(key)));

export function applyExecutionTransition(status: ExecutionStatus, eventType: ExecutionEventType) {
  const transition = transitions[eventType];
  if (!transition || !transition.from.includes(status)) throw new Error(`Execution event ${eventType} is not allowed while the load is ${status}.`);
  return transition.to || status;
}

async function acceptedLoad(workspaceId: string, externalPartnerId: string, loadId: string) {
  const item = (await listTenderQueue(workspaceId)).find((entry) => entry.load.loadId === loadId && entry.load.carrier.externalPartnerId === externalPartnerId && entry.state.status === "ACCEPTED");
  if (!item) throw new Error("An accepted tender assigned to this partner is required.");
  return item;
}

export async function listPartnerActiveLoads(workspaceId: string, externalPartnerId: string) {
  const queue = (await listTenderQueue(workspaceId)).filter((entry) => entry.load.carrier.externalPartnerId === externalPartnerId && entry.state.status === "ACCEPTED");
  const states = isFirestorePrimaryEnabled() ? (await intakeCollection(workspaceId, "partnerExecutionState").get()).docs.map((doc) => doc.data() as PartnerExecutionState) : [...localStates.values()].filter((state) => state.workspaceId === workspaceId);
  const events = isFirestorePrimaryEnabled() ? (await intakeCollection(workspaceId, "partnerExecutionEvents").get()).docs.map((doc) => doc.data() as PartnerExecutionEvent) : (localEvents.get(workspaceId) || []);
  return queue.map((entry) => ({ ...entry, execution: states.find((state) => state.loadId === entry.load.loadId) || { workspaceId, loadId: entry.load.loadId, externalPartnerId, status: "CARRIER_ACCEPTED", latestEta: entry.load.plannedDelivery || null, latestEventId: null, updatedAt: entry.responses[0]?.respondedAt || entry.load.createdAt }, events: events.filter((event) => event.loadId === entry.load.loadId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).map((event) => ({ ...event, integrity: hash(withoutHash(event)) === event.contentHash ? "VERIFIED" : "FAILED" })) }));
}

export async function recordPartnerExecutionEvent(input: { workspaceId: string; externalPartnerId: string; loadId: string; actor: string; eventType: string; estimatedArrival?: string; location?: string; note?: string; occurredAt?: string }) {
  const assignment = await acceptedLoad(input.workspaceId, input.externalPartnerId, input.loadId);
  const eventType = String(input.eventType || "").toUpperCase() as ExecutionEventType;
  if (!Object.prototype.hasOwnProperty.call(transitions, eventType)) throw new Error("Select a supported execution update.");
  const recordedAt = new Date().toISOString(); const occurredAt = input.occurredAt?.trim() || recordedAt;
  if (!Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt) > Date.parse(recordedAt) + 5 * 60 * 1000) throw new Error("Execution event time is invalid.");
  const eta = input.estimatedArrival?.trim() || null;
  if (eventType === "ETA_UPDATED" && (!eta || !Number.isFinite(Date.parse(eta)))) throw new Error("A valid estimated arrival is required for an ETA update.");
  const stateKey = `${input.workspaceId}:${input.loadId}`;
  const create = (current?: PartnerExecutionState) => {
    const priorStatus = current?.status || "CARRIER_ACCEPTED"; const resultingStatus = applyExecutionTransition(priorStatus, eventType);
    const plannedDelivery = typeof assignment.load.plannedDelivery === "string" ? assignment.load.plannedDelivery : null;
    const base = { schemaVersion: "1.0" as const, eventId: randomUUID(), workspaceId: input.workspaceId, loadId: input.loadId, tenderId: String(assignment.state.lastTenderId || assignment.state.activeTenderId), externalPartnerId: input.externalPartnerId, eventType, priorStatus, resultingStatus, estimatedArrival: eta, location: input.location?.trim().slice(0, 300) || null, note: input.note?.trim().slice(0, 1000) || null, reportedBy: input.actor, occurredAt, recordedAt };
    const event = { ...base, contentHash: hash(base) }; const state: PartnerExecutionState = { workspaceId: input.workspaceId, loadId: input.loadId, externalPartnerId: input.externalPartnerId, status: resultingStatus, latestEta: eta || current?.latestEta || plannedDelivery, latestEventId: event.eventId, updatedAt: recordedAt };
    return { event, state };
  };
  if (!isFirestorePrimaryEnabled()) { const result = create(localStates.get(stateKey)); localStates.set(stateKey, result.state); localEvents.set(input.workspaceId, [...(localEvents.get(input.workspaceId) || []), result.event]); return result; }
  const stateRef = intakeCollection(input.workspaceId, "partnerExecutionState").doc(input.loadId);
  return stateRef.firestore.runTransaction(async (transaction) => { const snapshot = await transaction.get(stateRef); const result = create(snapshot.data() as PartnerExecutionState | undefined); transaction.create(intakeCollection(input.workspaceId, "partnerExecutionEvents").doc(result.event.eventId), result.event); transaction.set(stateRef, result.state); return result; });
}
