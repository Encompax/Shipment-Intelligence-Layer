import { getAllowedLoadTransitions } from "./loadLifecycleService";
import { BrokerageLoadState, SilGovernanceSignalDraft, SilLoad } from "./types";

export const SIL_SUPPORT_AGENT_CONTRACT = {
  contractVersion: "1.1",
  responseContractVersion: "encompax.module-agent.response.v1",
  agentId: process.env.MODULE_AGENT_SIL_ID?.trim() || "sil_manager_v1",
  displayName: "SIL Operations Assistant",
  provider: "MANUAL",
  modelRef: process.env.MODULE_AGENT_SIL_MODEL?.trim() || null,
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

export function assistLoad(load: SilLoad, operatorMessage: string) {
  const message = operatorMessage.trim();
  if (message.length < 2) throw new Error("An operator message is required.");
  if (message.length > 2000) throw new Error("Operator messages cannot exceed 2000 characters.");

  const allowedTransitions = getAllowedLoadTransitions(load.status);
  const normalized = message.toLowerCase();
  let response = `Load ${load.loadId} is currently ${load.status}. I can help review its evidence, risks, and governed next step.`;
  let actionDraft: {
    actionType: "LOAD_STATUS_TRANSITION";
    targetId: string;
    rationale: string;
    parameters: { nextState: BrokerageLoadState };
    status: "draft";
    requiredDisposition: "EXECUTE_ALLOWED";
  } | null = null;

  if (/risk|exception|hold|problem|delay/.test(normalized)) {
    response = `Review dispatch readiness, carrier coverage, appointment constraints, and customer impact before releasing ${load.loadId}. Any material exception should be published for Encompax review.`;
  } else if (/carrier|bid|rate|margin|cost/.test(normalized)) {
    response = `Compare carrier readiness and the buy-versus-sell position for ${load.loadId}. Preserve the selected bid, margin evidence, and any override reason before proposing an award or dispatch action.`;
  } else if (/next|status|move|transition|propose/.test(normalized)) {
    response = allowedTransitions.length
      ? `The valid next states from ${load.status} are ${allowedTransitions.join(", ")}. I can draft the first valid transition, but an operator must submit it and Encompax must approve execution.`
      : `Load ${load.loadId} has no further lifecycle transition available from ${load.status}.`;
    if (allowedTransitions[0]) {
      actionDraft = {
        actionType: "LOAD_STATUS_TRANSITION",
        targetId: load.loadId,
        rationale: `Operator review requested progression of ${load.loadId} from ${load.status} to ${allowedTransitions[0]}.`,
        parameters: { nextState: allowedTransitions[0] },
        status: "draft",
        requiredDisposition: "EXECUTE_ALLOWED",
      };
    }
  } else if (/idea|improve|optimi|recommend|help/.test(normalized)) {
    response = `A useful improvement review for ${load.loadId} is to confirm data completeness, carrier response quality, margin protection, and exception ownership. I can turn a selected lifecycle recommendation into a draft for human review.`;
  }

  return {
    contractVersion: "encompax.module-agent.response.v1",
    agent: SIL_SUPPORT_AGENT_CONTRACT,
    loadId: load.loadId,
    response,
    evidence: [
      `State: ${load.status}`,
      `Customer: ${load.customerId}`,
      `Route: ${load.origin.city}, ${load.origin.state} to ${load.destination.city}, ${load.destination.state}`,
    ],
    suggestedPrompts: [
      "What risks should I review?",
      "Explain the valid next action",
      "Suggest an operational improvement",
    ],
    actionDraft,
    provider: "MANUAL",
    model: null,
    agentId: SIL_SUPPORT_AGENT_CONTRACT.agentId,
    governanceStatus: actionDraft ? "DRAFT" : "ADVISORY",
    requiresApproval: Boolean(actionDraft),
    authority: "Advisory only. The operator submits proposals and Encompax authorizes execution.",
  };
}

export function assistWorkspace(operatorMessage: string) {
  const message = operatorMessage.trim();
  if (message.length < 2) throw new Error("An operator message is required.");
  if (message.length > 2000) throw new Error("Operator messages cannot exceed 2000 characters.");

  return {
    contractVersion: "encompax.module-agent.response.v1",
    agent: SIL_SUPPORT_AGENT_CONTRACT,
    response: "I can explain SIL workflows, help identify operational risks, and organize an idea before you attach it to a load. Select a load when you need evidence-specific guidance or a governed action draft.",
    evidence: [
      "Workspace context: Shipment Intelligence Layer",
      "Authority: advisory only",
    ],
    suggestedPrompts: [
      "How does transportation workflow move through SIL?",
      "What should I review today?",
      "Help me organize an operations improvement idea",
    ],
    actionDraft: null,
    provider: "MANUAL",
    model: null,
    agentId: SIL_SUPPORT_AGENT_CONTRACT.agentId,
    governanceStatus: "ADVISORY",
    requiresApproval: false,
    authority: "Advisory only. Load-specific proposals require selected context and Encompax authorization.",
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
