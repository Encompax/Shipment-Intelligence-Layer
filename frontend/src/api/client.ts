/**
 * API base URL - uses /api for all environments
 * Vite dev server proxies /api requests to http://localhost:4000
 * In production, API and frontend are on same origin
 */
const API_BASE = '/api';

export async function fetchDatasources() {
 const res = await fetch(`${API_BASE}/datasources`);
 if (!res.ok) {
   throw new Error(`Failed to fetch datasources: ${res.status}`);
 }
 return res.json();
}

export async function createDatasource(payload: {
 name: string;
 type: string;
 description?: string;
}) {
 const res = await fetch(`${API_BASE}/datasources`, {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify(payload),
 });
 if (!res.ok) {
   throw new Error(`Failed to create datasource: ${res.status}`);
 }
 return res.json();
}

// ── SIL (Shipment Intelligence Layer) ────────────────────────────────────────

const SIL_BASE = '/api/sil';

export async function fetchSilMetrics(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`${SIL_BASE}/metrics?${params}`);
  if (!res.ok) throw new Error(`SIL metrics error: ${res.status}`);
  return res.json();
}

export async function fetchSilLiveFeed() {
  const res = await fetch(`${SIL_BASE}/live-feed`);
  if (!res.ok) throw new Error(`SIL live-feed error: ${res.status}`);
  return res.json();
}

export async function fetchSilInTransit() {
  const res = await fetch(`${SIL_BASE}/in-transit`);
  if (!res.ok) throw new Error(`SIL in-transit error: ${res.status}`);
  return res.json();
}

export async function fetchSilExceptions() {
  const res = await fetch(`${SIL_BASE}/exceptions`);
  if (!res.ok) throw new Error(`SIL exceptions error: ${res.status}`);
  return res.json();
}

export async function fetchSilWorkerStatus() {
  const res = await fetch(`${SIL_BASE}/worker-status`);
  if (!res.ok) throw new Error(`SIL worker-status error: ${res.status}`);
  return res.json();
}

const SHIPMENT_INTELLIGENCE_BASE = "/api/shipment-intelligence";

async function fetchShipmentIntelligence(path: string) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Shipment Intelligence API error: ${res.status}`);
  }
  return res.json();
}

export async function fetchTransportationOverview() {
  return fetchShipmentIntelligence("/overview");
}

export async function fetchSilWorkspace() {
  return fetchShipmentIntelligence("/workspace");
}

export async function updateSilWorkspace(payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/workspace`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Workspace update error: ${res.status}`);
  }
  return res.json();
}

export async function fetchTransportationLoads() {
  return fetchShipmentIntelligence("/loads");
}

export async function createTransportationLoad(payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/loads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Create load error: ${res.status}`);
  }
  return res.json();
}

export async function fetchTransportationLoadDetail(loadId: string) {
  return fetchShipmentIntelligence(`/loads/${encodeURIComponent(loadId)}`);
}

export async function fetchLoadTransitions(loadId: string) {
  return fetchShipmentIntelligence(`/loads/${encodeURIComponent(loadId)}/transitions`);
}

export async function transitionLoad(loadId: string, payload: {
  nextState: string;
  actor?: string;
  evidence?: string[];
}) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/loads/${encodeURIComponent(loadId)}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Load transition error: ${res.status}`);
  }
  return res.json();
}

export async function fetchTransportationShipments() {
  return fetchShipmentIntelligence("/shipments");
}

export async function updateTransportationShipmentProgress(shipmentId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/shipments/${encodeURIComponent(shipmentId)}/progress`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Shipment progress update error: ${res.status}`);
  }
  return res.json();
}

export async function fetchTransportationCarriers() {
  return fetchShipmentIntelligence("/carriers");
}

export async function createTransportationCarrier(payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/carriers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Create carrier error: ${res.status}`);
  }
  return res.json();
}

export async function updateTransportationCarrier(carrierId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/carriers/${encodeURIComponent(carrierId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Update carrier error: ${res.status}`);
  }
  return res.json();
}

export async function fetchTransportationLanes() {
  return fetchShipmentIntelligence("/lanes");
}

export async function fetchLoadBoardPostings() {
  return fetchShipmentIntelligence("/load-board/postings");
}

export async function createLoadBoardPosting(payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/load-board/postings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Create posting error: ${res.status}`);
  }
  return res.json();
}

export async function updateLoadBoardPostingVisibility(postingId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/load-board/postings/${encodeURIComponent(postingId)}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Posting visibility update error: ${res.status}`);
  }
  return res.json();
}

export async function fetchLoadBoardBids() {
  return fetchShipmentIntelligence("/load-board/bids");
}

export async function createLoadBoardBid(payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/load-board/bids`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Create bid error: ${res.status}`);
  }
  return res.json();
}

export async function updateLoadBoardBidCommercials(bidId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/load-board/bids/${encodeURIComponent(bidId)}/commercials`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Bid commercials update error: ${res.status}`);
  }
  return res.json();
}

export async function fetchBidReview(bidId: string) {
  return fetchShipmentIntelligence(`/load-board/bids/${encodeURIComponent(bidId)}/review`);
}

export async function decideLoadBoardBid(bidId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/load-board/bids/${encodeURIComponent(bidId)}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Bid decision error: ${res.status}`);
  }
  return res.json();
}

export async function fetchMatchingRecommendations() {
  return fetchShipmentIntelligence("/matching/recommendations");
}

export async function fetchCarrierEligibilityRecommendations(loadId: string) {
  return fetchShipmentIntelligence(`/matching/carrier-eligibility/${encodeURIComponent(loadId)}`);
}

export async function createCarrierInvitePacket(loadId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/matching/carrier-eligibility/${encodeURIComponent(loadId)}/invite-packet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Carrier invite packet error: ${res.status}`);
  }
  return res.json();
}

export async function fetchDispatchReadiness(loadId: string, bidId?: string) {
  const params = new URLSearchParams();
  if (bidId) params.set("bidId", bidId);
  const query = params.toString() ? `?${params}` : "";
  return fetchShipmentIntelligence(`/dispatch/readiness/${encodeURIComponent(loadId)}${query}`);
}

export async function createDispatchReadinessReview(loadId: string, payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/dispatch/readiness/${encodeURIComponent(loadId)}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Dispatch readiness review error: ${res.status}`);
  }
  return res.json();
}

export async function fetchCarrierQuotes(loadId: string, provider = "MOCK") {
  return fetchShipmentIntelligence(`/carrier-quotes/${encodeURIComponent(loadId)}?provider=${encodeURIComponent(provider)}`);
}

export async function fetchTrackingUpdate(shipmentId: string, provider?: string) {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  return fetchShipmentIntelligence(`/tracking/${encodeURIComponent(shipmentId)}${query}`);
}

export async function fetchMarketRates() {
  return fetchShipmentIntelligence("/market-rates");
}

export async function fetchMarketRateAnalysis(loadId: string, bidId?: string) {
  const params = new URLSearchParams({ loadId });
  if (bidId) params.set("bidId", bidId);
  return fetchShipmentIntelligence(`/market-rates/analyze?${params}`);
}

export async function fetchSilGovernanceSignals() {
  return fetchShipmentIntelligence("/governance-signals");
}

export async function fetchWorkflowEvents(filters?: { loadId?: string; shipmentId?: string; bidId?: string }) {
  const params = new URLSearchParams();
  if (filters?.loadId) params.set("loadId", filters.loadId);
  if (filters?.shipmentId) params.set("shipmentId", filters.shipmentId);
  if (filters?.bidId) params.set("bidId", filters.bidId);
  const query = params.toString() ? `?${params}` : "";
  return fetchShipmentIntelligence(`/workflow-events${query}`);
}

export async function fetchLeanTemplates() {
  return fetchShipmentIntelligence("/lean/templates");
}

export async function fetchLeanRecords(filters?: { organization?: string; templateId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.organization) params.set("organization", filters.organization);
  if (filters?.templateId) params.set("templateId", filters.templateId);
  if (filters?.status) params.set("status", filters.status);
  const query = params.toString() ? `?${params}` : "";
  return fetchShipmentIntelligence(`/lean/records${query}`);
}

export async function createLeanRecord(payload: Record<string, unknown>) {
  const res = await fetch(`${SHIPMENT_INTELLIGENCE_BASE}/lean/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Create LEAN record error: ${res.status}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────

export async function uploadFile(dataSourceId: number | string, file: File) {
 const formData = new FormData();
 formData.append('dataSourceId', String(dataSourceId));
 formData.append('file', file);
 const res = await fetch(`${API_BASE}/ingest/upload`, {
   method: "POST",
   body: formData,
 });
 if (!res.ok) {
   throw new Error(`Failed to upload file: ${res.status}`);
 }
 return res.json();
}

export async function fetchUploadPreview(uploadId: number) {
  const res = await fetch(`${API_BASE}/ingest/uploads/${encodeURIComponent(String(uploadId))}/preview`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Upload preview error: ${res.status}`);
  }
  return res.json();
}

export async function importUploadLoads(uploadId: number, payload: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/ingest/uploads/${encodeURIComponent(String(uploadId))}/import-loads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Upload import error: ${res.status}`);
  }
  return res.json();
}

// ── Shipment Intelligence: Carriers ────────────────────────────────────────

export async function fetchCarrierMetrics() {
  const res = await fetch(`${API_BASE}/shipment/carriers/metrics`);
  if (!res.ok) throw new Error(`Carrier metrics error: ${res.status}`);
  return res.json();
}

export async function fetchCarrierPerformance() {
  const res = await fetch(`${API_BASE}/shipment/carriers/performance`);
  if (!res.ok) throw new Error(`Carrier performance error: ${res.status}`);
  return res.json();
}

// ── Inventory: Lot Tracking ────────────────────────────────────────────────

export async function fetchLotTracking(filters?: { priorityOnly?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.priorityOnly) params.set('priority', 'true');
  const res = await fetch(`${API_BASE}/inventory/lot-tracking?${params}`);
  if (!res.ok) throw new Error(`Lot tracking error: ${res.status}`);
  return res.json();
}

export async function fetchLotTrackingDetail(lotNumber: string) {
  const res = await fetch(`${API_BASE}/inventory/lot-tracking/${lotNumber}`);
  if (!res.ok) throw new Error(`Lot tracking detail error: ${res.status}`);
  return res.json();
}

export async function createLotTrackingRecord(payload: {
  item_name: string;
  lot_number: string;
  total_quantity: number;
  location: string;
  expiration_date: string;
}) {
  const res = await fetch(`${API_BASE}/inventory/lot-tracking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Create lot tracking error: ${res.status}`);
  return res.json();
}

// ── Warehouse: Picking Tickets ────────────────────────────────────────────

export async function fetchPickingTickets(filters?: { 
  status?: string;
  operator?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.operator) params.set('operator', filters.operator);
  const res = await fetch(`${API_BASE}/picking/tickets?${params}`);
  if (!res.ok) throw new Error(`Picking tickets error: ${res.status}`);
  return res.json();
}

export async function fetchPickingTicketDetail(ticketId: string) {
  const res = await fetch(`${API_BASE}/picking/tickets/${ticketId}`);
  if (!res.ok) throw new Error(`Picking ticket detail error: ${res.status}`);
  return res.json();
}

export async function scanPickingItem(ticketId: string, payload: {
  scannerId: string;
  lotNumber: string;
  quantityScanned: number;
}) {
  const res = await fetch(`${API_BASE}/picking/tickets/${ticketId}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Scan picking item error: ${res.status}`);
  return res.json();
}

export async function updatePickingTicketStatus(ticketId: string, status: string) {
  const res = await fetch(`${API_BASE}/picking/tickets/${ticketId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Update picking ticket error: ${res.status}`);
  return res.json();
}

// ── Fulfillment Transactions (ERP-aligned) ──────────────────────────────────

export async function fetchFulfillmentOrders(filters?: {
  status?: string; // pending, picked, verified
  customer?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.customer) params.set('customer', filters.customer);
  const res = await fetch(`${API_BASE}/fulfillment/orders?${params}`);
  if (!res.ok) throw new Error(`Fulfillment orders error: ${res.status}`);
  return res.json();
}

export async function fetchFulfillmentOrderDetail(salesOrderNumber: string) {
  const res = await fetch(`${API_BASE}/fulfillment/orders/${salesOrderNumber}`);
  if (!res.ok) throw new Error(`Fulfillment order detail error: ${res.status}`);
  return res.json();
}

export async function recordPickingTransaction(
  salesOrderNumber: string,
  payload: {
    line_number: number;
    quantity_picked: number;
    lot_number?: string;
    picked_by: string;
    scanner_id?: string;
    notes?: string;
  }
) {
  const res = await fetch(`${API_BASE}/fulfillment/orders/${salesOrderNumber}/pick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Record picking transaction error: ${res.status}`);
  return res.json();
}

export async function recordVerificationTransaction(
  salesOrderNumber: string,
  payload: {
    line_number: number;
    quantity_verified: number;
    verified_by: string;
    variance_notes?: string;
  }
) {
  const res = await fetch(`${API_BASE}/fulfillment/orders/${salesOrderNumber}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Record verification transaction error: ${res.status}`);
  return res.json();
}

// ── Inventory Management (Warehouse Location Tracking) ──────────────────────

export async function fetchInventoryMovements(filters?: {
  location?: string;
  item?: string;
  lot?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.location) params.set('location', filters.location);
  if (filters?.item) params.set('item', filters.item);
  if (filters?.lot) params.set('lot', filters.lot);
  const res = await fetch(`${API_BASE}/inventory/movements?${params}`);
  if (!res.ok) throw new Error(`Inventory movements error: ${res.status}`);
  return res.json();
}

export async function fetchCurrentInventoryPositions() {
  const res = await fetch(`${API_BASE}/inventory/current-positions`);
  if (!res.ok) throw new Error(`Current inventory positions error: ${res.status}`);
  return res.json();
}

export async function fetchItemTracking(itemNumber: string, lotNumber: string) {
  const res = await fetch(`${API_BASE}/inventory/item-tracking/${itemNumber}/${lotNumber}`);
  if (!res.ok) throw new Error(`Item tracking error: ${res.status}`);
  return res.json();
}

export async function recordInventoryMovement(payload: {
  item_number: string;
  item_description: string;
  lot_number: string;
  quantity_moved: number;
  from_location: string;
  to_location: string;
  from_bin?: string;
  to_bin?: string;
  moved_by: string;
  reason: string;
  unit_of_measure?: string;
  notes?: string;
}) {
  const res = await fetch(`${API_BASE}/inventory/movements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Record inventory movement error: ${res.status}`);
  return res.json();
}

// ── Cycle Count Transactions (Department-based, Week-filtered) ──────────────

export async function fetchCycleCountDepartments() {
  const res = await fetch(`${API_BASE}/cycle-counts/departments`);
  if (!res.ok) throw new Error(`Cycle count departments error: ${res.status}`);
  return res.json();
}

export async function fetchCycleCountTransactions(department: string, week: number) {
  const res = await fetch(`${API_BASE}/cycle-counts/${department}/${week}`);
  if (!res.ok) throw new Error(`Cycle count transactions error: ${res.status}`);
  return res.json();
}

export async function fetchCycleCountSummary(department: string) {
  const res = await fetch(`${API_BASE}/cycle-counts/summary/${department}`);
  if (!res.ok) throw new Error(`Cycle count summary error: ${res.status}`);
  return res.json();
}
