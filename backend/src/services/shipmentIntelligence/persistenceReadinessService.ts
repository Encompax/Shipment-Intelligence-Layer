import {
  getSilFirestoreProjectId,
  getSilFirestoreRootCollection,
  isFirestoreMirrorEnabled,
  isFirestorePrimaryEnabled,
} from "../../lib/firestore";
import {
  getSilWorkspace,
  listPersistedWorkflowEvents,
  listSilBids,
  listSilCarriers,
  listSilGovernanceSignalEnvelopes,
  listSilLoads,
  listSilShipments,
  listSilShipmentDocuments,
} from "./silPersistenceService";

type PersistenceMode = "LOCAL_SQLITE" | "RELATIONAL_DATABASE" | "UNCONFIGURED";
type DurabilityLevel =
  | "DEMO_LOCAL_ONLY"
  | "GOVERNANCE_AUDIT_MIRRORED"
  | "FIRESTORE_CUSTOMER_RECORDS_PRIMARY"
  | "CUSTOMER_READY_PENDING";

const databaseUrlKind = (databaseUrl: string | undefined): PersistenceMode => {
  if (!databaseUrl) return "UNCONFIGURED";
  if (databaseUrl.startsWith("file:")) return "LOCAL_SQLITE";
  return "RELATIONAL_DATABASE";
};

export async function buildSilPersistenceReadiness(workspaceId?: string) {
  const workspace = await getSilWorkspace(workspaceId);
  const resolvedWorkspaceId = workspace.workspaceId;
  const databaseUrl = process.env.DATABASE_URL;
  const runtimeStore = databaseUrlKind(databaseUrl);
  const firestoreMirrorEnabled = isFirestoreMirrorEnabled();
  const firestorePrimaryEnabled = isFirestorePrimaryEnabled();
  const firestoreProjectId = getSilFirestoreProjectId();
  const firestoreRootCollection = getSilFirestoreRootCollection();

  const [loads, shipments, carriers, bids, governanceSignals, workflowEvents, shipmentDocuments] = await Promise.all([
    listSilLoads({ workspaceId: resolvedWorkspaceId }),
    listSilShipments({ workspaceId: resolvedWorkspaceId }),
    listSilCarriers({ workspaceId: resolvedWorkspaceId }),
    listSilBids({ workspaceId: resolvedWorkspaceId }),
    listSilGovernanceSignalEnvelopes({ workspaceId: resolvedWorkspaceId }),
    listPersistedWorkflowEvents({ workspaceId: resolvedWorkspaceId }),
    listSilShipmentDocuments({ workspaceId: resolvedWorkspaceId }),
  ]);

  const durabilityLevel: DurabilityLevel = firestorePrimaryEnabled
    ? "FIRESTORE_CUSTOMER_RECORDS_PRIMARY"
    : firestoreMirrorEnabled
    ? runtimeStore === "RELATIONAL_DATABASE"
      ? "CUSTOMER_READY_PENDING"
      : "GOVERNANCE_AUDIT_MIRRORED"
    : "DEMO_LOCAL_ONLY";

  const controlledPilotReady = firestorePrimaryEnabled && Boolean(firestoreProjectId);
  const customerReady = false;
  const blockers = [
    runtimeStore === "LOCAL_SQLITE" && !firestorePrimaryEnabled
      ? "Operational records still use local SQLite persistence."
      : null,
    firestorePrimaryEnabled && runtimeStore === "LOCAL_SQLITE"
      ? "High-volume operational tables still use local SQLite while customer-facing governance/workspace/document state is Firestore-primary."
      : null,
    !firestoreMirrorEnabled ? "Firestore governance and workflow mirroring is disabled." : null,
    !firestorePrimaryEnabled ? "Firestore primary customer-facing record storage is disabled." : null,
    !firestoreProjectId ? "Firestore project id is not configured." : null,
    "Authentication, tenant isolation rules, and customer-owned workspace boundaries must be enforced before real customer data.",
  ].filter((item): item is string => Boolean(item));

  return {
    generatedAt: new Date().toISOString(),
    workspaceId: resolvedWorkspaceId,
    workspaceName: workspace.workspaceName,
    runtimeStore: {
      mode: runtimeStore,
      databaseUrlKind: runtimeStore === "LOCAL_SQLITE" ? "file" : runtimeStore === "RELATIONAL_DATABASE" ? "network" : "missing",
      customerDataUse: controlledPilotReady ? "CONTROLLED_PILOT_READY_AFTER_SECURITY_REVIEW" : "NOT_READY_FOR_REAL_CUSTOMER_DATA",
    },
    firestore: {
      enabled: firestoreMirrorEnabled,
      primaryEnabled: firestorePrimaryEnabled,
      projectId: firestoreProjectId,
      rootCollection: firestoreRootCollection,
      mode: firestorePrimaryEnabled
        ? "CUSTOMER_RECORDS_PRIMARY_WITH_OPERATIONAL_SQLITE_STAGING"
        : firestoreMirrorEnabled
          ? "GOVERNANCE_AND_WORKFLOW_MIRROR"
          : "DISABLED",
      durableCollections: firestorePrimaryEnabled
        ? [
            `${firestoreRootCollection}/{workspaceId}`,
            `${firestoreRootCollection}/{workspaceId}/governanceSignals`,
            `${firestoreRootCollection}/{workspaceId}/workflowEvents`,
            `${firestoreRootCollection}/{workspaceId}/shipmentDocuments`,
          ]
        : firestoreMirrorEnabled
        ? [
            `${firestoreRootCollection}/{workspaceId}/governanceSignals`,
            `${firestoreRootCollection}/{workspaceId}/workflowEvents`,
          ]
        : [],
    },
    records: {
      loads: loads.length,
      shipments: shipments.length,
      carriers: carriers.length,
      bids: bids.length,
      governanceSignals: governanceSignals.length,
      workflowEvents: workflowEvents.length,
      shipmentDocuments: shipmentDocuments.length,
    },
    durabilityLevel,
    controlledPilotReady,
    customerReady,
    blockers,
    recommendedPersistencePath: [
      "Keep SQLite only for local development and demo resets.",
      "Use Firestore first for tenant workspaces, governance signals, workflow events, import jobs, and document metadata.",
      "Promote high-volume relational operational records to Cloud SQL/Postgres when shipment volume, joins, and reporting require it.",
      "Store provider API keys in Secret Manager and keep agent calls behind dry-run, budget, and seat-contract gates.",
    ],
  };
}
