"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordWorkflowEvent = recordWorkflowEvent;
exports.listWorkflowEvents = listWorkflowEvents;
exports.seedWorkflowEvents = seedWorkflowEvents;
const workflowEvents = [];
const nowIso = () => new Date().toISOString();
const createId = (type) => `sil_evt_${type.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
function recordWorkflowEvent(input) {
    var _a, _b, _c;
    const event = {
        eventId: createId(input.eventType),
        eventType: input.eventType,
        occurredAt: nowIso(),
        actor: (_a = input.actor) !== null && _a !== void 0 ? _a : "system",
        source: (_b = input.source) !== null && _b !== void 0 ? _b : "SYSTEM",
        loadId: input.loadId,
        shipmentId: input.shipmentId,
        bidId: input.bidId,
        carrierId: input.carrierId,
        previousState: input.previousState,
        nextState: input.nextState,
        summary: input.summary,
        evidence: (_c = input.evidence) !== null && _c !== void 0 ? _c : [],
        governanceSignal: input.governanceSignal,
    };
    workflowEvents.unshift(event);
    return event;
}
function listWorkflowEvents(filters) {
    return workflowEvents.filter((event) => {
        if ((filters === null || filters === void 0 ? void 0 : filters.loadId) && event.loadId !== filters.loadId)
            return false;
        if ((filters === null || filters === void 0 ? void 0 : filters.shipmentId) && event.shipmentId !== filters.shipmentId)
            return false;
        if ((filters === null || filters === void 0 ? void 0 : filters.bidId) && event.bidId !== filters.bidId)
            return false;
        return true;
    });
}
function seedWorkflowEvents() {
    if (workflowEvents.length > 0)
        return workflowEvents;
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
