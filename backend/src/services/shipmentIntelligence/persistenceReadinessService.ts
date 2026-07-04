import { getSilFirestoreProjectId, isFirestoreMirrorEnabled } from "../../lib/firestore";
import {
  getSilWorkspace,
  listPersistedWorkflowEvents,
  listSilBids,
  listSilCarriers,
  listSilGovernanceSignalEnvelopes,
  listSilLoads,
  listSilShipments,
} from "./silPersistenceService";

type PersistenceMode = "LOCAL_SQLITE" | "RELATIONAL_DATABASE" | "UNCONFIGURED";
type DurabilityLevel = "DEMO_LOCAL_ONLY" | "GOVERNANCE_AUDIT_MIRRORED" | "CUSTOMER_READY_PENDING";

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
  const firestoreProjectId = getSilFirestoreProjectId();

  const [loads, shipments, carriers, bids, governanceSignals, workflowEvents] = await Promise.all([
    listSilLoads({ workspaceId: resolvedWorkspaceId }),
    listSilShipments({ workspaceId: resolvedWorkspaceId }),
    listSilCarriers({ workspaceId: resolvedWorkspaceId }),
    listSilBids({ workspaceId: resolvedWorkspaceId }),
    listSilGovernanceSignalEnvelopes({ workspaceId: resolvedWorkspaceId }),
    listPersistedWorkflowEvents({ workspaceId: resolvedWorkspaceId }),
  ]);

  const durabilityLevel: DurabilityLevel = firestoreMirrorEnabled
    ? runtimeStore === "RELATIONAL_DATABASE"
      ? "CUSTOMER_READY_PENDING"
      : "GOVERNANCE_AUDIT_MIRRORED"
    : "DEMO_LOCAL_ONLY";

  const customerReady = runtimeStore === "RELATIONAL_DATABASE" && firestoreMirrorEnabled;
  const blockers = [
    runtimeStore === "LOCAL_SQLITE" ? "Operational records still use local SQLite persistence." : null,
    !firestoreMirrorEnabled ? "Firestore governance and workflow mirroring is disabled." : null,
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
      customerDataUse: customerReady ? "READY_AFTER_SECURITY_REVIEW" : "NOT_READY_FOR_REAL_CUSTOMER_DATA",
    },
    firestore: {
      enabled: firestoreMirrorEnabled,
      projectId: firestoreProjectId,
      mode: firestoreMirrorEnabled ? "GOVERNANCE_AND_WORKFLOW_MIRROR" : "DISABLED",
      durableCollections: firestoreMirrorEnabled
        ? [
            "silWorkspaces/{workspaceId}/governanceSignals",
            "silWorkspaces/{workspaceId}/workflowEvents",
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
    },
    durabilityLevel,
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
