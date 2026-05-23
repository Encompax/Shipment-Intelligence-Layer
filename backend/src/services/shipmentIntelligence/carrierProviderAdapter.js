"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestCarrierQuotes = requestCarrierQuotes;
exports.requestTrackingUpdate = requestTrackingUpdate;
const workflowEventService_1 = require("./workflowEventService");
const quoteId = (provider, carrierId) => `quote_${provider.toLowerCase()}_${carrierId}_${Date.now()}`;
function quoteConfidence(carrier) {
    let confidence = 0.62;
    if (carrier.preferred)
        confidence += 0.1;
    if (carrier.insuranceStatus === "VALID")
        confidence += 0.08;
    if (carrier.safetyStatus === "CLEAR")
        confidence += 0.08;
    if (carrier.creditStatus === "APPROVED")
        confidence += 0.08;
    if (carrier.safetyStatus === "REVIEW")
        confidence -= 0.12;
    if (carrier.creditStatus === "REVIEW")
        confidence -= 0.12;
    return Math.max(0.25, Math.min(0.96, Number(confidence.toFixed(2))));
}
function requestCarrierQuotes(input) {
    var _a, _b;
    const provider = (_a = input.provider) !== null && _a !== void 0 ? _a : "MOCK";
    const baseRate = (_b = input.load.targetBuyRate) !== null && _b !== void 0 ? _b : 500;
    const quotes = input.carriers.map((carrier, index) => {
        var _a, _b;
        const carrierAdjustment = carrier.preferred ? -0.04 : 0.08 + index * 0.03;
        const riskAdjustment = carrier.safetyStatus === "REVIEW" || carrier.creditStatus === "REVIEW" ? 0.07 : 0;
        const rate = Math.round(baseRate * (1 + carrierAdjustment + riskAdjustment));
        return {
            quoteId: quoteId(provider, carrier.carrierId),
            provider,
            carrierId: carrier.carrierId,
            carrierName: carrier.carrierName,
            serviceLevel: input.load.mode === "PARCEL" ? "GROUND" : "STANDARD",
            rate,
            currency: "USD",
            estimatedTransitDays: input.load.mode === "FTL" ? 2 : input.load.mode === "LTL" ? 3 : undefined,
            confidenceScore: quoteConfidence(carrier),
            evidence: [
                `Provider path: ${provider}`,
                `Mode: ${input.load.mode}`,
                `Equipment: ${input.load.equipmentType}`,
                `Carrier trust status: ${(_a = carrier.creditStatus) !== null && _a !== void 0 ? _a : "UNKNOWN"}/${(_b = carrier.safetyStatus) !== null && _b !== void 0 ? _b : "UNKNOWN"}`,
            ],
        };
    });
    (0, workflowEventService_1.recordWorkflowEvent)({
        eventType: "CARRIER_PROVIDER_QUOTE_REQUESTED",
        source: provider === "MANUAL" ? "USER" : "CARRIER_PROVIDER",
        loadId: input.load.loadId,
        summary: `${provider} quote request returned ${quotes.length} carrier option(s).`,
        evidence: quotes.map((quote) => `${quote.carrierName}: ${quote.rate} ${quote.currency}`),
    });
    return quotes;
}
function requestTrackingUpdate(input) {
    var _a, _b, _c;
    const provider = (_a = input.provider) !== null && _a !== void 0 ? _a : (input.shipment.source === "karrio" ? "KARRIO" : "MOCK");
    const update = {
        trackingNumber: (_b = input.shipment.trackingNumber) !== null && _b !== void 0 ? _b : `${input.shipment.shipmentId}-tracking`,
        provider,
        carrierId: input.shipment.carrierId,
        status: input.shipment.state,
        location: (_c = input.shipment.stops.find((stop) => stop.status !== "COMPLETED")) === null || _c === void 0 ? void 0 : _c.location,
        updatedAt: new Date().toISOString(),
        evidence: [
            `Provider path: ${provider}`,
            `Shipment state: ${input.shipment.state}`,
            input.shipment.carrierName ? `Carrier: ${input.shipment.carrierName}` : "Carrier not assigned",
        ],
    };
    (0, workflowEventService_1.recordWorkflowEvent)({
        eventType: "CARRIER_PROVIDER_TRACKING_REQUESTED",
        source: provider === "MANUAL" ? "USER" : "CARRIER_PROVIDER",
        shipmentId: input.shipment.shipmentId,
        carrierId: input.shipment.carrierId,
        summary: `${provider} tracking request returned ${update.status}.`,
        evidence: update.evidence,
    });
    return update;
}
