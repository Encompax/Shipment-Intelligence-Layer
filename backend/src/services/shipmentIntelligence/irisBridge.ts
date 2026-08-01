import { SilLoad, SilShipment } from "./types";

const irisApiBase = () => (process.env.IRIS_API_BASE || "https://iris.encompax.io").replace(/\/$/, "");

export async function publishFreightMarginExposureToIris(input: { load: SilLoad; shipment: SilShipment; authorization: string }) {
  const { load, shipment, authorization } = input;
  const expectedMargin = Number(load.marginTarget || 0);
  const currentMargin = Number(load.targetSellRate || 0) - Number(load.targetBuyRate || 0);
  const exposureAmount = Math.max(0, expectedMargin - currentMargin);
  if (!exposureAmount) return { sent: false, skipped: true, reason: "No freight-margin exposure" };
  const response = await fetch(`${irisApiBase()}/api/integrations/sil/finance-cases`, {
    method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ sourceEventId: `sil-margin-${shipment.shipmentId}-${shipment.state}`, title: `Freight margin exposure: ${load.loadId}`, description: `Expected margin ${expectedMargin}; current planned margin ${currentMargin}.`, caseType: "freight-margin", exposureKind: "margin-shortfall", exposureAmount, owner: "Finance review", dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) }),
  });
  const body = await response.json().catch(() => null); return { sent: response.ok, status: response.status, response: body };
}
