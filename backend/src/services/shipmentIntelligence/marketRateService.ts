import {
  SilBid,
  SilGovernanceSignalDraft,
  SilLaneProfile,
  SilLoad,
  SilMarketRateAnalysis,
  SilMarketRateObservation,
  SilSeverity,
} from "./types";
import { recordWorkflowEvent } from "./workflowEventService";

const round = (value: number) => Math.round(value * 100) / 100;

function pressureLevel(rateVariancePercent: number, projectedMargin?: number | null): SilSeverity {
  if (projectedMargin !== undefined && projectedMargin !== null && projectedMargin < 0) return "CRITICAL";
  if (rateVariancePercent >= 18) return "CRITICAL";
  if (rateVariancePercent >= 8) return "HIGH";
  if (rateVariancePercent >= 3) return "MEDIUM";
  return "LOW";
}

function buildLaneSignal(input: {
  load: SilLoad;
  bid?: SilBid;
  lane?: SilLaneProfile;
  analysis: SilMarketRateAnalysis;
}): SilGovernanceSignalDraft | undefined {
  if (!["HIGH", "CRITICAL"].includes(input.analysis.pressureLevel)) return undefined;

  return {
    signalType:
      input.analysis.projectedMargin !== undefined &&
      input.analysis.projectedMargin !== null &&
      input.analysis.projectedMargin < (input.load.marginTarget ?? 0)
        ? "BROKER_MARGIN_RISK"
        : "LANE_RATE_EXCEPTION",
    sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
    severity: input.analysis.pressureLevel,
    confidenceScore: 0.78,
    description: `Lane rate pressure detected for ${input.load.customerName ?? input.load.customerId}.`,
    businessDomains: ["TRANSPORTATION", "FREIGHT_BROKERAGE", "FINANCE", "RISK"],
    affectedEntities: {
      loads: [input.load.loadId],
      lanes: input.lane ? [input.lane.laneId] : [],
      customers: [input.load.customerId],
      carriers: input.bid ? [input.bid.carrierId] : [],
    },
    metrics: {
      bid_rate: input.analysis.bidRate ?? null,
      market_median_rate: input.analysis.marketMedianRate ?? null,
      target_buy_rate: input.analysis.targetBuyRate ?? null,
      target_sell_rate: input.analysis.targetSellRate ?? null,
      projected_margin: input.analysis.projectedMargin ?? null,
      rate_variance_percent: input.analysis.rateVariancePercent ?? null,
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

export function analyzeMarketRate(input: {
  load: SilLoad;
  lane?: SilLaneProfile;
  bid?: SilBid;
  observations?: SilMarketRateObservation[];
}): SilMarketRateAnalysis {
  const medianFromObservation = input.observations?.find((item) => item.laneId === input.lane?.laneId)?.medianRate;
  const marketMedianRate = input.lane?.marketRateMedian ?? medianFromObservation;
  const bidRate = input.bid?.bidRate;
  const targetBuyRate = input.load.targetBuyRate;
  const targetSellRate = input.load.targetSellRate;
  const projectedMargin = bidRate !== undefined && targetSellRate !== undefined ? targetSellRate - bidRate : undefined;
  const rateBasis = bidRate ?? targetBuyRate;
  const rateVariancePercent =
    rateBasis !== undefined && marketMedianRate
      ? round(((rateBasis - marketMedianRate) / marketMedianRate) * 100)
      : undefined;
  const marginVariance =
    projectedMargin !== undefined && input.load.marginTarget !== undefined
      ? round(projectedMargin - input.load.marginTarget)
      : undefined;
  const pressure = pressureLevel(Math.abs(rateVariancePercent ?? 0), projectedMargin);

  const evidence = [
    marketMedianRate !== undefined ? `Market median rate: ${marketMedianRate}` : "Market median rate unavailable",
    bidRate !== undefined ? `Bid rate: ${bidRate}` : "Bid rate unavailable",
    projectedMargin !== undefined ? `Projected margin: ${projectedMargin}` : "Projected margin unavailable",
    rateVariancePercent !== undefined
      ? `Rate variance from median: ${rateVariancePercent}%`
      : "Rate variance unavailable",
  ];

  const analysis: SilMarketRateAnalysis = {
    laneId: input.lane?.laneId ?? "unmatched-lane",
    loadId: input.load.loadId,
    bidId: input.bid?.bidId,
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

  recordWorkflowEvent({
    eventType: analysis.governanceSignal ? "GOVERNANCE_SIGNAL_CREATED" : "BID_REVIEWED",
    loadId: input.load.loadId,
    bidId: input.bid?.bidId,
    carrierId: input.bid?.carrierId,
    summary: `Market rate analysis completed with ${analysis.pressureLevel} pressure.`,
    evidence,
    governanceSignal: analysis.governanceSignal,
  });

  return analysis;
}
