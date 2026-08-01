import { SilLoad, SilShipment } from "./types";

const kardiaApiBase = () => (process.env.KARDIA_API_BASE || "https://kardia.encompax.io").replace(/\/$/, "");

export async function sendShipmentExceptionToKardia(input: {
  load: SilLoad;
  shipment: SilShipment;
  authorization: string;
}) {
  const { load, shipment, authorization } = input;
  const response = await fetch(`${kardiaApiBase()}/api/integrations/sil/quality-events`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceEventId: `sil-shipment-${shipment.shipmentId}-exception`,
      title: `Shipment exception: ${load.loadId}`,
      description: shipment.exception || `Shipment ${shipment.shipmentId} entered exception state.`,
      severity: "critical",
      owner: "Quality triage",
      dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    }),
  });
  const body = await response.json().catch(() => null);
  return { sent: response.ok, status: response.status, response: body };
}
