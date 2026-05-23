import { BrokerageLoadState, SilLoad, SilLoadTransitionResult } from "./types";
import { recordWorkflowEvent } from "./workflowEventService";

const allowedTransitions: Record<BrokerageLoadState, BrokerageLoadState[]> = {
  LOAD_CREATED: ["READY_TO_POST", "CANCELED"],
  READY_TO_POST: ["POSTED", "CANCELED"],
  POSTED: ["BIDDING", "CARRIER_SELECTED", "CANCELED"],
  BIDDING: ["CARRIER_SELECTED", "POSTED", "CANCELED"],
  CARRIER_SELECTED: ["TENDERED", "POSTED", "CANCELED"],
  TENDERED: ["ACCEPTED", "POSTED", "CANCELED"],
  ACCEPTED: ["DISPATCHED", "CANCELED"],
  DISPATCHED: ["IN_TRANSIT", "CANCELED"],
  IN_TRANSIT: ["DELIVERED", "CANCELED"],
  DELIVERED: ["INVOICED", "CLOSED"],
  INVOICED: ["CLOSED"],
  CLOSED: [],
  CANCELED: ["READY_TO_POST"],
};

function evidenceForTransition(nextState: BrokerageLoadState) {
  switch (nextState) {
    case "POSTED":
      return ["posting board", "visibility", "posted rate"];
    case "CARRIER_SELECTED":
      return ["selected carrier", "bid review", "rate/margin check"];
    case "TENDERED":
      return ["carrier tender", "pickup window", "delivery window"];
    case "ACCEPTED":
      return ["carrier acceptance timestamp", "service commitment"];
    case "DISPATCHED":
      return ["dispatch confirmation", "driver/carrier contact", "pickup appointment"];
    case "IN_TRANSIT":
      return ["pickup completion", "tracking update"];
    case "DELIVERED":
      return ["delivery confirmation", "POD or receiving confirmation"];
    case "INVOICED":
      return ["invoice draft", "rate confirmation", "delivery evidence"];
    case "CLOSED":
      return ["final invoice", "customer/service review"];
    default:
      return [];
  }
}

export function getAllowedLoadTransitions(currentState: BrokerageLoadState) {
  return allowedTransitions[currentState] ?? [];
}

export function transitionLoadState(input: {
  load: SilLoad;
  nextState: BrokerageLoadState;
  actor?: string;
  evidence?: string[];
}): SilLoadTransitionResult {
  const previousState = input.load.status;
  const allowed = getAllowedLoadTransitions(previousState);
  const requiredEvidence = evidenceForTransition(input.nextState);
  const warnings: string[] = [];

  if (!allowed.includes(input.nextState)) {
    warnings.push(`Transition from ${previousState} to ${input.nextState} is not allowed.`);
    const event = recordWorkflowEvent({
      eventType: "LOAD_STATUS_CHANGED",
      actor: input.actor ?? "system",
      loadId: input.load.loadId,
      previousState,
      nextState: previousState,
      summary: `Rejected invalid load transition from ${previousState} to ${input.nextState}.`,
      evidence: warnings,
    });

    return {
      accepted: false,
      load: input.load,
      previousState,
      nextState: previousState,
      warnings,
      requiredEvidence,
      event,
    };
  }

  const missingEvidence = requiredEvidence.filter(
    (requirement) =>
      !(input.evidence ?? []).some((item) => item.toLowerCase().includes(requirement.toLowerCase()))
  );

  if (missingEvidence.length > 0) {
    warnings.push(`Evidence still needed: ${missingEvidence.join(", ")}`);
  }

  const updatedLoad: SilLoad = { ...input.load, status: input.nextState };
  const event = recordWorkflowEvent({
    eventType: "LOAD_STATUS_CHANGED",
    actor: input.actor ?? "system",
    loadId: input.load.loadId,
    previousState,
    nextState: input.nextState,
    summary: `Load moved from ${previousState} to ${input.nextState}.`,
    evidence: input.evidence ?? requiredEvidence,
  });

  return {
    accepted: true,
    load: updatedLoad,
    previousState,
    nextState: input.nextState,
    warnings,
    requiredEvidence,
    event,
  };
}
