import { getAllowedLoadTransitions } from "./loadLifecycleService";
import { BrokerageLoadState, SilGovernanceSignalDraft, SilLoad } from "./types";

export const SIL_SUPPORT_AGENT_CONTRACT = {
  contractVersion: "1.0",
  agentId: "sil_support_v1",
  displayName: "SIL Operations Assistant",
  provider: "MANUAL",
  modelRef: null,
  capabilityMode: "ADVISORY",
  mayRequestCouncilReview: true,
  mayOverrideGovernance: false,
} as const;

export function explainLoad(load: SilLoad) {
  const allowedTransitions = getAllowedLoadTransitions(load.status);
  return {
    agent: SIL_SUPPORT_AGENT_CONTRACT,
    loadId: load.loadId,
    currentState: load.status,
    summary: `Load ${load.loadId} is ${load.status}. ${allowedTransitions.length ? `Its next valid states are ${allowedTransitions.join(", ")}.` : "No further lifecycle transition is currently available."}`,
    evidence: [
      `Customer: ${load.customerId}`,
      `Route: ${load.origin.city}, ${load.origin.state} to ${load.destination.city}, ${load.destination.state}`,
      `Mode/equipment: ${load.mode}/${load.equipmentType}`,
    ],
    allowedTransitions,
    authority: "Advisory only. Governed execution requires an Encompax disposition.",
  };
}

export function proposeLoadTransition(load: SilLoad, nextState: BrokerageLoadState, rationale: string) {
  const allowedTransitions = getAllowedLoadTransitions(load.status);
  if (!allowedTransitions.includes(nextState)) {
    throw new Error(`Transition from ${load.status} to ${nextState} is not allowed.`);
  }
  if (rationale.trim().length < 12) throw new Error("A proposal rationale of at least 12 characters is required.");

  const signal: SilGovernanceSignalDraft = {
    workspaceId: load.workspaceId,
    signalType: "DISPATCH_READINESS_REVIEW",
    sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
    severity: ["DISPATCHED", "IN_TRANSIT", "DELIVERED", "INVOICED", "CLOSED"].includes(nextState) ? "HIGH" : "MEDIUM",
    confidenceScore: 1,
    description: `SIL support agent proposes moving load ${load.loadId} from ${load.status} to ${nextState}. ${rationale.trim()}`,
    businessDomains: ["TRANSPORTATION", "SHIPMENT_VISIBILITY", "RISK"],
    affectedEntities: { loads: [load.loadId], customers: [load.customerId] },
    metrics: { currentState: load.status, proposedState: nextState },
    tags: ["sil-agent-proposal", `from:${load.status}`, `to:${nextState}`],
    recommendedActions: [{
      actionType: "LOAD_STATUS_TRANSITION",
      targetModule: "SHIPMENT_INTELLIGENCE_LAYER",
      priority: "HIGH",
      description: `Approve or hold the proposed transition to ${nextState}.`,
    }],
    rawPayloadRef: `sil:load:${load.loadId}`,
  };
  return { agent: SIL_SUPPORT_AGENT_CONTRACT, proposedAction: { type: "LOAD_STATUS_TRANSITION", loadId: load.loadId, nextState }, signal };
}
