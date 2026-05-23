"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreBidMatch = scoreBidMatch;
exports.buildLoadRecommendations = buildLoadRecommendations;
exports.buildGovernanceSignalFromMatch = buildGovernanceSignalFromMatch;
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 100) / 100;
function scoreBand(score) {
    if (score >= 86)
        return "EXCELLENT";
    if (score >= 70)
        return "HIGH";
    if (score >= 50)
        return "MEDIUM";
    return "LOW";
}
function severityFromScore(score, riskFlags) {
    if (riskFlags.some((flag) => flag.includes("blocked")) || score < 45)
        return "CRITICAL";
    if (riskFlags.length >= 2 || score < 65)
        return "HIGH";
    if (score < 78)
        return "MEDIUM";
    return "LOW";
}
function findLane(load, lanes) {
    return lanes.find((lane) => lane.originRegion === load.origin.state &&
        lane.destinationRegion === load.destination.state &&
        lane.mode === load.mode &&
        lane.equipmentType === load.equipmentType);
}
function rateFit(load, bid, lane) {
    var _a, _b;
    const median = (_b = (_a = lane === null || lane === void 0 ? void 0 : lane.marketRateMedian) !== null && _a !== void 0 ? _a : load.targetBuyRate) !== null && _b !== void 0 ? _b : bid.bidRate;
    if (!median)
        return 60;
    const variance = (bid.bidRate - median) / median;
    if (variance <= -0.08)
        return 94;
    if (variance <= 0.02)
        return 86;
    if (variance <= 0.08)
        return 72;
    if (variance <= 0.16)
        return 55;
    return 35;
}
function marginFit(load, bid) {
    var _a;
    if (!load.targetSellRate)
        return 60;
    const margin = load.targetSellRate - bid.bidRate;
    const target = (_a = load.marginTarget) !== null && _a !== void 0 ? _a : load.targetSellRate * 0.12;
    if (margin >= target)
        return 90;
    if (margin > target * 0.65)
        return 75;
    if (margin > 0)
        return 55;
    return 20;
}
function carrierReliability(carrier) {
    var _a, _b, _c;
    if (!carrier)
        return 45;
    const service = (_a = carrier.serviceScore) !== null && _a !== void 0 ? _a : 65;
    const onTime = ((_b = carrier.onTimeRate) !== null && _b !== void 0 ? _b : 0.75) * 100;
    const falloffPenalty = ((_c = carrier.falloffRate) !== null && _c !== void 0 ? _c : 0.1) * 120;
    return clamp(service * 0.45 + onTime * 0.45 - falloffPenalty * 0.1);
}
function carrierTrust(carrier) {
    if (!carrier)
        return 45;
    if (carrier.blocked || carrier.safetyStatus === "BLOCKED" || carrier.creditStatus === "BLOCKED")
        return 10;
    let score = 70;
    if (carrier.preferred)
        score += 12;
    if (carrier.insuranceStatus === "VALID")
        score += 8;
    if (carrier.safetyStatus === "CLEAR")
        score += 8;
    if (carrier.creditStatus === "APPROVED")
        score += 8;
    if (carrier.safetyStatus === "REVIEW")
        score -= 14;
    if (carrier.creditStatus === "REVIEW")
        score -= 14;
    if (carrier.insuranceStatus && carrier.insuranceStatus !== "VALID")
        score -= 20;
    return clamp(score);
}
function timingFit(load, bid) {
    if (!load.pickupWindowStart || !bid.estimatedPickupCommitment)
        return 62;
    const pickupStart = new Date(load.pickupWindowStart).getTime();
    const commitment = new Date(bid.estimatedPickupCommitment).getTime();
    const hoursLate = (commitment - pickupStart) / (1000 * 60 * 60);
    if (hoursLate <= 0)
        return 92;
    if (hoursLate <= 2)
        return 80;
    if (hoursLate <= 6)
        return 58;
    return 30;
}
function buildRiskFlags(context, factors) {
    var _a;
    const flags = [];
    const { carrier, load, bid, lane } = context;
    if (!carrier)
        flags.push("carrier profile missing");
    if (carrier === null || carrier === void 0 ? void 0 : carrier.blocked)
        flags.push("carrier blocked");
    if ((carrier === null || carrier === void 0 ? void 0 : carrier.safetyStatus) === "REVIEW")
        flags.push("carrier safety in review");
    if ((carrier === null || carrier === void 0 ? void 0 : carrier.creditStatus) === "REVIEW")
        flags.push("carrier credit in review");
    if (((_a = carrier === null || carrier === void 0 ? void 0 : carrier.falloffRate) !== null && _a !== void 0 ? _a : 0) >= 0.1)
        flags.push("carrier falloff rate elevated");
    if (factors && factors.rateFit < 60)
        flags.push("bid rate above lane tolerance");
    if (factors && factors.marginFit < 60)
        flags.push("margin below target");
    if (!lane)
        flags.push("lane history missing");
    if (load.targetSellRate && bid.bidRate > load.targetSellRate)
        flags.push("bid exceeds sell rate");
    return flags;
}
function recommendedAction(score, riskFlags) {
    if (riskFlags.some((flag) => flag.includes("blocked")))
        return "REJECT";
    if (riskFlags.length >= 2 || score < 68)
        return "ROUTE_TO_ENCOMPAX";
    if (score >= 86)
        return "AWARD";
    if (score >= 70)
        return "SHORTLIST";
    return "REQUEST_MORE_CONTEXT";
}
function scoreBidMatch(context) {
    const factors = {
        laneFit: context.lane ? 88 : 42,
        rateFit: rateFit(context.load, context.bid, context.lane),
        marginFit: marginFit(context.load, context.bid),
        carrierReliability: carrierReliability(context.carrier),
        carrierTrust: carrierTrust(context.carrier),
        timingFit: timingFit(context.load, context.bid),
    };
    const score = clamp(factors.laneFit * 0.12 +
        factors.rateFit * 0.18 +
        factors.marginFit * 0.18 +
        factors.carrierReliability * 0.22 +
        factors.carrierTrust * 0.2 +
        factors.timingFit * 0.1);
    const riskFlags = buildRiskFlags(context, factors);
    const action = recommendedAction(score, riskFlags);
    const evidence = [
        `Lane fit score: ${round(factors.laneFit)}`,
        `Rate fit score: ${round(factors.rateFit)}`,
        `Margin fit score: ${round(factors.marginFit)}`,
        `Carrier reliability score: ${round(factors.carrierReliability)}`,
        `Carrier trust score: ${round(factors.carrierTrust)}`,
        `Timing fit score: ${round(factors.timingFit)}`,
        ...riskFlags.map((flag) => `Risk flag: ${flag}`),
    ];
    return {
        score: Math.round(score),
        scoreBand: scoreBand(score),
        factors,
        riskFlags,
        recommendedAction: action,
        evidence,
        governanceSignalRequired: action === "ROUTE_TO_ENCOMPAX" || action === "REJECT",
    };
}
function buildLoadRecommendations(context) {
    const lane = findLane(context.load, context.lanes);
    return context.bids
        .filter((bid) => bid.loadId === context.load.loadId)
        .map((bid) => {
        const carrier = context.carriers.find((item) => item.carrierId === bid.carrierId);
        return {
            ...bid,
            score: scoreBidMatch({
                load: context.load,
                bid,
                carrier,
                lane,
                posting: context.posting,
            }),
        };
    })
        .sort((left, right) => { var _a, _b, _c, _d; return ((_b = (_a = right.score) === null || _a === void 0 ? void 0 : _a.score) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = left.score) === null || _c === void 0 ? void 0 : _c.score) !== null && _d !== void 0 ? _d : 0); });
}
function buildGovernanceSignalFromMatch(context, score) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const projectedMargin = typeof context.load.targetSellRate === "number" ? context.load.targetSellRate - context.bid.bidRate : null;
    const severity = severityFromScore(score.score, (_a = score.riskFlags) !== null && _a !== void 0 ? _a : []);
    return {
        signalType: ((_b = score.riskFlags) === null || _b === void 0 ? void 0 : _b.some((flag) => flag.includes("credit") || flag.includes("safety") || flag.includes("blocked")))
            ? "CARRIER_CREDIT_RISK"
            : ((_c = score.riskFlags) === null || _c === void 0 ? void 0 : _c.some((flag) => flag.includes("margin") || flag.includes("rate")))
                ? "BROKER_MARGIN_RISK"
                : "LOAD_BOARD_BID_OPPORTUNITY",
        sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
        severity,
        confidenceScore: round(Math.max(0.55, Math.min(0.95, score.score / 100))),
        description: `${(_e = (_d = context.carrier) === null || _d === void 0 ? void 0 : _d.carrierName) !== null && _e !== void 0 ? _e : context.bid.carrierId} bid requires governed review for ${(_f = context.load.customerName) !== null && _f !== void 0 ? _f : context.load.customerId}.`,
        businessDomains: ["TRANSPORTATION", "FREIGHT_BROKERAGE", "RISK", "CUSTOMER_SERVICE"],
        affectedEntities: {
            loads: [context.load.loadId],
            carriers: [context.bid.carrierId],
            lanes: context.lane ? [context.lane.laneId] : [],
            customers: [context.load.customerId],
        },
        metrics: {
            match_score: score.score,
            bid_rate: context.bid.bidRate,
            target_sell_rate: (_g = context.load.targetSellRate) !== null && _g !== void 0 ? _g : null,
            target_buy_rate: (_h = context.load.targetBuyRate) !== null && _h !== void 0 ? _h : null,
            projected_margin: projectedMargin,
            market_median_rate: (_k = (_j = context.lane) === null || _j === void 0 ? void 0 : _j.marketRateMedian) !== null && _k !== void 0 ? _k : null,
            carrier_falloff_rate: (_m = (_l = context.carrier) === null || _l === void 0 ? void 0 : _l.falloffRate) !== null && _m !== void 0 ? _m : null,
            carrier_on_time_rate: (_p = (_o = context.carrier) === null || _o === void 0 ? void 0 : _o.onTimeRate) !== null && _p !== void 0 ? _p : null,
        },
        tags: ["sil", "brokerage", "load-board", "matching-engine"],
        recommendedActions: [
            {
                actionType: "ROUTE_CARRIER_AWARD_FOR_REVIEW",
                targetModule: "PLATFORM_OVERVIEW",
                priority: severity === "CRITICAL" ? "CRITICAL" : "HIGH",
                description: "Route carrier award decision to Encompax before dispatch commitment.",
            },
        ],
        rawPayloadRef: `sil:bid:${context.bid.bidId}`,
    };
}
