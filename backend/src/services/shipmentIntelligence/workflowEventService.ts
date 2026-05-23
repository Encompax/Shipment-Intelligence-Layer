import { SilGovernanceSignalDraft, SilWorkflowEvent, SilWorkflowEventType } from "./types";

const workflowEvents: SilWorkflowEvent[] = [];

const nowIso = () => new Date().toISOString();

const createId = (type: SilWorkflowEventType) =>
  `sil_evt_${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function recordWorkflowEvent(input: {
  eventType: SilWorkflowEventType;
  actor?: string;
  source?: SilWorkflowEvent["source"];
  loadId?: string;
  shipmentId?: string;
  bidId?: string;
  carrierId?: string;
  workspaceId?: string;
  previousState?: string;
  nextState?: string;
  summary: string;
  evidence?: string[];
  governanceSignal?: SilGovernanceSignalDraft;
}) {
  const event: SilWorkflowEvent = {
    eventId: createId(input.eventType),
    eventType: input.eventType,
    occurredAt: nowIso(),
    actor: input.actor ?? "system",
    source: input.source ?? "SYSTEM",
    workspaceId: input.workspaceId,
    loadId: input.loadId,
    shipmentId: input.shipmentId,
    bidId: input.bidId,
    carrierId: input.carrierId,
    previousState: input.previousState,
    nextState: input.nextState,
    summary: input.summary,
    evidence: input.evidence ?? [],
    governanceSignal: input.governanceSignal,
  };

  workflowEvents.unshift(event);
  return event;
}

export function listWorkflowEvents(filters?: { loadId?: string; shipmentId?: string; bidId?: string; workspaceId?: string }) {
  return workflowEvents.filter((event) => {
    if (filters?.loadId && event.loadId !== filters.loadId) return false;
    if (filters?.shipmentId && event.shipmentId !== filters.shipmentId) return false;
    if (filters?.bidId && event.bidId !== filters.bidId) return false;
    if (filters?.workspaceId && (event.workspaceId ?? "workspace-shipment-operations") !== filters.workspaceId) return false;
    return true;
  });
}

export function seedWorkflowEvents() {
  if (workflowEvents.length > 0) return workflowEvents;

  recordWorkflowEvent({
    eventType: "LOAD_POSTED",
    actor: "system",
    loadId: "load-gpf-pa-ga-1001",
    previousState: "READY_TO_POST",
    nextState: "POSTED",
    summary: "Gopuff PA to GA load posted for carrier response.",
    evidence: ["Posting board: INTERNAL", "Visibility: invited carriers", "Posted rate: 2500"],
  });

  recordWorkflowEvent({
    eventType: "BID_REVIEWED",
    actor: "system",
    loadId: "load-gpf-pa-ga-1001",
    bidId: "bid-riverbend-gpf-pa-ga-1001",
    carrierId: "carrier-riverbend",
    summary: "Riverbend bid reviewed by SIL matching engine.",
    evidence: ["Carrier safety in review", "Carrier credit in review", "Projected margin below target"],
  });

  return workflowEvents;
}
