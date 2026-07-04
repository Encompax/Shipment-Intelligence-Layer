import { FieldValue } from "firebase-admin/firestore";
import { getSilFirestore } from "../../lib/firestore";
import { logger } from "../../lib/logger";
import { SilGovernanceSignalDraft, SilWorkflowEvent } from "./types";

type SilGovernanceSignalEnvelope = {
  signalId: string;
  status: string;
  updatedAt: string;
  signal: SilGovernanceSignalDraft;
};

const DEFAULT_WORKSPACE_ID = "workspace-shipment-operations";

const safeDocumentId = (value: string) => value.replace(/[/?#[\]]/g, "_");

export async function mirrorSilGovernanceSignalToFirestore(envelope: SilGovernanceSignalEnvelope) {
  const db = getSilFirestore();
  if (!db) return;

  const workspaceId = envelope.signal.workspaceId ?? DEFAULT_WORKSPACE_ID;

  try {
    await db
      .collection("silWorkspaces")
      .doc(workspaceId)
      .collection("governanceSignals")
      .doc(safeDocumentId(envelope.signalId))
      .set(
        {
          ...envelope,
          workspaceId,
          updatedAtIso: envelope.updatedAt,
          mirroredAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (error) {
    logger.warn("SIL Firestore governance signal mirror failed", { signalId: envelope.signalId, error });
  }
}

export async function mirrorSilWorkflowEventToFirestore(event: SilWorkflowEvent) {
  const db = getSilFirestore();
  if (!db) return;

  const workspaceId = event.workspaceId ?? DEFAULT_WORKSPACE_ID;

  try {
    await db
      .collection("silWorkspaces")
      .doc(workspaceId)
      .collection("workflowEvents")
      .doc(safeDocumentId(event.eventId))
      .set(
        {
          ...event,
          workspaceId,
          occurredAtIso: event.occurredAt,
          mirroredAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  } catch (error) {
    logger.warn("SIL Firestore workflow event mirror failed", { eventId: event.eventId, error });
  }
}
