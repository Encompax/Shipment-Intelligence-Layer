import { useEffect, useState } from "react";
import { fetchSilLiveFeed } from "../../api/client";

interface ShipmentRow {
  id: string;
  tracking_number: string;
  carrier_name: string;
  carrier_service: string;
  ship_date: string;
  estimated_delivery: string;
  required_ship_date?: string;
  dest_name: string;
  dest_city: string;
  dest_state: string;
  dest_country?: string;
  weight_lbs: number;
  pack_qty: number;
  applied_cost: number;
  gp_order_number: string;
  gp_customer_id: string;
  item_number?: string;
  shipping_method?: string;
  quantity_requested?: number;
  quantity_available?: number;
  lcbff_status?: string;
  business_unit?: string;
  is_hazmat: number;
  is_freight: number;
  is_open_order?: number;
  status_code: number;
  starship_user: string;
  fedex_status: string;
  status_description: string;
  is_delivered: number;
  is_exception: number;
  actual_delivery: string;
}

interface ViewMetrics {
  totalOrders: number;
  priority_count: number;
  exception_count: number;
  estimated_weight_lbs: number;
  by_shipping_method: Record<string, number>;
  by_business_unit: Record<string, number>;
}

type ViewMode = "all" | "priority" | "internal" | "external";

function statusBadge(row: ShipmentRow) {
  if (row.is_exception) return <span className="badge badge-error">Exception</span>;
  if (row.is_delivered) return <span className="badge badge-success">Delivered</span>;
  if (row.status_code === 0) return <span className="badge badge-warning">Open</span>;
  if (row.status_code === 1) return <span className="badge badge-info">Processed</span>;
  return <span className="badge">{row.fedex_status || "—"}</span>;
}

function calculateELL(requiredShipDate?: string): number | null {
  if (!requiredShipDate) return null;
  const req = new Date(requiredShipDate);
  if (isNaN(req.getTime())) return null; // Handle invalid date strings
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  req.setHours(0, 0, 0, 0);
  return Math.floor((req.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function ellBadgeColor(ell: number | null) {
  if (ell === null) return "var(--color-text-light)";
  if (ell < 0) return "var(--color-error)";
  if (ell === 0) return "var(--color-error)";
  if (ell <= 2) return "var(--color-warning)";
  return "var(--color-success)";
}

function ellBackground(ell: number | null) {
  if (ell === null) return "transparent";
  if (ell <= 0) return "rgba(239, 68, 68, 0.1)";
  if (ell <= 2) return "rgba(245, 158, 11, 0.1)";
  return "transparent";
}

function isInternationalOrder(row: ShipmentRow): boolean {
  if (!row.dest_country) return false;
  return row.dest_country.toUpperCase() !== "US" && row.dest_country.toUpperCase() !== "USA";
}

function getBusinessUnit(row: ShipmentRow): string {
  return row.business_unit || "External";
}

function calculateMetrics(rows: ShipmentRow[]): ViewMetrics {
  const metrics: ViewMetrics = {
    totalOrders: new Set(rows.map(r => r.gp_order_number)).size,
    priority_count: rows.filter(r => r.is_exception || r.is_hazmat || r.is_freight).length,
    exception_count: rows.filter(r => r.is_exception).length,
    estimated_weight_lbs: rows.reduce((sum, r) => sum + (r.weight_lbs || 0), 0),
    by_shipping_method: {},
    by_business_unit: {},
  };

  rows.forEach(row => {
    const method = row.shipping_method || row.carrier_service || "—";
    metrics.by_shipping_method[method] = (metrics.by_shipping_method[method] || 0) + 1;
    
    const unit = getBusinessUnit(row);
    metrics.by_business_unit[unit] = (metrics.by_business_unit[unit] || 0) + 1;
  });

  return metrics;
}

export function LiveFeedWidget() {
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  function load() {
    setLoading(true);
    fetchSilLiveFeed()
      .then((d) => { setRows(d.shipments ?? []); setLastRefresh(new Date()); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;

  let filtered = rows;
  if (viewMode === "priority") {
    filtered = rows.filter(r => r.is_exception || r.is_hazmat || r.is_freight);
  } else if (viewMode === "internal") {
    filtered = rows.filter(r => {
      const unit = getBusinessUnit(r);
      return unit.toLowerCase() === "internal";
    });
  } else if (viewMode === "external") {
    filtered = rows.filter(r => getBusinessUnit(r) === "External");
  }

  filtered = filtered.sort((a, b) => {
    const ellA = calculateELL(a.required_ship_date);
    const ellB = calculateELL(b.required_ship_date);
    if (ellA === null && ellB === null) return 0;
    if (ellA === null) return 1;
    if (ellB === null) return -1;
    return ellA - ellB;
  });

  const metrics = calculateMetrics(filtered);

  return (
    <div>
      <div style={{ marginBottom: "var(--space-md)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          onClick={() => setViewMode("all")}
          style={{
            padding: "10px 16px",
            border: viewMode === "all" ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: viewMode === "all" ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: viewMode === "all" ? "600" : "400",
          }}
        >
          All Orders
        </button>
        <button
          onClick={() => setViewMode("priority")}
          style={{
            padding: "10px 16px",
            border: viewMode === "priority" ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: viewMode === "priority" ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: viewMode === "priority" ? "600" : "400",
          }}
        >
          ★ Priority / Exceptions
        </button>
        <button
          onClick={() => setViewMode("internal")}
          style={{
            padding: "10px 16px",
            border: viewMode === "internal" ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: viewMode === "internal" ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: viewMode === "internal" ? "600" : "400",
          }}
        >
          Internal Units
        </button>
        <button
          onClick={() => setViewMode("external")}
          style={{
            padding: "10px 16px",
            border: viewMode === "external" ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: viewMode === "external" ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: viewMode === "external" ? "600" : "400",
          }}
        >
          External Only
        </button>
        <span style={{ marginLeft: "auto", fontSize: "var(--font-size-xs)", color: "var(--color-text-light)", alignSelf: "center" }}>
          {loading ? "Refreshing…" : lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : ""}
        </span>
        <button className="btn btn-secondary btn-small" onClick={load} disabled={loading}>
          ↻ Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "var(--space-lg)" }}>
        <div style={{ padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: "4px" }}>Open Orders</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--color-primary)" }}>{metrics.totalOrders}</div>
        </div>
        <div style={{ padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: "4px" }}>Priority Shipments</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--color-warning)" }}>{metrics.priority_count}</div>
        </div>
        <div style={{ padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: "4px" }}>Exceptions</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--color-warning)" }}>{metrics.exception_count}</div>
        </div>
        <div style={{ padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: "4px" }}>Est. Weight</div>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--color-info)" }}>{metrics.estimated_weight_lbs.toLocaleString()}#</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "var(--space-lg)" }}>
        <div style={{ padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "var(--font-size-xs)" }}>
          <div style={{ fontWeight: "600", marginBottom: "8px", color: "var(--color-text-secondary)" }}>By Shipping Method</div>
          {Object.entries(metrics.by_shipping_method).map(([method, count]) => (
            <div key={method} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span>{method}</span>
              <span style={{ fontWeight: "600" }}>{count}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "var(--font-size-xs)" }}>
          <div style={{ fontWeight: "600", marginBottom: "8px", color: "var(--color-text-secondary)" }}>By Business Unit</div>
          {Object.entries(metrics.by_business_unit).map(([unit, count]) => (
            <div key={unit} style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
              <span>{unit}</span>
              <span style={{ fontWeight: "600" }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "center" }}>ELL</th>
              <th>Order #</th>
              <th>Item #</th>
              <th>Qty Req</th>
              <th>OH</th>
              <th>LCBFF</th>
              <th>Shipping Method</th>
              <th>Destination</th>
              <th>Intl</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const ell = calculateELL(row.required_ship_date);
              const isIntl = isInternationalOrder(row);
              return (
                <tr key={row.id} style={{ backgroundColor: ellBackground(ell) }}>
                  <td style={{
                    textAlign: "center",
                    fontWeight: "600",
                    color: ellBadgeColor(ell),
                    whiteSpace: "nowrap"
                  }}>
                    {ell !== null ? (ell >= 0 ? "+" : "") + ell : "—"}
                  </td>
                  <td style={{ fontWeight: "600", whiteSpace: "nowrap" }}>
                    {row.gp_order_number || "—"}
                    {row.is_hazmat === 1 && <span className="badge badge-warning" style={{ marginLeft: "4px" }}>HZ</span>}
                  </td>
                  <td style={{ fontSize: "var(--font-size-xs)", fontFamily: "monospace", fontWeight: "500" }}>
                    {row.item_number || "—"}
                    {(row.item_number?.includes("5740") || row.item_number?.includes("5741")) && 
                      <span style={{ marginLeft: "4px", color: "var(--color-error)" }}>★</span>}
                  </td>
                  <td style={{ textAlign: "right", fontSize: "var(--font-size-xs)" }}>
                    {row.quantity_requested || row.pack_qty || "—"}
                  </td>
                  <td style={{ textAlign: "right", fontSize: "var(--font-size-xs)", fontWeight: "500", color: row.quantity_available === 0 ? "var(--color-error)" : "var(--color-success)" }}>
                    {row.quantity_available ?? "—"}
                  </td>
                  <td style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                    {row.lcbff_status || "—"}
                  </td>
                  <td style={{ fontSize: "var(--font-size-xs)", whiteSpace: "nowrap" }}>
                    {row.shipping_method || row.carrier_service || "—"}
                  </td>
                  <td style={{ fontSize: "var(--font-size-xs)" }}>
                    {row.dest_city}{row.dest_state ? `, ${row.dest_state}` : ""}
                  </td>
                  <td style={{ textAlign: "center", fontSize: "var(--font-size-xs)", fontWeight: "600", color: isIntl ? "var(--color-error)" : "var(--color-text-light)" }}>
                    {isIntl ? "✈" : "—"}
                  </td>
                  <td>{statusBadge(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          No orders in this view.
        </div>
      )}
    </div>
  );
}
