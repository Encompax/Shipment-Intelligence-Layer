"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeMarketRate = analyzeMarketRate;
const workflowEventService_1 = require("./workflowEventService");
const round = (value) => Math.round(value * 100) / 100;
function pressureLevel(rateVariancePercent, projectedMargin) {
    if (projectedMargin !== undefined && projectedMargin !== null && projectedMargin < 0)
        return "CRITICAL";
    if (rateVariancePercent >= 18)
        return "CRITICAL";
    if (rateVariancePercent >= 8)
        return "HIGH";
    if (rateVariancePercent >= 3)
        return "MEDIUM";
    return "LOW";
}
function buildLaneSignal(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!["HIGH", "CRITICAL"].includes(input.analysis.pressureLevel))
        return undefined;
    return {
        signalType: input.analysis.projectedMargin !== undefined &&
            input.analysis.projectedMargin !== null &&
            input.analysis.projectedMargin < ((_a = input.load.marginTarget) !== null && _a !== void 0 ? _a : 0)
            ? "BROKER_MARGIN_RISK"
            : "LANE_RATE_EXCEPTION",
        sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
        severity: input.analysis.pressureLevel,
        confidenceScore: 0.78,
        description: `Lane rate pressure detected for ${(_b = input.load.customerName) !== null && _b !== void 0 ? _b : input.load.customerId}.`,
        businessDomains: ["TRANSPORTATION", "FREIGHT_BROKERAGE", "FINANCE", "RISK"],
        affectedEntities: {
            loads: [input.load.loadId],
            lanes: input.lane ? [input.lane.laneId] : [],
            customers: [input.load.customerId],
            carriers: input.bid ? [input.bid.carrierId] : [],
        },
        metrics: {
            bid_rate: (_c = input.analysis.bidRate) !== null && _c !== void 0 ? _c : null,
            market_median_rate: (_d = input.analysis.marketMedianRate) !== null && _d !== void 0 ? _d : null,
            target_buy_rate: (_e = input.analysis.targetBuyRate) !== null && _e !== void 0 ? _e : null,
            target_sell_rate: (_f = input.analysis.targetSellRate) !== null && _f !== void 0 ? _f : null,
            projected_margin: (_g = input.analysis.projectedMargin) !== null && _g !== void 0 ? _g : null,
            rate_variance_percent: (_h = input.analysis.rateVariancePercent) !== null && _h !== void 0 ? _h : null,
        },
        tags: ["sil", "market-rate", "margin", "lane"],
        recommendedActions: [
            {
                actionType: "REVIEW_RATE_AND_MARGIN_PRESSURE",
                targetModule: "PLATFORM_OVERVIEW",
                priority: input.analysis.pressureLevel,
                description: "Review rate variance and projected margin before carrier award or customer commitment.",
            },
        ],
        rawPayloadRef: input.bid ? `sil:bid:${input.bid.bidId}` : `sil:load:${input.load.loadId}`,
    };
}
function analyzeMarketRate(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const medianFromObservation = (_b = (_a = input.observations) === null || _a === void 0 ? void 0 : _a.find((item) => { var _a; return item.laneId === ((_a = input.lane) === null || _a === void 0 ? void 0 : _a.laneId); })) === null || _b === void 0 ? void 0 : _b.medianRate;
    const marketMedianRate = (_d = (_c = input.lane) === null || _c === void 0 ? void 0 : _c.marketRateMedian) !== null && _d !== void 0 ? _d : medianFromObservation;
    const bidRate = (_e = input.bid) === null || _e === void 0 ? void 0 : _e.bidRate;
    const targetBuyRate = input.load.targetBuyRate;
    const targetSellRate = input.load.targetSellRate;
    const projectedMargin = bidRate !== undefined && targetSellRate !== undefined ? targetSellRate - bidRate : undefined;
    const rateBasis = bidRate !== null && bidRate !== void 0 ? bidRate : targetBuyRate;
    const rateVariancePercent = rateBasis !== undefined && marketMedianRate
        ? round(((rateBasis - marketMedianRate) / marketMedianRate) * 100)
        : undefined;
    const marginVariance = projectedMargin !== undefined && input.load.marginTarget !== undefined
        ? round(projectedMargin - input.load.marginTarget)
        : undefined;
    const pressure = pressureLevel(Math.abs(rateVariancePercent !== null && rateVariancePercent !== void 0 ? rateVariancePercent : 0), projectedMargin);
    const evidence = [
        marketMedianRate !== undefined ? `Market median rate: ${marketMedianRate}` : "Market median rate unavailable",
        bidRate !== undefined ? `Bid rate: ${bidRate}` : "Bid rate unavailable",
        projectedMargin !== undefined ? `Projected margin: ${projectedMargin}` : "Projected margin unavailable",
        rateVariancePercent !== undefined
            ? `Rate variance from median: ${rateVariancePercent}%`
            : "Rate variance unavailable",
    ];
    const analysis = {
        laneId: (_g = (_f = input.lane) === null || _f === void 0 ? void 0 : _f.laneId) !== null && _g !== void 0 ? _g : "unmatched-lane",
        loadId: input.load.loadId,
        bidId: (_h = input.bid) === null || _h === void 0 ? void 0 : _h.bidId,
        marketMedianRate,
        bidRate,
        targetBuyRate,
        targetSellRate,
        projectedMargin,
        rateVariancePercent,
        marginVariance,
        pressureLevel: pressure,
        evidence,
    };
    analysis.governanceSignal = buildLaneSignal({
        load: input.load,
        bid: input.bid,
        lane: input.lane,
        analysis,
    });
    (0, workflowEventService_1.recordWorkflowEvent)({
        eventType: analysis.governanceSignal ? "GOVERNANCE_SIGNAL_CREATED" : "BID_REVIEWED",
        loadId: input.load.loadId,
        bidId: (_j = input.bid) === null || _j === void 0 ? void 0 : _j.bidId,
        carrierId: (_k = input.bid) === null || _k === void 0 ? void 0 : _k.carrierId,
        summary: `Market rate analysis completed with ${analysis.pressureLevel} pressure.`,
        evidence,
        governanceSignal: analysis.governanceSignal,
    });
    return analysis;
}
