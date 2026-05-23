import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { fetchCarrierMetrics } from "../../api/client";

interface CarrierMetrics {
  carrier_name: string;
  shipment_count: number;
  total_cost: number;
  avg_weight_lbs: number;
  on_time_rate: number;
  exception_rate: number;
  trend: Array<{ date: string; count: number }>;
}

interface CarrierBreakdown {
  total_shipments: number;
  total_cost: number;
  avg_shipment_cost: number;
  carriers: CarrierMetrics[];
  cost_by_carrier: Array<{ name: string; value: number }>;
  volume_by_carrier: Array<{ name: string; value: number }>;
}

const CHART_COLORS = [
  '#1B4F8C', // navy
  '#47BDBD', // teal
  '#2A9D8F',
  '#E76F51',
  '#F4A261',
  '#E9C46A',
  '#264653',
  '#118AB2',
  '#06D6A0',
  '#FFD166',
];

const colorForName = (name: string) => {
  if (!name) return CHART_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 2147483647;
  }
  return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
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

export function CarrierMetricsWidget() {
  const [data, setData] = useState<CarrierBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCarrierMetrics()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  }

  if (!data) {
    return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading carrier metrics…</div>;
  }

  const fmt$ = (v: number) => "$" + Math.round(v).toLocaleString();
  const fmtN = (v: number) => v.toLocaleString();
  const fmtPct = (v: number) => (v * 100).toFixed(1) + "%";

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
        <MetricCard label="Total Shipments" value={fmtN(data.total_shipments)} />
        <MetricCard label="Total Cost" value={fmt$(data.total_cost)} sub={`avg ${fmt$(data.avg_shipment_cost)}`} />
      </div>

      {/* Carrier Breakdown Table */}
      <div style={{ marginBottom: "var(--space-lg)" }}>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)", marginBottom: "var(--space-sm)" }}>
          Carrier Performance Summary
        </div>
        <div style={{ overflowX: "auto", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--color-bg-muted)", borderBottom: "2px solid var(--color-border)" }}>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Carrier</th>
                <th style={{ padding: "12px", textAlign: "right", fontWeight: "600", color: "var(--color-text-secondary)" }}>Shipments</th>
                <th style={{ padding: "12px", textAlign: "right", fontWeight: "600", color: "var(--color-text-secondary)" }}>Cost</th>
                <th style={{ padding: "12px", textAlign: "right", fontWeight: "600", color: "var(--color-text-secondary)" }}>Avg Weight</th>
                <th style={{ padding: "12px", textAlign: "right", fontWeight: "600", color: "var(--color-text-secondary)" }}>On-Time</th>
                <th style={{ padding: "12px", textAlign: "right", fontWeight: "600", color: "var(--color-text-secondary)" }}>Exception</th>
              </tr>
            </thead>
            <tbody>
              {data.carriers.map((carrier) => (
                <tr key={carrier.carrier_name} style={{ borderBottom: "1px solid var(--color-border-muted)" }}>
                  <td style={{ padding: "12px", fontWeight: "600", color: "var(--color-primary)" }}>
                    {carrier.carrier_name}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--color-text-primary)" }}>
                    {fmtN(carrier.shipment_count)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--color-text-primary)" }}>
                    {fmt$(carrier.total_cost)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", color: "var(--color-text-secondary)" }}>
                    {carrier.avg_weight_lbs.toFixed(1)} lbs
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontWeight: "500", color: "var(--color-success)" }}>
                    {fmtPct(carrier.on_time_rate)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontWeight: "500", color: carrier.exception_rate > 0.03 ? "var(--color-error)" : "var(--color-warning)" }}>
                    {fmtPct(carrier.exception_rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)", marginBottom: "var(--space-lg)" }}>
        <div>
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)", marginBottom: "var(--space-sm)" }}>
            Cost Distribution by Carrier
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data.cost_by_carrier}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: $${(value / 1000).toFixed(1)}k`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {data.cost_by_carrier.map((entry) => (
                  <Cell key={`cell-${entry.name}`} fill={colorForName(entry.name)} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => fmt$(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Volume Breakdown */}
        <div>
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)", marginBottom: "var(--space-sm)" }}>
            Shipment Volume by Carrier
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data.volume_by_carrier}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {data.volume_by_carrier.map((entry) => (
                  <Cell key={`cell-${entry.name}`} fill={colorForName(entry.name)} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => fmtN(value)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
