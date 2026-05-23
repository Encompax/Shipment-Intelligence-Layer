import {
  SilBid,
  SilCarrierProfile,
  SilGovernanceSignalDraft,
  SilLaneProfile,
  SilLoad,
  SilLoadPosting,
  SilMatchScore,
  SilSeverity,
} from "./types";

type MatchContext = {
  load: SilLoad;
  bid: SilBid;
  carrier?: SilCarrierProfile;
  lane?: SilLaneProfile;
  posting?: SilLoadPosting;
};

type RecommendationContext = {
  load: SilLoad;
  posting?: SilLoadPosting;
  bids: SilBid[];
  carriers: SilCarrierProfile[];
  lanes: SilLaneProfile[];
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const round = (value: number) => Math.round(value * 100) / 100;

function scoreBand(score: number): SilMatchScore["scoreBand"] {
  if (score >= 86) return "EXCELLENT";
  if (score >= 70) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

function severityFromScore(score: number, riskFlags: string[]): SilSeverity {
  if (riskFlags.some((flag) => flag.includes("blocked")) || score < 45) return "CRITICAL";
  if (riskFlags.length >= 2 || score < 65) return "HIGH";
  if (score < 78) return "MEDIUM";
  return "LOW";
}

function findLane(load: SilLoad, lanes: SilLaneProfile[]) {
  return lanes.find(
    (lane) =>
      lane.originRegion === load.origin.state &&
      lane.destinationRegion === load.destination.state &&
      lane.mode === load.mode &&
      lane.equipmentType === load.equipmentType
  );
}

function rateFit(load: SilLoad, bid: SilBid, lane?: SilLaneProfile) {
  const median = lane?.marketRateMedian ?? load.targetBuyRate ?? bid.bidRate;
  if (!median) return 60;

  const variance = (bid.bidRate - median) / median;
  if (variance <= -0.08) return 94;
  if (variance <= 0.02) return 86;
  if (variance <= 0.08) return 72;
  if (variance <= 0.16) return 55;
  return 35;
}

function marginFit(load: SilLoad, bid: SilBid) {
  if (!load.targetSellRate) return 60;
  const margin = load.targetSellRate - bid.bidRate;
  const target = load.marginTarget ?? load.targetSellRate * 0.12;
  if (margin >= target) return 90;
  if (margin > target * 0.65) return 75;
  if (margin > 0) return 55;
  return 20;
}

function carrierReliability(carrier?: SilCarrierProfile) {
  if (!carrier) return 45;
  const service = carrier.serviceScore ?? 65;
  const onTime = (carrier.onTimeRate ?? 0.75) * 100;
  const falloffPenalty = (carrier.falloffRate ?? 0.1) * 120;
  return clamp(service * 0.45 + onTime * 0.45 - falloffPenalty * 0.1);
}

function carrierTrust(carrier?: SilCarrierProfile) {
  if (!carrier) return 45;
  if (carrier.blocked || carrier.safetyStatus === "BLOCKED" || carrier.creditStatus === "BLOCKED") return 10;

  let score = 70;
  if (carrier.preferred) score += 12;
  if (carrier.insuranceStatus === "VALID") score += 8;
  if (carrier.safetyStatus === "CLEAR") score += 8;
  if (carrier.creditStatus === "APPROVED") score += 8;
  if (carrier.safetyStatus === "REVIEW") score -= 14;
  if (carrier.creditStatus === "REVIEW") score -= 14;
  if (carrier.insuranceStatus && carrier.insuranceStatus !== "VALID") score -= 20;
  return clamp(score);
}

function timingFit(load: SilLoad, bid: SilBid) {
  if (!load.pickupWindowStart || !bid.estimatedPickupCommitment) return 62;
  const pickupStart = new Date(load.pickupWindowStart).getTime();
  const commitment = new Date(bid.estimatedPickupCommitment).getTime();
  const hoursLate = (commitment - pickupStart) / (1000 * 60 * 60);
  if (hoursLate <= 0) return 92;
  if (hoursLate <= 2) return 80;
  if (hoursLate <= 6) return 58;
  return 30;
}

function buildRiskFlags(context: MatchContext, factors: SilMatchScore["factors"]) {
  const flags: string[] = [];
  const { carrier, load, bid, lane } = context;

  if (!carrier) flags.push("carrier profile missing");
  if (carrier?.blocked) flags.push("carrier blocked");
  if (carrier?.safetyStatus === "REVIEW") flags.push("carrier safety in review");
  if (carrier?.creditStatus === "REVIEW") flags.push("carrier credit in review");
  if ((carrier?.falloffRate ?? 0) >= 0.1) flags.push("carrier falloff rate elevated");
  if (factors && factors.rateFit < 60) flags.push("bid rate above lane tolerance");
  if (factors && factors.marginFit < 60) flags.push("margin below target");
  if (!lane) flags.push("lane history missing");
  if (load.targetSellRate && bid.bidRate > load.targetSellRate) flags.push("bid exceeds sell rate");

  return flags;
}

function recommendedAction(score: number, riskFlags: string[]): SilMatchScore["recommendedAction"] {
  if (riskFlags.some((flag) => flag.includes("blocked"))) return "REJECT";
  if (riskFlags.length >= 2 || score < 68) return "ROUTE_TO_ENCOMPAX";
  if (score >= 86) return "AWARD";
  if (score >= 70) return "SHORTLIST";
  return "REQUEST_MORE_CONTEXT";
}

export function scoreBidMatch(context: MatchContext): SilMatchScore {
  const factors = {
    laneFit: context.lane ? 88 : 42,
    rateFit: rateFit(context.load, context.bid, context.lane),
    marginFit: marginFit(context.load, context.bid),
    carrierReliability: carrierReliability(context.carrier),
    carrierTrust: carrierTrust(context.carrier),
    timingFit: timingFit(context.load, context.bid),
  };

  const score = clamp(
    factors.laneFit * 0.12 +
      factors.rateFit * 0.18 +
      factors.marginFit * 0.18 +
      factors.carrierReliability * 0.22 +
      factors.carrierTrust * 0.2 +
      factors.timingFit * 0.1
  );

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

export function buildLoadRecommendations(context: RecommendationContext) {
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
    .sort((left, right) => (right.score?.score ?? 0) - (left.score?.score ?? 0));
}

export function buildGovernanceSignalFromMatch(context: MatchContext, score: SilMatchScore): SilGovernanceSignalDraft {
  const projectedMargin =
    typeof context.load.targetSellRate === "number" ? context.load.targetSellRate - context.bid.bidRate : null;
  const severity = severityFromScore(score.score, score.riskFlags ?? []);

  return {
    signalType:
      score.riskFlags?.some((flag) => flag.includes("credit") || flag.includes("safety") || flag.includes("blocked"))
        ? "CARRIER_CREDIT_RISK"
        : score.riskFlags?.some((flag) => flag.includes("margin") || flag.includes("rate"))
          ? "BROKER_MARGIN_RISK"
          : "LOAD_BOARD_BID_OPPORTUNITY",
    sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
    severity,
    confidenceScore: round(Math.max(0.55, Math.min(0.95, score.score / 100))),
    description: `${context.carrier?.carrierName ?? context.bid.carrierId} bid requires governed review for ${context.load.customerName ?? context.load.customerId}.`,
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
      target_sell_rate: context.load.targetSellRate ?? null,
      target_buy_rate: context.load.targetBuyRate ?? null,
      projected_margin: projectedMargin,
      market_median_rate: context.lane?.marketRateMedian ?? null,
      carrier_falloff_rate: context.carrier?.falloffRate ?? null,
      carrier_on_time_rate: context.carrier?.onTimeRate ?? null,
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
