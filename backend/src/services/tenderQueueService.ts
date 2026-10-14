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
  contentHash: string;
  integrity?: "VERIFIED" | "FAILED";
};

export type TenderQueueState = {
  workspaceId: string;
  loadId: string;
  status: "READY_TO_TENDER" | "AWAITING_RESPONSE";
  activeTenderId: string | null;
  attemptCount: number;
  updatedAt: string;
};

export class TenderValidationError extends Error {}
export class TenderConflict extends Error {}

const localTenders = new Map<string, TenderIssuanceRecord>();
const localTenderStates = new Map<string, TenderQueueState>();

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

export function buildTenderIssuance(input: { workspaceId: string; load: PlannedLoadRecord; actor: string; responseDueAt?: string; note?: string; now?: string; tenderId?: string }) {
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
  const [loads, tenders] = await Promise.all([listPlannedLoads(workspaceId), listTenderIssuances(workspaceId)]);
  const states = isFirestorePrimaryEnabled()
    ? (await intakeCollection(workspaceId, "tenderQueueState").get()).docs.map((doc) => doc.data() as TenderQueueState)
    : [...localTenderStates.values()];
  const stateByLoad = new Map(states.filter((item) => item.workspaceId === workspaceId).map((item) => [item.loadId, item]));
  return loads.map((load) => ({
    load,
    state: stateByLoad.get(load.loadId) ?? { workspaceId, loadId: load.loadId, status: "READY_TO_TENDER", activeTenderId: null, attemptCount: 0, updatedAt: load.createdAt },
    tenders: tenders.filter((tender) => tender.loadId === load.loadId),
  }));
}

export async function issuePlannedLoadTender(input: { workspaceId: string; loadId: string; actor: string; responseDueAt?: string; note?: string }) {
  const load = await getPlannedLoad(input.workspaceId, input.loadId);
  if (!load) throw new TenderValidationError("Planned load not found in this workspace.");
  if (!isFirestorePrimaryEnabled()) {
    const key = `${input.workspaceId}:${input.loadId}`;
    const existingState = localTenderStates.get(key);
    if (existingState?.activeTenderId) {
      const existing = localTenders.get(existingState.activeTenderId);
      if (!existing) throw new TenderConflict("Tender state is incomplete and requires support review.");
      return { tender: verifyTenderIssuance(existing), state: existingState, idempotent: true };
    }
    const tender = buildTenderIssuance({ ...input, load });
    const state: TenderQueueState = { workspaceId: input.workspaceId, loadId: input.loadId, status: "AWAITING_RESPONSE", activeTenderId: tender.tenderId, attemptCount: (existingState?.attemptCount ?? 0) + 1, updatedAt: tender.issuedAt };
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
    if (currentState?.activeTenderId) {
      const tenderSnapshot = await transaction.get(intakeCollection(input.workspaceId, "tenderIssuances").doc(currentState.activeTenderId));
      const existing = tenderSnapshot.data() as TenderIssuanceRecord | undefined;
      if (!existing) throw new TenderConflict("Tender state is incomplete and requires support review.");
      return { tender: verifyTenderIssuance(existing), state: currentState, idempotent: true };
    }
    const tender = buildTenderIssuance({ ...input, load: currentLoad });
    const state: TenderQueueState = { workspaceId: input.workspaceId, loadId: input.loadId, status: "AWAITING_RESPONSE", activeTenderId: tender.tenderId, attemptCount: (currentState?.attemptCount ?? 0) + 1, updatedAt: tender.issuedAt };
    transaction.create(intakeCollection(input.workspaceId, "tenderIssuances").doc(tender.tenderId), tender);
    transaction.set(stateRef, state);
    for (const orderId of currentLoad.orderIds) transaction.update(intakeCollection(input.workspaceId, "orders").doc(orderId), { status: "TENDERED", activeTenderId: tender.tenderId, updatedAt: tender.issuedAt });
    return { tender, state, idempotent: false };
  });
}
