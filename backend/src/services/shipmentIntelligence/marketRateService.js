"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeMarketRate = analyzeMarketRate;
const workflowEventService_1 = require("./workflowEventService");
const round = (value) => Math.round(value * 100) / 100;
const bidTotalCost = (bid) => {
    var _a, _b, _c, _d, _e;
    return bid
        ? (_a = bid.totalCost) !== null && _a !== void 0 ? _a : bid.bidRate + ((_b = bid.fuelSurcharge) !== null && _b !== void 0 ? _b : 0) + ((_c = bid.accessorialTotal) !== null && _c !== void 0 ? _c : 0) + ((_d = bid.lumperFee) !== null && _d !== void 0 ? _d : 0) + ((_e = bid.detentionEstimate) !== null && _e !== void 0 ? _e : 0)
        : undefined;
};
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
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
            bid_total_cost: (_e = (_d = input.bid) === null || _d === void 0 ? void 0 : _d.totalCost) !== null && _e !== void 0 ? _e : (input.bid
                ? input.bid.bidRate +
                    ((_f = input.bid.fuelSurcharge) !== null && _f !== void 0 ? _f : 0) +
                    ((_g = input.bid.accessorialTotal) !== null && _g !== void 0 ? _g : 0) +
                    ((_h = input.bid.lumperFee) !== null && _h !== void 0 ? _h : 0) +
                    ((_j = input.bid.detentionEstimate) !== null && _j !== void 0 ? _j : 0)
                : null),
            market_median_rate: (_k = input.analysis.marketMedianRate) !== null && _k !== void 0 ? _k : null,
            target_buy_rate: (_l = input.analysis.targetBuyRate) !== null && _l !== void 0 ? _l : null,
            target_sell_rate: (_m = input.analysis.targetSellRate) !== null && _m !== void 0 ? _m : null,
            projected_margin: (_o = input.analysis.projectedMargin) !== null && _o !== void 0 ? _o : null,
            rate_variance_percent: (_p = input.analysis.rateVariancePercent) !== null && _p !== void 0 ? _p : null,
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const medianFromObservation = (_b = (_a = input.observations) === null || _a === void 0 ? void 0 : _a.find((item) => { var _a; return item.laneId === ((_a = input.lane) === null || _a === void 0 ? void 0 : _a.laneId); })) === null || _b === void 0 ? void 0 : _b.medianRate;
    const marketMedianRate = (_d = (_c = input.lane) === null || _c === void 0 ? void 0 : _c.marketRateMedian) !== null && _d !== void 0 ? _d : medianFromObservation;
    const bidRate = (_e = input.bid) === null || _e === void 0 ? void 0 : _e.bidRate;
    const totalCost = bidTotalCost(input.bid);
    const targetBuyRate = input.load.targetBuyRate;
    const targetSellRate = input.load.targetSellRate;
    const customerCharges = ((_f = input.load.fuelSurcharge) !== null && _f !== void 0 ? _f : 0) + ((_g = input.load.accessorialEstimate) !== null && _g !== void 0 ? _g : 0) + ((_h = input.load.lumperEstimate) !== null && _h !== void 0 ? _h : 0);
    const projectedMargin = totalCost !== undefined && targetSellRate !== undefined ? targetSellRate + customerCharges - totalCost : undefined;
    const rateBasis = totalCost !== null && totalCost !== void 0 ? totalCost : targetBuyRate;
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
        laneId: (_k = (_j = input.lane) === null || _j === void 0 ? void 0 : _j.laneId) !== null && _k !== void 0 ? _k : "unmatched-lane",
        loadId: input.load.loadId,
        bidId: (_l = input.bid) === null || _l === void 0 ? void 0 : _l.bidId,
        marketMedianRate,
        bidRate,
        targetBuyRate,
        targetSellRate,
        projectedMargin,
        rateVariancePercent,
        marginVariance,
        pressureLevel: pressure,
        evidence: [
            ...evidence,
            totalCost !== undefined ? `Bid total cost with accessorials: ${totalCost}` : "Bid total cost unavailable",
            customerCharges > 0 ? `Customer recoverable charges: ${customerCharges}` : "No customer recoverable charges configured",
        ],
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
        bidId: (_m = input.bid) === null || _m === void 0 ? void 0 : _m.bidId,
        carrierId: (_o = input.bid) === null || _o === void 0 ? void 0 : _o.carrierId,
        summary: `Market rate analysis completed with ${analysis.pressureLevel} pressure.`,
        evidence,
        governanceSignal: analysis.governanceSignal,
    });
    return analysis;
}
