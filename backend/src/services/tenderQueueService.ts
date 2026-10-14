import { createHash, randomUUID } from "crypto";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import { getPlannedLoad, listPlannedLoads, type PlannedLoadRecord } from "./orderPlanningDecisionService";

export const TENDER_ISSUANCE_SCHEMA_VERSION = "1.0";

export type TenderIssuanceRecord = {
  schemaVersion: string;
  tenderId: string;
  workspaceId: string;
  loadId: string;
  loadDisplayId: string;
  sourceProposalId: string;
  sourceProposalContentHash: string;
  planningDecisionId: string;
  carrier: PlannedLoadRecord["carrier"];
  award: PlannedLoadRecord["award"];
  laneId: string;
  orderIds: string[];
  status: "ISSUED";
  responseDueAt: string | null;
  note: string | null;
  issuedBy: string;
  issuedAt: string;
  attemptNumber: number;
  priorTenderId: string | null;
  retenderReason: string | null;
  contentHash: string;
  integrity?: "VERIFIED" | "FAILED";
};

export type TenderQueueState = {
  workspaceId: string;
  loadId: string;
  status: "READY_TO_TENDER" | "AWAITING_RESPONSE" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  activeTenderId: string | null;
  lastTenderId?: string | null;
  attemptCount: number;
  updatedAt: string;
};

export type TenderResponseRecord = {
  schemaVersion: "1.0";
  responseId: string;
  workspaceId: string;
  loadId: string;
  tenderId: string;
  externalPartnerId: string;
  response: "ACCEPTED" | "REJECTED" | "EXPIRED";
  reason: string | null;
  respondedBy: string;
  respondedAt: string;
  contentHash: string;
  integrity?: "VERIFIED" | "FAILED";
};

export class TenderValidationError extends Error {}
export class TenderConflict extends Error {}

const localTenders = new Map<string, TenderIssuanceRecord>();
const localTenderStates = new Map<string, TenderQueueState>();
const localTenderResponses = new Map<string, TenderResponseRecord>();

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
}

export function hashTenderIssuance(record: Omit<TenderIssuanceRecord, "contentHash"> | TenderIssuanceRecord) {
  const { contentHash: _hash, integrity: _integrity, ...content } = record as TenderIssuanceRecord;
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export function verifyTenderIssuance(record: TenderIssuanceRecord): TenderIssuanceRecord {
  return { ...record, integrity: hashTenderIssuance(record) === record.contentHash ? "VERIFIED" : "FAILED" };
}

export function buildTenderIssuance(input: { workspaceId: string; load: PlannedLoadRecord; actor: string; responseDueAt?: string; note?: string; now?: string; tenderId?: string; attemptNumber?: number; priorTenderId?: string | null; retenderReason?: string }) {
  if (!input.workspaceId || input.load.workspaceId !== input.workspaceId) throw new TenderValidationError("Planned load must belong to the authenticated workspace.");
  if (input.load.status !== "PLANNED") throw new TenderValidationError("Only a planned load can enter the tender queue.");
  if (!input.load.carrier?.externalPartnerId || !input.load.award?.awardId) throw new TenderValidationError("The planned load must contain an awarded carrier and award evidence.");
  const issuedAt = input.now ?? new Date().toISOString();
  const due = input.responseDueAt?.trim() || null;
  if (due && (!Number.isFinite(Date.parse(due)) || Date.parse(due) <= Date.parse(issuedAt))) throw new TenderValidationError("Response due time must be later than the issuance time.");
  const withoutHash: Omit<TenderIssuanceRecord, "contentHash"> = {
    schemaVersion: TENDER_ISSUANCE_SCHEMA_VERSION,
    tenderId: input.tenderId ?? randomUUID(),
    workspaceId: input.workspaceId,
    loadId: input.load.loadId,
    loadDisplayId: input.load.displayId,
    sourceProposalId: input.load.sourceProposalId,
    sourceProposalContentHash: input.load.sourceProposalContentHash,
    planningDecisionId: input.load.planningDecisionId,
    carrier: JSON.parse(JSON.stringify(input.load.carrier)),
    award: JSON.parse(JSON.stringify(input.load.award)),
    laneId: input.load.laneId,
    orderIds: [...input.load.orderIds],
    status: "ISSUED",
    responseDueAt: due,
    note: input.note?.trim() || null,
    issuedBy: input.actor,
    issuedAt,
    attemptNumber: input.attemptNumber ?? 1,
    priorTenderId: input.priorTenderId ?? null,
    retenderReason: input.retenderReason?.trim() || null,
  };
  return { ...withoutHash, contentHash: hashTenderIssuance(withoutHash) };
}

export async function listTenderIssuances(workspaceId: string) {
  const records = isFirestorePrimaryEnabled()
    ? (await intakeCollection(workspaceId, "tenderIssuances").get()).docs.map((doc) => doc.data() as TenderIssuanceRecord)
    : [...localTenders.values()];
  return records.filter((item) => item.workspaceId === workspaceId).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map(verifyTenderIssuance);
}

export async function listTenderQueue(workspaceId: string) {
  const [loads, tenders, responses] = await Promise.all([listPlannedLoads(workspaceId), listTenderIssuances(workspaceId), listTenderResponses(workspaceId)]);
  const states = isFirestorePrimaryEnabled()
    ? (await intakeCollection(workspaceId, "tenderQueueState").get()).docs.map((doc) => doc.data() as TenderQueueState)
    : [...localTenderStates.values()];
  const stateByLoad = new Map(states.filter((item) => item.workspaceId === workspaceId).map((item) => [item.loadId, item]));
  return loads.map((load) => ({
    load,
    state: stateByLoad.get(load.loadId) ?? { workspaceId, loadId: load.loadId, status: "READY_TO_TENDER", activeTenderId: null, attemptCount: 0, updatedAt: load.createdAt },
    tenders: tenders.filter((tender) => tender.loadId === load.loadId),
    responses: responses.filter((response) => response.loadId === load.loadId),
  }));
}

export async function issuePlannedLoadTender(input: { workspaceId: string; loadId: string; actor: string; responseDueAt?: string; note?: string }) {
  const load = await getPlannedLoad(input.workspaceId, input.loadId);
  if (!load) throw new TenderValidationError("Planned load not found in this workspace.");
  if (!isFirestorePrimaryEnabled()) {
    const key = `${input.workspaceId}:${input.loadId}`;
    const existingState = localTenderStates.get(key);
    if (existingState && existingState.status !== "READY_TO_TENDER") {
      if (!existingState.activeTenderId) throw new TenderConflict("This load has completed a tender attempt. Use governed retendering if it was rejected or expired.");
      const existing = localTenders.get(existingState.activeTenderId);
      if (!existing) throw new TenderConflict("Tender state is incomplete and requires support review.");
      return { tender: verifyTenderIssuance(existing), state: existingState, idempotent: true };
    }
    const tender = buildTenderIssuance({ ...input, load, attemptNumber: (existingState?.attemptCount ?? 0) + 1 });
    const state: TenderQueueState = { workspaceId: input.workspaceId, loadId: input.loadId, status: "AWAITING_RESPONSE", activeTenderId: tender.tenderId, lastTenderId: tender.tenderId, attemptCount: tender.attemptNumber, updatedAt: tender.issuedAt };
    localTenders.set(tender.tenderId, tender); localTenderStates.set(key, state);
    return { tender, state, idempotent: false };
  }

  const loadRef = intakeCollection(input.workspaceId, "plannedLoads").doc(input.loadId);
  const stateRef = intakeCollection(input.workspaceId, "tenderQueueState").doc(input.loadId);
  return stateRef.firestore.runTransaction(async (transaction) => {
    const [loadSnapshot, stateSnapshot] = await Promise.all([transaction.get(loadRef), transaction.get(stateRef)]);
    const currentLoad = loadSnapshot.data() as PlannedLoadRecord | undefined;
    if (!currentLoad || currentLoad.workspaceId !== input.workspaceId) throw new TenderValidationError("Planned load not found in this workspace.");
    const currentState = stateSnapshot.data() as TenderQueueState | undefined;
    if (currentState && currentState.status !== "READY_TO_TENDER") {
      if (!currentState.activeTenderId) throw new TenderConflict("This load has completed a tender attempt. Use governed retendering if it was rejected or expired.");
      const tenderSnapshot = await transaction.get(intakeCollection(input.workspaceId, "tenderIssuances").doc(currentState.activeTenderId));
      const existing = tenderSnapshot.data() as TenderIssuanceRecord | undefined;
      if (!existing) throw new TenderConflict("Tender state is incomplete and requires support review.");
      return { tender: verifyTenderIssuance(existing), state: currentState, idempotent: true };
    }
    const tender = buildTenderIssuance({ ...input, load: currentLoad, attemptNumber: (currentState?.attemptCount ?? 0) + 1 });
    const state: TenderQueueState = { workspaceId: input.workspaceId, loadId: input.loadId, status: "AWAITING_RESPONSE", activeTenderId: tender.tenderId, lastTenderId: tender.tenderId, attemptCount: tender.attemptNumber, updatedAt: tender.issuedAt };
    transaction.create(intakeCollection(input.workspaceId, "tenderIssuances").doc(tender.tenderId), tender);
    transaction.set(stateRef, state);
    for (const orderId of currentLoad.orderIds) transaction.update(intakeCollection(input.workspaceId, "orders").doc(orderId), { status: "TENDERED", activeTenderId: tender.tenderId, updatedAt: tender.issuedAt });
    return { tender, state, idempotent: false };
  });
}

export function hashTenderResponse(record: Omit<TenderResponseRecord, "contentHash"> | TenderResponseRecord) {
  const { contentHash: _hash, integrity: _integrity, ...content } = record as TenderResponseRecord;
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export function verifyTenderResponse(record: TenderResponseRecord): TenderResponseRecord {
  return { ...record, integrity: hashTenderResponse(record) === record.contentHash ? "VERIFIED" : "FAILED" };
}

export function buildTenderResponse(input: { tender: TenderIssuanceRecord; response: TenderResponseRecord["response"]; reason?: string; actor: string; now?: string }) {
  if (input.response === "REJECTED" && !input.reason?.trim()) throw new TenderValidationError("A rejection reason is required.");
  const respondedAt = input.now ?? new Date().toISOString();
  const withoutHash: Omit<TenderResponseRecord, "contentHash"> = {
    schemaVersion: "1.0", responseId: randomUUID(), workspaceId: input.tender.workspaceId, loadId: input.tender.loadId,
    tenderId: input.tender.tenderId, externalPartnerId: input.tender.carrier.externalPartnerId, response: input.response,
    reason: input.reason?.trim() || null, respondedBy: input.actor, respondedAt,
  };
  return { ...withoutHash, contentHash: hashTenderResponse(withoutHash) };
}

export async function listTenderResponses(workspaceId: string) {
  const records = isFirestorePrimaryEnabled()
    ? (await intakeCollection(workspaceId, "tenderResponses").get()).docs.map((doc) => doc.data() as TenderResponseRecord)
    : [...localTenderResponses.values()];
  return records.filter((item) => item.workspaceId === workspaceId).sort((a, b) => b.respondedAt.localeCompare(a.respondedAt)).map(verifyTenderResponse);
}

export async function respondToTender(input: { workspaceId: string; tenderId: string; externalPartnerId?: string; response: "ACCEPTED" | "REJECTED" | "EXPIRED"; reason?: string; actor: string }) {
  const assertPartner = (tender: TenderIssuanceRecord) => {
    if (input.externalPartnerId && tender.carrier.externalPartnerId !== input.externalPartnerId) throw new TenderValidationError("This tender is assigned to a different partner organization.");
  };
  const apply = (tender: TenderIssuanceRecord, state: TenderQueueState) => {
    if (state.status !== "AWAITING_RESPONSE" || state.activeTenderId !== tender.tenderId) throw new TenderConflict("This tender is no longer awaiting a response.");
    assertPartner(tender);
    if (input.response === "EXPIRED" && tender.responseDueAt && Date.now() < Date.parse(tender.responseDueAt)) throw new TenderValidationError("This tender cannot expire before its response deadline.");
    return buildTenderResponse({ tender, response: input.response, reason: input.reason, actor: input.actor });
  };
  if (!isFirestorePrimaryEnabled()) {
    const tender = localTenders.get(input.tenderId); if (!tender || tender.workspaceId !== input.workspaceId) throw new TenderValidationError("Tender not found.");
    assertPartner(tender);
    const key = `${input.workspaceId}:${tender.loadId}`; const state = localTenderStates.get(key); if (!state) throw new TenderConflict("Tender state is unavailable.");
    const existing = localTenderResponses.get(input.tenderId); if (existing) return { response: verifyTenderResponse(existing), state, tender: verifyTenderIssuance(tender), idempotent: true };
    const response = apply(tender, state);
    const nextState: TenderQueueState = { ...state, status: input.response, activeTenderId: null, lastTenderId: tender.tenderId, updatedAt: response.respondedAt };
    localTenderResponses.set(tender.tenderId, response); localTenderStates.set(key, nextState);
    return { response, state: nextState, tender: verifyTenderIssuance(tender), idempotent: false };
  }
  const tenderRef = intakeCollection(input.workspaceId, "tenderIssuances").doc(input.tenderId);
  const responseRef = intakeCollection(input.workspaceId, "tenderResponses").doc(input.tenderId);
  return tenderRef.firestore.runTransaction(async (transaction) => {
    const tenderSnapshot = await transaction.get(tenderRef); const tender = tenderSnapshot.data() as TenderIssuanceRecord | undefined;
    if (!tender || tender.workspaceId !== input.workspaceId) throw new TenderValidationError("Tender not found.");
    assertPartner(tender);
    const stateRef = intakeCollection(input.workspaceId, "tenderQueueState").doc(tender.loadId);
    const [stateSnapshot, responseSnapshot] = await Promise.all([transaction.get(stateRef), transaction.get(responseRef)]);
    const state = stateSnapshot.data() as TenderQueueState | undefined; if (!state) throw new TenderConflict("Tender state is unavailable.");
    if (responseSnapshot.exists) return { response: verifyTenderResponse(responseSnapshot.data() as TenderResponseRecord), state, tender: verifyTenderIssuance(tender), idempotent: true };
    const response = apply(tender, state);
    const nextState: TenderQueueState = { ...state, status: input.response, activeTenderId: null, lastTenderId: tender.tenderId, updatedAt: response.respondedAt };
    transaction.create(responseRef, response); transaction.set(stateRef, nextState);
    const orderStatus = input.response === "ACCEPTED" ? "CARRIER_ACCEPTED" : input.response === "REJECTED" ? "TENDER_REJECTED" : "TENDER_EXPIRED";
    for (const orderId of tender.orderIds) transaction.update(intakeCollection(input.workspaceId, "orders").doc(orderId), { status: orderStatus, updatedAt: response.respondedAt });
    return { response, state: nextState, tender: verifyTenderIssuance(tender), idempotent: false };
  });
}

export async function retenderPlannedLoad(input: { workspaceId: string; loadId: string; actor: string; reason: string; responseDueAt?: string; note?: string }) {
  if (!input.reason.trim()) throw new TenderValidationError("A retender reason is required.");
  const load = await getPlannedLoad(input.workspaceId, input.loadId); if (!load) throw new TenderValidationError("Planned load not found.");
  const create = (state: TenderQueueState) => {
    if (!["REJECTED", "EXPIRED"].includes(state.status)) throw new TenderConflict("Only a rejected or expired tender can be retendered.");
    const tender = buildTenderIssuance({ ...input, load, attemptNumber: state.attemptCount + 1, priorTenderId: state.lastTenderId ?? null, retenderReason: input.reason });
    const nextState: TenderQueueState = { ...state, status: "AWAITING_RESPONSE", activeTenderId: tender.tenderId, lastTenderId: tender.tenderId, attemptCount: tender.attemptNumber, updatedAt: tender.issuedAt };
    return { tender, state: nextState };
  };
  if (!isFirestorePrimaryEnabled()) {
    const key = `${input.workspaceId}:${input.loadId}`; const state = localTenderStates.get(key); if (!state) throw new TenderConflict("Tender state is unavailable.");
    const result = create(state); localTenders.set(result.tender.tenderId, result.tender); localTenderStates.set(key, result.state); return result;
  }
  const stateRef = intakeCollection(input.workspaceId, "tenderQueueState").doc(input.loadId);
  return stateRef.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stateRef); const state = snapshot.data() as TenderQueueState | undefined; if (!state) throw new TenderConflict("Tender state is unavailable.");
    const result = create(state); transaction.create(intakeCollection(input.workspaceId, "tenderIssuances").doc(result.tender.tenderId), result.tender); transaction.set(stateRef, result.state);
    for (const orderId of load.orderIds) transaction.update(intakeCollection(input.workspaceId, "orders").doc(orderId), { status: "TENDERED", activeTenderId: result.tender.tenderId, updatedAt: result.tender.issuedAt });
    return result;
  });
}
