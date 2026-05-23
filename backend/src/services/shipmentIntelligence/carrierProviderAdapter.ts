import {
  SilCarrierProfile,
  SilCarrierProvider,
  SilCarrierQuote,
  SilLoad,
  SilShipment,
  SilTrackingUpdate,
} from "./types";
import { recordWorkflowEvent } from "./workflowEventService";

type QuoteInput = {
  provider?: SilCarrierProvider;
  load: SilLoad;
  carriers: SilCarrierProfile[];
};

const quoteId = (provider: SilCarrierProvider, carrierId: string) =>
  `quote_${provider.toLowerCase()}_${carrierId}_${Date.now()}`;

function quoteConfidence(carrier: SilCarrierProfile) {
  let confidence = 0.62;
  if (carrier.preferred) confidence += 0.1;
  if (carrier.insuranceStatus === "VALID") confidence += 0.08;
  if (carrier.safetyStatus === "CLEAR") confidence += 0.08;
  if (carrier.creditStatus === "APPROVED") confidence += 0.08;
  if (carrier.safetyStatus === "REVIEW") confidence -= 0.12;
  if (carrier.creditStatus === "REVIEW") confidence -= 0.12;
  return Math.max(0.25, Math.min(0.96, Number(confidence.toFixed(2))));
}

export function requestCarrierQuotes(input: QuoteInput): SilCarrierQuote[] {
  const provider = input.provider ?? "MOCK";
  const baseRate = input.load.targetBuyRate ?? 500;

  const quotes = input.carriers.map((carrier, index) => {
    const carrierAdjustment = carrier.preferred ? -0.04 : 0.08 + index * 0.03;
    const riskAdjustment =
      carrier.safetyStatus === "REVIEW" || carrier.creditStatus === "REVIEW" ? 0.07 : 0;
    const rate = Math.round(baseRate * (1 + carrierAdjustment + riskAdjustment));

    return {
      quoteId: quoteId(provider, carrier.carrierId),
      provider,
      carrierId: carrier.carrierId,
      carrierName: carrier.carrierName,
      serviceLevel: input.load.mode === "PARCEL" ? "GROUND" : "STANDARD",
      rate,
      currency: "USD" as const,
      estimatedTransitDays:
        input.load.mode === "FTL" ? 2 : input.load.mode === "LTL" ? 3 : undefined,
      confidenceScore: quoteConfidence(carrier),
      evidence: [
        `Provider path: ${provider}`,
        `Mode: ${input.load.mode}`,
        `Equipment: ${input.load.equipmentType}`,
        `Carrier trust status: ${carrier.creditStatus ?? "UNKNOWN"}/${carrier.safetyStatus ?? "UNKNOWN"}`,
      ],
    };
  });

  recordWorkflowEvent({
    eventType: "CARRIER_PROVIDER_QUOTE_REQUESTED",
    source: provider === "MANUAL" ? "USER" : "CARRIER_PROVIDER",
    loadId: input.load.loadId,
    summary: `${provider} quote request returned ${quotes.length} carrier option(s).`,
    evidence: quotes.map((quote) => `${quote.carrierName}: ${quote.rate} ${quote.currency}`),
  });

  return quotes;
}

export function requestTrackingUpdate(input: {
  provider?: SilCarrierProvider;
  shipment: SilShipment;
}): SilTrackingUpdate {
  const provider = input.provider ?? (input.shipment.source === "karrio" ? "KARRIO" : "MOCK");
  const update: SilTrackingUpdate = {
    trackingNumber: input.shipment.trackingNumber ?? `${input.shipment.shipmentId}-tracking`,
    provider,
    carrierId: input.shipment.carrierId,
    status: input.shipment.state,
    location: input.shipment.stops.find((stop) => stop.status !== "COMPLETED")?.location,
    updatedAt: new Date().toISOString(),
    evidence: [
      `Provider path: ${provider}`,
      `Shipment state: ${input.shipment.state}`,
      input.shipment.carrierName ? `Carrier: ${input.shipment.carrierName}` : "Carrier not assigned",
    ],
  };

  recordWorkflowEvent({
    eventType: "CARRIER_PROVIDER_TRACKING_REQUESTED",
    source: provider === "MANUAL" ? "USER" : "CARRIER_PROVIDER",
    shipmentId: input.shipment.shipmentId,
    carrierId: input.shipment.carrierId,
    summary: `${provider} tracking request returned ${update.status}.`,
    evidence: update.evidence,
  });

  return update;
}
