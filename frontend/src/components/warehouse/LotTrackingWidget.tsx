import { useEffect, useState } from "react";
import { fetchLotTracking } from "../../api/client";

interface LotItem {
  id: string;
  item_number: string;
  item_description: string;
  lot_number: string;
  quantity_total: number;
  quantity_picked: number;
  quantity_available: number;
  location: string;
  received_date: string;
  expiration_date: string;
  is_priority: boolean;
  status: 'available' | 'picking' | 'picked' | 'staged' | 'shipped';
  order_reference?: string;
}

interface LotSummary {
  total_active_lots: number;
  priority_lots: number;
  lots_near_expiration: number;
  total_quantity_in_stock: number;
  lots: LotItem[];
}

const STATUS_COLORS: Record<string, string> = {
  'available': '#4CAF50',
  'picking': '#FF9800',
  'picked': '#2196F3',
  'staged': '#9C27B0',
  'shipped': '#757575',
};

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-change">{sub}</div>}
    </div>
  );
}

export function LotTrackingWidget() {
  const [data, setData] = useState<LotSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchLotTracking()
      .then((response) => {
        setData(response);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  }

  if (!data) {
    return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading lot data…</div>;
  }

  const filteredLots = data.lots.filter((lot) => {
    const matchesSearch =
      lot.item_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lot.lot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lot.item_description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = !filterPriority || lot.is_priority;
    const matchesStatus = !filterStatus || lot.status === filterStatus;
    return matchesSearch && matchesPriority && matchesStatus;
  });

  const fmtN = (v: number) => v.toLocaleString();

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
        <MetricCard label="Active Lots" value={fmtN(data.total_active_lots)} />
        <MetricCard label="Priority Lots" value={fmtN(data.priority_lots)} sub="Special handling" />
        <MetricCard label="Total Qty" value={fmtN(data.total_quantity_in_stock)} />
        <MetricCard label="Near Expiration" value={fmtN(data.lots_near_expiration)} sub="< 30 days" />
      </div>

      {/* Search & Filters */}
      <div style={{ marginBottom: "var(--space-lg)", display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Search by item, lot number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: "250px",
            padding: "10px",
            border: "1px solid var(--color-border)",
            borderRadius: "4px",
            fontSize: "var(--font-size-sm)",
          }}
        />
        <button
          onClick={() => setFilterPriority(!filterPriority)}
          style={{
            padding: "10px 16px",
            border: filterPriority ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: filterPriority ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "var(--font-size-sm)",
            fontWeight: filterPriority ? "600" : "400",
          }}
        >
          Priority Only
        </button>
      </div>

      {/* Status Filter */}
      <div style={{ marginBottom: "var(--space-md)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          onClick={() => setFilterStatus(null)}
          style={{
            padding: "6px 12px",
            border: filterStatus === null ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: filterStatus === null ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: filterStatus === null ? "600" : "400",
          }}
        >
          All Status
        </button>
        {['available', 'picking', 'picked', 'staged', 'shipped'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(filterStatus === status ? null : status)}
            style={{
              padding: "6px 12px",
              border: filterStatus === status ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
              backgroundColor: filterStatus === status ? "var(--color-primary-bg)" : "transparent",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: filterStatus === status ? "600" : "500",
              color: STATUS_COLORS[status],
            }}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Lots Table */}
      <div style={{ overflowX: "auto", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--color-bg-muted)", borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Item</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Lot Number</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Total</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Picked</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Available</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Location</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Status</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Expires</th>
            </tr>
          </thead>
          <tbody>
            {filteredLots.map((lot) => {
              const expiryDate = new Date(lot.expiration_date);
              const today = new Date();
              const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const isNearExpiry = daysUntilExpiry < 30 && daysUntilExpiry > 0;
              const isExpired = daysUntilExpiry <= 0;

              return (
                <tr key={lot.id} style={{ borderBottom: "1px solid var(--color-border-muted)" }}>
                  <td style={{ padding: "12px", fontWeight: lot.is_priority ? "700" : "500", color: lot.is_priority ? "var(--color-error)" : "var(--color-text-primary)" }}>
                    {lot.item_number}
                    {lot.is_priority && <span style={{ marginLeft: "4px", fontSize: "10px", color: "var(--color-error)" }}>★</span>}
                  </td>
                  <td style={{ padding: "12px", fontFamily: "monospace", fontSize: "10px", color: "var(--color-text-secondary)" }}>
                    {lot.lot_number}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center", color: "var(--color-text-primary)" }}>
                    {fmtN(lot.quantity_total)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center", color: "var(--color-warning)" }}>
                    {fmtN(lot.quantity_picked)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center", fontWeight: "500", color: lot.quantity_available < 10 ? "var(--color-error)" : "var(--color-success)" }}>
                    {fmtN(lot.quantity_available)}
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-primary)" }}>
                    {lot.location}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "3px",
                      fontSize: "10px",
                      fontWeight: "600",
                      backgroundColor: STATUS_COLORS[lot.status],
                      color: "white",
                    }}>
                      {lot.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{
                    padding: "12px",
                    color: isExpired ? "var(--color-error)" : isNearExpiry ? "var(--color-warning)" : "var(--color-text-secondary)",
                    fontWeight: isExpired || isNearExpiry ? "600" : "400",
                  }}>
                    {expiryDate.toLocaleDateString()} {isExpired && "⚠"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredLots.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--color-text-muted)" }}>
          No lots found matching your criteria.
        </div>
      )}
    </div>
  );
}
