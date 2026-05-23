"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllowedLoadTransitions = getAllowedLoadTransitions;
exports.transitionLoadState = transitionLoadState;
const workflowEventService_1 = require("./workflowEventService");
const allowedTransitions = {
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
function evidenceForTransition(nextState) {
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
function getAllowedLoadTransitions(currentState) {
    var _a;
    return (_a = allowedTransitions[currentState]) !== null && _a !== void 0 ? _a : [];
}
function transitionLoadState(input) {
    var _a, _b, _c;
    const previousState = input.load.status;
    const allowed = getAllowedLoadTransitions(previousState);
    const requiredEvidence = evidenceForTransition(input.nextState);
    const warnings = [];
    if (!allowed.includes(input.nextState)) {
        warnings.push(`Transition from ${previousState} to ${input.nextState} is not allowed.`);
        const event = (0, workflowEventService_1.recordWorkflowEvent)({
            eventType: "LOAD_STATUS_CHANGED",
            actor: (_a = input.actor) !== null && _a !== void 0 ? _a : "system",
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
    const missingEvidence = requiredEvidence.filter((requirement) => { var _a; return !((_a = input.evidence) !== null && _a !== void 0 ? _a : []).some((item) => item.toLowerCase().includes(requirement.toLowerCase())); });
    if (missingEvidence.length > 0) {
        warnings.push(`Evidence still needed: ${missingEvidence.join(", ")}`);
    }
    const updatedLoad = { ...input.load, status: input.nextState };
    const event = (0, workflowEventService_1.recordWorkflowEvent)({
        eventType: "LOAD_STATUS_CHANGED",
        actor: (_b = input.actor) !== null && _b !== void 0 ? _b : "system",
        loadId: input.load.loadId,
        previousState,
        nextState: input.nextState,
        summary: `Load moved from ${previousState} to ${input.nextState}.`,
        evidence: (_c = input.evidence) !== null && _c !== void 0 ? _c : requiredEvidence,
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
