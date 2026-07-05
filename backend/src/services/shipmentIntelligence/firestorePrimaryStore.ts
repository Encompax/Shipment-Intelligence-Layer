import { FieldValue } from "firebase-admin/firestore";
import {
  getSilFirestore,
  getSilFirestoreRootCollection,
  isFirestorePrimaryEnabled,
} from "../../lib/firestore";
import { SilGovernanceSignalDraft, SilShipmentDocument, SilWorkflowEvent } from "./types";
import type { SilGovernanceSignalEnvelope, SilWorkspacePayload } from "./silPersistenceService";

const DEFAULT_WORKSPACE_ID = "workspace-shipment-operations";

const safeDocumentId = (value: string) => value.replace(/[/?#[\]]/g, "_");

const stripUndefined = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getWorkspaceId = (workspaceId?: string) => workspaceId || DEFAULT_WORKSPACE_ID;

const workspaceDocument = (workspaceId?: string) => {
  const db = getSilFirestore();
  if (!db) return null;
  return db.collection(getSilFirestoreRootCollection()).doc(getWorkspaceId(workspaceId));
};

export const shouldUseSilFirestorePrimary = () => isFirestorePrimaryEnabled();

export async function getFirestoreSilWorkspace(workspaceId?: string) {
  if (!shouldUseSilFirestorePrimary()) return null;
  const ref = workspaceDocument(workspaceId);
  if (!ref) return null;

  const snapshot = await ref.get();
  return snapshot.exists ? (snapshot.data() as SilWorkspacePayload) : null;
}

export async function upsertFirestoreSilWorkspace(workspace: SilWorkspacePayload) {
  if (!shouldUseSilFirestorePrimary()) return;
  const ref = workspaceDocument(workspace.workspaceId);
  if (!ref) return;

  await ref.set(
    {
      ...stripUndefined(workspace),
      workspaceId: getWorkspaceId(workspace.workspaceId),
      updatedAt: new Date().toISOString(),
      firestoreUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function upsertFirestoreSilGovernanceSignal(envelope: SilGovernanceSignalEnvelope) {
  if (!shouldUseSilFirestorePrimary()) return;
  const workspaceId = getWorkspaceId(envelope.signal.workspaceId);
  const ref = workspaceDocument(workspaceId);
  if (!ref) return;

  await ref.collection("governanceSignals").doc(safeDocumentId(envelope.signalId)).set(
    {
      ...stripUndefined(envelope),
      workspaceId,
      updatedAtIso: envelope.updatedAt,
      firestoreUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listFirestoreSilGovernanceSignalEnvelopes(filters?: { workspaceId?: string; status?: string }) {
  if (!shouldUseSilFirestorePrimary()) return null;
  const ref = workspaceDocument(filters?.workspaceId);
  if (!ref) return null;

  const snapshot = await ref.collection("governanceSignals").get();
  return snapshot.docs
    .map((doc) => doc.data() as SilGovernanceSignalEnvelope & { workspaceId?: string })
    .filter((record) => !filters?.status || record.status === filters.status)
    .map((record) => ({
      signalId: record.signalId,
      status: record.status,
      updatedAt: record.updatedAt,
      signal: {
        ...record.signal,
        workspaceId: record.signal.workspaceId ?? record.workspaceId ?? getWorkspaceId(filters?.workspaceId),
      } as SilGovernanceSignalDraft,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertFirestoreSilWorkflowEvent(event: SilWorkflowEvent) {
  if (!shouldUseSilFirestorePrimary()) return;
  const workspaceId = getWorkspaceId(event.workspaceId);
  const ref = workspaceDocument(workspaceId);
  if (!ref) return;

  await ref.collection("workflowEvents").doc(safeDocumentId(event.eventId)).set(
    {
      ...stripUndefined(event),
      workspaceId,
      occurredAtIso: event.occurredAt,
      firestoreUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listFirestoreSilWorkflowEvents(filters?: {
  loadId?: string;
  shipmentId?: string;
  bidId?: string;
  workspaceId?: string;
}) {
  if (!shouldUseSilFirestorePrimary()) return null;
  const ref = workspaceDocument(filters?.workspaceId);
  if (!ref) return null;

  const snapshot = await ref.collection("workflowEvents").get();
  return snapshot.docs
    .map((doc) => doc.data() as SilWorkflowEvent)
    .filter((record) => !filters?.loadId || record.loadId === filters.loadId)
    .filter((record) => !filters?.shipmentId || record.shipmentId === filters.shipmentId)
    .filter((record) => !filters?.bidId || record.bidId === filters.bidId)
    .map((record) => ({ ...record, workspaceId: record.workspaceId ?? getWorkspaceId(filters?.workspaceId) }))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function upsertFirestoreSilShipmentDocument(document: SilShipmentDocument) {
  if (!shouldUseSilFirestorePrimary()) return;
  const workspaceId = getWorkspaceId(document.workspaceId);
  const ref = workspaceDocument(workspaceId);
  if (!ref) return;

  await ref.collection("shipmentDocuments").doc(safeDocumentId(document.documentId)).set(
    {
      ...stripUndefined(document),
      workspaceId,
      uploadedAtIso: document.uploadedAt,
      firestoreUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listFirestoreSilShipmentDocuments(filters?: {
  workspaceId?: string;
  shipmentId?: string;
  loadId?: string;
}) {
  if (!shouldUseSilFirestorePrimary()) return null;
  const ref = workspaceDocument(filters?.workspaceId);
  if (!ref) return null;

  const snapshot = await ref.collection("shipmentDocuments").get();
  return snapshot.docs
    .map((doc) => doc.data() as SilShipmentDocument)
    .filter((document) => !filters?.shipmentId || document.shipmentId === filters.shipmentId)
    .filter((document) => !filters?.loadId || document.loadId === filters.loadId)
    .map((document) => ({ ...document, workspaceId: document.workspaceId ?? getWorkspaceId(filters?.workspaceId) }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
