"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreBidMatch = scoreBidMatch;
exports.buildLoadRecommendations = buildLoadRecommendations;
exports.buildCarrierEligibilityRecommendations = buildCarrierEligibilityRecommendations;
exports.buildGovernanceSignalFromMatch = buildGovernanceSignalFromMatch;
exports.buildDispatchReadiness = buildDispatchReadiness;
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 100) / 100;
const normalizeStatus = (value) => value === null || value === void 0 ? void 0 : value.trim().toUpperCase();
function bidTotalCost(bid) {
    var _a, _b, _c, _d, _e;
    return ((_a = bid.totalCost) !== null && _a !== void 0 ? _a : bid.bidRate +
        ((_b = bid.fuelSurcharge) !== null && _b !== void 0 ? _b : 0) +
        ((_c = bid.accessorialTotal) !== null && _c !== void 0 ? _c : 0) +
        ((_d = bid.lumperFee) !== null && _d !== void 0 ? _d : 0) +
        ((_e = bid.detentionEstimate) !== null && _e !== void 0 ? _e : 0));
}
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
    const variance = (bidTotalCost(bid) - median) / median;
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
    var _a, _b, _c, _d;
    if (!load.targetSellRate)
        return 60;
    const customerCharges = ((_a = load.fuelSurcharge) !== null && _a !== void 0 ? _a : 0) + ((_b = load.accessorialEstimate) !== null && _b !== void 0 ? _b : 0) + ((_c = load.lumperEstimate) !== null && _c !== void 0 ? _c : 0);
    const margin = load.targetSellRate + customerCharges - bidTotalCost(bid);
    const target = (_d = load.marginTarget) !== null && _d !== void 0 ? _d : load.targetSellRate * 0.12;
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
    const safetyStatus = normalizeStatus(carrier.safetyStatus);
    const creditStatus = normalizeStatus(carrier.creditStatus);
    const insuranceStatus = normalizeStatus(carrier.insuranceStatus);
    if (carrier.blocked || safetyStatus === "BLOCKED" || creditStatus === "BLOCKED")
        return 5;
    let score = 70;
    if (carrier.preferred)
        score += 12;
    if (insuranceStatus === "VALID")
        score += 8;
    if (safetyStatus === "CLEAR")
        score += 8;
    if (creditStatus === "APPROVED")
        score += 8;
    if (safetyStatus === "REVIEW")
        score -= 18;
    if (creditStatus === "REVIEW")
        score -= 18;
    if (insuranceStatus === "REVIEW")
        score -= 12;
    if (["EXPIRED", "INVALID", "BLOCKED"].includes(insuranceStatus !== null && insuranceStatus !== void 0 ? insuranceStatus : ""))
        score -= 24;
    if (!safetyStatus || safetyStatus === "UNKNOWN")
        score -= 8;
    if (!creditStatus || creditStatus === "UNKNOWN")
        score -= 8;
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
    var _a, _b, _c, _d, _e, _f;
    const flags = [];
    const { carrier, load, bid, lane } = context;
    const safetyStatus = normalizeStatus(carrier === null || carrier === void 0 ? void 0 : carrier.safetyStatus);
    const creditStatus = normalizeStatus(carrier === null || carrier === void 0 ? void 0 : carrier.creditStatus);
    const insuranceStatus = normalizeStatus(carrier === null || carrier === void 0 ? void 0 : carrier.insuranceStatus);
    if (!carrier)
        flags.push("carrier profile missing");
    if (carrier === null || carrier === void 0 ? void 0 : carrier.blocked)
        flags.push("carrier blocked by workspace policy");
    if (safetyStatus === "BLOCKED")
        flags.push("carrier safety blocked");
    if (creditStatus === "BLOCKED")
        flags.push("carrier credit blocked");
    if (safetyStatus === "REVIEW")
        flags.push("carrier safety in review");
    if (creditStatus === "REVIEW")
        flags.push("carrier credit in review");
    if (insuranceStatus === "REVIEW")
        flags.push("carrier insurance in review");
    if (["EXPIRED", "INVALID", "BLOCKED"].includes(insuranceStatus !== null && insuranceStatus !== void 0 ? insuranceStatus : ""))
        flags.push("carrier insurance not valid");
    if (!safetyStatus || safetyStatus === "UNKNOWN")
        flags.push("carrier safety status unknown");
    if (!creditStatus || creditStatus === "UNKNOWN")
        flags.push("carrier credit status unknown");
    if (((_a = carrier === null || carrier === void 0 ? void 0 : carrier.falloffRate) !== null && _a !== void 0 ? _a : 0) >= 0.1)
        flags.push("carrier falloff rate elevated");
    if (factors && factors.rateFit < 60)
        flags.push("bid rate above lane tolerance");
    if (factors && factors.marginFit < 60)
        flags.push("margin below target");
    if (!lane)
        flags.push("lane history missing");
    if (load.targetSellRate && bidTotalCost(bid) > load.targetSellRate + ((_b = load.fuelSurcharge) !== null && _b !== void 0 ? _b : 0) + ((_c = load.accessorialEstimate) !== null && _c !== void 0 ? _c : 0)) {
        flags.push("bid total exceeds commercial recovery");
    }
    if (((_d = bid.accessorialTotal) !== null && _d !== void 0 ? _d : 0) + ((_e = bid.lumperFee) !== null && _e !== void 0 ? _e : 0) + ((_f = bid.detentionEstimate) !== null && _f !== void 0 ? _f : 0) > 0) {
        flags.push("bid includes accessorial charges");
    }
    if (bid.status === "EXPIRED")
        flags.push("bid expired");
    if (bid.expiresAt && new Date(bid.expiresAt).getTime() < Date.now())
        flags.push("bid response window expired");
    if (bid.counterOfferStatus === "PENDING")
        flags.push("counteroffer pending carrier response");
    return flags;
}
function buildGovernanceReasons(riskFlags, score) {
    const reasons = riskFlags.filter((flag) => ["blocked", "review", "unknown", "not valid", "margin", "rate", "profile missing", "expired", "counteroffer"].some((keyword) => flag.includes(keyword)));
    if (score < 68)
        reasons.push(`match score below governed routing threshold: ${Math.round(score)}`);
    return [...new Set(reasons)];
}
function carrierDecisionSummary(carrier, riskFlags, action) {
    if (!carrier)
        return "Carrier profile is missing; award should not proceed without governed review.";
    if (riskFlags.some((flag) => flag.includes("blocked")))
        return "Carrier is blocked or has a blocked compliance status.";
    if (riskFlags.some((flag) => flag.includes("review") || flag.includes("unknown") || flag.includes("not valid"))) {
        return "Carrier can be considered, but compliance evidence requires Encompax review before award.";
    }
    if (carrier.preferred && action === "AWARD")
        return "Preferred carrier with clean trust signals and award-ready score.";
    return "Carrier bid is scored against lane, margin, timing, reliability, and trust evidence.";
}
function recommendedAction(score, riskFlags) {
    if (riskFlags.some((flag) => flag.includes("expired")))
        return "REQUEST_MORE_CONTEXT";
    if (riskFlags.some((flag) => flag.includes("blocked")))
        return "REJECT";
    if (riskFlags.some((flag) => flag.includes("review") || flag.includes("unknown") || flag.includes("not valid")) ||
        riskFlags.length >= 2 ||
        score < 68) {
        return "ROUTE_TO_ENCOMPAX";
    }
    if (score >= 86)
        return "AWARD";
    if (score >= 70)
        return "SHORTLIST";
    return "REQUEST_MORE_CONTEXT";
}
function scoreBidMatch(context) {
    var _a, _b, _c, _d, _e, _f, _g;
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
    const governanceReasons = buildGovernanceReasons(riskFlags, score);
    const decisionSummary = carrierDecisionSummary(context.carrier, riskFlags, action);
    const evidence = [
        decisionSummary,
        ((_a = context.carrier) === null || _a === void 0 ? void 0 : _a.preferred) ? "Carrier is marked preferred in this workspace." : "Carrier is not marked preferred.",
        `Carrier credit status: ${(_c = (_b = context.carrier) === null || _b === void 0 ? void 0 : _b.creditStatus) !== null && _c !== void 0 ? _c : "UNKNOWN"}`,
        `Carrier safety status: ${(_e = (_d = context.carrier) === null || _d === void 0 ? void 0 : _d.safetyStatus) !== null && _e !== void 0 ? _e : "UNKNOWN"}`,
        `Carrier insurance status: ${(_g = (_f = context.carrier) === null || _f === void 0 ? void 0 : _f.insuranceStatus) !== null && _g !== void 0 ? _g : "UNKNOWN"}`,
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
        governanceReasons,
        carrierDecisionSummary: decisionSummary,
        recommendedAction: action,
        evidence,
        governanceSignalRequired: governanceReasons.length > 0 || action === "ROUTE_TO_ENCOMPAX" || action === "REJECT",
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
function buildCarrierEligibilityRecommendations(input) {
    const lane = findLane(input.load, input.lanes);
    return input.carriers
        .map((carrier) => {
        var _a, _b, _c;
        const trust = carrierTrust(carrier);
        const reliability = carrierReliability(carrier);
        const laneFit = lane ? 88 : 52;
        const preferredBoost = carrier.preferred ? 8 : 0;
        const blocked = carrier.blocked ||
            normalizeStatus(carrier.safetyStatus) === "BLOCKED" ||
            normalizeStatus(carrier.creditStatus) === "BLOCKED";
        const reviewRequired = normalizeStatus(carrier.safetyStatus) === "REVIEW" ||
            normalizeStatus(carrier.creditStatus) === "REVIEW" ||
            normalizeStatus(carrier.insuranceStatus) === "REVIEW";
        const eligibilityScore = blocked ? 0 : clamp(trust * 0.42 + reliability * 0.36 + laneFit * 0.14 + preferredBoost);
        const inviteRecommendation = blocked
            ? "DO_NOT_INVITE"
            : reviewRequired || eligibilityScore < 64
                ? "INVITE_WITH_REVIEW"
                : eligibilityScore >= 78
                    ? "INVITE"
                    : "BACKUP";
        const evidence = [
            `Trust score: ${round(trust)}`,
            `Reliability score: ${round(reliability)}`,
            `Lane fit score: ${round(laneFit)}`,
            carrier.preferred ? "Carrier is preferred." : "Carrier is not preferred.",
            `Credit: ${(_a = carrier.creditStatus) !== null && _a !== void 0 ? _a : "UNKNOWN"}`,
            `Safety: ${(_b = carrier.safetyStatus) !== null && _b !== void 0 ? _b : "UNKNOWN"}`,
            `Insurance: ${(_c = carrier.insuranceStatus) !== null && _c !== void 0 ? _c : "UNKNOWN"}`,
        ];
        return {
            carrierId: carrier.carrierId,
            carrierName: carrier.carrierName,
            eligibilityScore: Math.round(eligibilityScore),
            inviteRecommendation,
            governanceReviewRequired: reviewRequired,
            blocked,
            preferred: Boolean(carrier.preferred),
            evidence,
        };
    })
        .sort((left, right) => right.eligibilityScore - left.eligibilityScore);
}
function buildGovernanceSignalFromMatch(context, score) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7;
    const totalCost = bidTotalCost(context.bid);
    const projectedMargin = typeof context.load.targetSellRate === "number"
        ? context.load.targetSellRate +
            ((_a = context.load.fuelSurcharge) !== null && _a !== void 0 ? _a : 0) +
            ((_b = context.load.accessorialEstimate) !== null && _b !== void 0 ? _b : 0) +
            ((_c = context.load.lumperEstimate) !== null && _c !== void 0 ? _c : 0) -
            totalCost
        : null;
    const severity = severityFromScore(score.score, (_d = score.riskFlags) !== null && _d !== void 0 ? _d : []);
    return {
        signalType: ((_e = score.riskFlags) === null || _e === void 0 ? void 0 : _e.some((flag) => flag.includes("credit") || flag.includes("safety") || flag.includes("blocked")))
            ? "CARRIER_CREDIT_RISK"
            : ((_f = score.riskFlags) === null || _f === void 0 ? void 0 : _f.some((flag) => flag.includes("margin") || flag.includes("rate")))
                ? "BROKER_MARGIN_RISK"
                : "LOAD_BOARD_BID_OPPORTUNITY",
        sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
        severity,
        confidenceScore: round(Math.max(0.55, Math.min(0.95, score.score / 100))),
        description: `${(_h = (_g = context.carrier) === null || _g === void 0 ? void 0 : _g.carrierName) !== null && _h !== void 0 ? _h : context.bid.carrierId} bid requires governed review for ${(_j = context.load.customerName) !== null && _j !== void 0 ? _j : context.load.customerId}.`,
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
            bid_total_cost: totalCost,
            fuel_surcharge: (_l = (_k = context.bid.fuelSurcharge) !== null && _k !== void 0 ? _k : context.load.fuelSurcharge) !== null && _l !== void 0 ? _l : null,
            accessorial_total: (_o = (_m = context.bid.accessorialTotal) !== null && _m !== void 0 ? _m : context.load.accessorialEstimate) !== null && _o !== void 0 ? _o : null,
            lumper_fee: (_q = (_p = context.bid.lumperFee) !== null && _p !== void 0 ? _p : context.load.lumperEstimate) !== null && _q !== void 0 ? _q : null,
            detention_estimate: (_r = context.bid.detentionEstimate) !== null && _r !== void 0 ? _r : null,
            target_sell_rate: (_s = context.load.targetSellRate) !== null && _s !== void 0 ? _s : null,
            target_buy_rate: (_t = context.load.targetBuyRate) !== null && _t !== void 0 ? _t : null,
            projected_margin: projectedMargin,
            market_median_rate: (_v = (_u = context.lane) === null || _u === void 0 ? void 0 : _u.marketRateMedian) !== null && _v !== void 0 ? _v : null,
            carrier_falloff_rate: (_x = (_w = context.carrier) === null || _w === void 0 ? void 0 : _w.falloffRate) !== null && _x !== void 0 ? _x : null,
            carrier_on_time_rate: (_z = (_y = context.carrier) === null || _y === void 0 ? void 0 : _y.onTimeRate) !== null && _z !== void 0 ? _z : null,
            carrier_trust_score: (_1 = (_0 = score.factors) === null || _0 === void 0 ? void 0 : _0.carrierTrust) !== null && _1 !== void 0 ? _1 : null,
            carrier_reliability_score: (_3 = (_2 = score.factors) === null || _2 === void 0 ? void 0 : _2.carrierReliability) !== null && _3 !== void 0 ? _3 : null,
            governance_reason_count: (_5 = (_4 = score.governanceReasons) === null || _4 === void 0 ? void 0 : _4.length) !== null && _5 !== void 0 ? _5 : 0,
        },
        tags: [
            "sil",
            "brokerage",
            "load-board",
            "matching-engine",
            ...(((_6 = score.governanceReasons) !== null && _6 !== void 0 ? _6 : []).some((reason) => reason.includes("blocked")) ? ["carrier-blocked"] : []),
            ...(((_7 = score.governanceReasons) !== null && _7 !== void 0 ? _7 : []).some((reason) => reason.includes("review")) ? ["carrier-review"] : []),
        ],
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
function buildDispatchReadiness(context) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11;
    const matchScore = context.bid
        ? scoreBidMatch({
            load: context.load,
            bid: context.bid,
            carrier: context.carrier,
            lane: context.lane,
            posting: context.posting,
        })
        : undefined;
    const blockingReasons = [];
    const reviewReasons = [];
    const evidence = [];
    const carrierName = (_d = (_b = (_a = context.carrier) === null || _a === void 0 ? void 0 : _a.carrierName) !== null && _b !== void 0 ? _b : (_c = context.bid) === null || _c === void 0 ? void 0 : _c.carrierId) !== null && _d !== void 0 ? _d : "No carrier selected";
    const postingVisibility = (_f = (_e = context.posting) === null || _e === void 0 ? void 0 : _e.visibility) !== null && _f !== void 0 ? _f : "NOT_POSTED";
    const safetyStatus = normalizeStatus((_g = context.carrier) === null || _g === void 0 ? void 0 : _g.safetyStatus);
    const creditStatus = normalizeStatus((_h = context.carrier) === null || _h === void 0 ? void 0 : _h.creditStatus);
    const insuranceStatus = normalizeStatus((_j = context.carrier) === null || _j === void 0 ? void 0 : _j.insuranceStatus);
    if (!context.bid) {
        blockingReasons.push("No carrier bid is selected for award or dispatch.");
    }
    else if (["REJECTED", "WITHDRAWN", "EXPIRED"].includes(context.bid.status)) {
        blockingReasons.push(`Selected bid is ${context.bid.status}.`);
    }
    if (((_k = context.bid) === null || _k === void 0 ? void 0 : _k.expiresAt) && new Date(context.bid.expiresAt).getTime() < Date.now()) {
        blockingReasons.push("Selected bid response window has expired.");
    }
    if (!context.carrier) {
        reviewReasons.push("Carrier profile is missing.");
    }
    else {
        if (context.carrier.blocked || safetyStatus === "BLOCKED" || creditStatus === "BLOCKED") {
            blockingReasons.push("Carrier is blocked by workspace, safety, or credit policy.");
        }
        if (safetyStatus === "REVIEW" || creditStatus === "REVIEW" || insuranceStatus === "REVIEW") {
            reviewReasons.push("Carrier compliance status requires review.");
        }
        if (!safetyStatus || safetyStatus === "UNKNOWN")
            reviewReasons.push("Carrier safety status is unknown.");
        if (!creditStatus || creditStatus === "UNKNOWN")
            reviewReasons.push("Carrier credit status is unknown.");
        if (!insuranceStatus || insuranceStatus === "UNKNOWN")
            reviewReasons.push("Carrier insurance status is unknown.");
        if (["EXPIRED", "INVALID", "BLOCKED"].includes(insuranceStatus !== null && insuranceStatus !== void 0 ? insuranceStatus : "")) {
            blockingReasons.push("Carrier insurance is not valid.");
        }
    }
    if (!context.posting) {
        reviewReasons.push("Load has no posting record tied to the selected bid.");
    }
    else if (context.posting.visibility === "INVITED_CARRIERS") {
        if (!context.posting.invitedAt)
            reviewReasons.push("Invite packet has not been timestamped as reviewed.");
        if (context.bid && !((_l = context.posting.invitedCarrierIds) !== null && _l !== void 0 ? _l : []).includes(context.bid.carrierId)) {
            blockingReasons.push("Selected carrier is not on the invited carrier list.");
        }
    }
    if (((_m = context.shipment) === null || _m === void 0 ? void 0 : _m.state) === "EXCEPTION") {
        blockingReasons.push("Shipment is currently in exception state.");
    }
    if (!context.shipment) {
        reviewReasons.push("No shipment execution record exists yet.");
    }
    else if (["DISPATCHED", "AT_PICKUP", "IN_TRANSIT", "AT_DELIVERY"].includes(context.shipment.state) && !context.shipment.trackingNumber) {
        reviewReasons.push("Dispatched shipment does not have a tracking number.");
    }
    if (matchScore === null || matchScore === void 0 ? void 0 : matchScore.governanceSignalRequired) {
        reviewReasons.push(...((_o = matchScore.governanceReasons) !== null && _o !== void 0 ? _o : ["Bid score requires governed review."]));
    }
    if (((_p = matchScore === null || matchScore === void 0 ? void 0 : matchScore.score) !== null && _p !== void 0 ? _p : 0) < 68 && context.bid) {
        reviewReasons.push(`Dispatch score is below award threshold: ${(_q = matchScore === null || matchScore === void 0 ? void 0 : matchScore.score) !== null && _q !== void 0 ? _q : 0}.`);
    }
    evidence.push(`Load status: ${context.load.status}`, `Posting visibility: ${postingVisibility}`, `Carrier: ${carrierName}`, `Bid status: ${(_s = (_r = context.bid) === null || _r === void 0 ? void 0 : _r.status) !== null && _s !== void 0 ? _s : "not selected"}`, `Bid score: ${(_t = matchScore === null || matchScore === void 0 ? void 0 : matchScore.score) !== null && _t !== void 0 ? _t : "unavailable"}`, `Shipment state: ${(_v = (_u = context.shipment) === null || _u === void 0 ? void 0 : _u.state) !== null && _v !== void 0 ? _v : "not created"}`);
    if ((_w = context.shipment) === null || _w === void 0 ? void 0 : _w.trackingNumber)
        evidence.push(`Tracking number: ${context.shipment.trackingNumber}`);
    if (matchScore === null || matchScore === void 0 ? void 0 : matchScore.carrierDecisionSummary)
        evidence.push(matchScore.carrierDecisionSummary);
    const uniqueBlockingReasons = [...new Set(blockingReasons)];
    const uniqueReviewReasons = [...new Set(reviewReasons)];
    const baseScore = (_x = matchScore === null || matchScore === void 0 ? void 0 : matchScore.score) !== null && _x !== void 0 ? _x : 45;
    const readinessScore = clamp(baseScore - uniqueBlockingReasons.length * 22 - uniqueReviewReasons.length * 8);
    const status = uniqueBlockingReasons.length > 0 ? "HOLD" : uniqueReviewReasons.length > 0 ? "READY_WITH_REVIEW" : "READY";
    const severity = status === "HOLD" ? "CRITICAL" : uniqueReviewReasons.length > 2 ? "HIGH" : "MEDIUM";
    const governanceSignal = status === "READY"
        ? undefined
        : {
            workspaceId: context.load.workspaceId,
            signalType: "DISPATCH_READINESS_REVIEW",
            sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
            severity,
            confidenceScore: round(Math.max(0.62, Math.min(0.94, (100 - readinessScore) / 100))),
            description: `${carrierName} dispatch readiness for ${(_y = context.load.customerName) !== null && _y !== void 0 ? _y : context.load.customerId} is ${status.replace(/_/g, " ").toLowerCase()}.`,
            businessDomains: ["TRANSPORTATION", "FREIGHT_BROKERAGE", "SHIPMENT_VISIBILITY", "RISK"],
            affectedEntities: {
                loads: [context.load.loadId],
                carriers: ((_z = context.bid) === null || _z === void 0 ? void 0 : _z.carrierId) ? [context.bid.carrierId] : [],
                shipments: ((_0 = context.shipment) === null || _0 === void 0 ? void 0 : _0.shipmentId) ? [context.shipment.shipmentId] : [],
                lanes: context.lane ? [context.lane.laneId] : [],
                customers: [context.load.customerId],
            },
            metrics: {
                readiness_score: Math.round(readinessScore),
                match_score: (_1 = matchScore === null || matchScore === void 0 ? void 0 : matchScore.score) !== null && _1 !== void 0 ? _1 : null,
                blocking_reason_count: uniqueBlockingReasons.length,
                review_reason_count: uniqueReviewReasons.length,
                bid_rate: (_3 = (_2 = context.bid) === null || _2 === void 0 ? void 0 : _2.bidRate) !== null && _3 !== void 0 ? _3 : null,
                bid_total_cost: context.bid ? bidTotalCost(context.bid) : null,
                target_buy_rate: (_4 = context.load.targetBuyRate) !== null && _4 !== void 0 ? _4 : null,
                target_sell_rate: (_5 = context.load.targetSellRate) !== null && _5 !== void 0 ? _5 : null,
            },
            tags: ["sil", "dispatch-readiness", "carrier-award", severity.toLowerCase()],
            recommendedActions: [
                {
                    actionType: status === "HOLD" ? "HOLD_DISPATCH_FOR_REVIEW" : "REVIEW_DISPATCH_BEFORE_COMMITMENT",
                    targetModule: "PLATFORM_OVERVIEW",
                    priority: severity === "CRITICAL" ? "CRITICAL" : "HIGH",
                    description: "Review carrier, posting, bid, and shipment evidence before dispatch commitment.",
                },
            ],
            rawPayloadRef: `sil:dispatch-readiness:${context.load.loadId}:${(_7 = (_6 = context.bid) === null || _6 === void 0 ? void 0 : _6.bidId) !== null && _7 !== void 0 ? _7 : "no-bid"}`,
        };
    return {
        loadId: context.load.loadId,
        bidId: (_8 = context.bid) === null || _8 === void 0 ? void 0 : _8.bidId,
        carrierId: (_9 = context.bid) === null || _9 === void 0 ? void 0 : _9.carrierId,
        postingId: (_10 = context.posting) === null || _10 === void 0 ? void 0 : _10.postingId,
        shipmentId: (_11 = context.shipment) === null || _11 === void 0 ? void 0 : _11.shipmentId,
        status,
        score: Math.round(readinessScore),
        matchScore,
        blockingReasons: uniqueBlockingReasons,
        reviewReasons: uniqueReviewReasons,
        evidence,
        governanceSignal,
    };
}
