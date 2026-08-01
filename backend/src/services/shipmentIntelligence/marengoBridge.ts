import {
  SilBid,
  SilCarrierProfile,
  SilLaneProfile,
  SilLoad,
  SilMarengoForecastInput,
  SilShipment,
} from "./types";

const marengoApiBase = () =>
  (process.env.MARENGO_API_BASE || "https://marengo.encompax.io").replace(/\/$/, "");

export function buildMarengoForecastInput(input: {
  load: SilLoad;
  lane?: SilLaneProfile;
  shipment?: SilShipment;
  carrier?: SilCarrierProfile;
  bid?: SilBid;
  eventId?: string;
}): SilMarengoForecastInput {
  const { load, lane, shipment, carrier, bid } = input;
  return {
    contractVersion: "1.0",
    signalType: "shipment_operations_forecast_input",
    eventId:
      input.eventId ||
      (shipment
        ? `sil-shipment-${shipment.shipmentId}-${shipment.state.toLowerCase()}`
        : `sil-load-${load.loadId}-${load.status.toLowerCase()}`),
    occurredAt: new Date().toISOString(),
    source: "shipment_intelligence_layer",
    loadId: load.loadId,
    shipmentId: shipment?.shipmentId,
    laneId: lane?.laneId,
    customerId: load.customerId,
    carrierId: carrier?.carrierId,
    shipmentState: shipment?.state,
    brokerageState: load.status,
    mode: load.mode,
    equipmentType: load.equipmentType,
    pickupWindowStart: load.pickupWindowStart,
    deliveryWindowEnd: load.deliveryWindowEnd,
    targetBuyRate: load.targetBuyRate,
    targetSellRate: load.targetSellRate,
    currentBidRate: bid?.bidRate,
    marketMedianRate: lane?.marketRateMedian,
    onTimeRate: carrier?.onTimeRate ?? lane?.onTimeRate,
    falloffRate: carrier?.falloffRate,
    serviceScore: carrier?.serviceScore,
    appointmentMissCount: shipment?.stops.filter((stop) => stop.status === "MISSED").length,
    evidenceRefs: [
      `sil:load:${load.loadId}`,
      ...(shipment ? [`sil:shipment:${shipment.shipmentId}`] : []),
      ...(lane ? [`sil:lane:${lane.laneId}`] : []),
    ],
  };
}

export async function sendForecastInputToMarengo(
  signal: SilMarengoForecastInput,
  authorization: string
) {
  const payload = {
    contract_version: signal.contractVersion,
    signal_type: signal.signalType,
    event_id: signal.eventId,
    occurred_at: signal.occurredAt,
    source: signal.source,
    customer_id: signal.customerId,
    load_id: signal.loadId,
    shipment_id: signal.shipmentId,
    lane_id: signal.laneId,
    carrier_id: signal.carrierId,
    mode: signal.mode,
    equipment_type: signal.equipmentType,
    planned_ship_date: signal.pickupWindowStart,
    planned_delivery_date: signal.deliveryWindowEnd,
    on_time_rate: signal.onTimeRate,
    carrier_falloff_rate: signal.falloffRate,
    load_board_bid_count: undefined,
    accepted_rate: signal.currentBidRate,
    market_rate_estimate: signal.marketMedianRate,
    broker_margin_estimate:
      signal.targetSellRate !== undefined && signal.currentBidRate !== undefined
        ? signal.targetSellRate - signal.currentBidRate
        : undefined,
    exception_count: signal.appointmentMissCount,
    evidence_refs: signal.evidenceRefs,
  };

  const response = await fetch(
    `${marengoApiBase()}/api/marengo/customer-intelligence/integrations/sil/signals`,
    {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  const body = await response.json().catch(() => null);
  return { sent: response.ok, status: response.status, response: body };
}
