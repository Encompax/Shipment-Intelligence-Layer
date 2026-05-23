import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fetchSilMetrics } from "../../api/client";

interface MetricsSummary {
  total_shipments: number;
  total_freight_cost: number;
  avg_cost_per_shipment: number;
  hazmat_count: number;
  ltl_count: number;
  total_weight_lbs: number;
  total_packages: number;
}

interface DayRow {
  day: string;
  count: number;
  total_cost: number;
}

interface CarrierRow {
  carrier_name: string;
  count: number;
  total_cost: number;
}

interface MetricsResponse {
  period: { from: string; to: string };
  summary: MetricsSummary;
  byDay: DayRow[];
  byCarrier: CarrierRow[];
  exceptionCount: number;
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-change">{sub}</div>}
    </div>
  );
}

export function ShipmentMetricsWidget() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    fetchSilMetrics(from, to)
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  if (!data) return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading metrics…</div>;

  const s = data.summary;
  const fmt$ = (v: number | null) =>
    v == null ? "—" : "$" + Math.round(v).toLocaleString();
  const fmtN = (v: number | null) =>
    v == null ? "—" : v.toLocaleString();

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
        <MetricCard label="Shipments (30d)" value={fmtN(s.total_shipments)} />
        <MetricCard label="Freight Cost" value={fmt$(s.total_freight_cost)} sub={`avg ${fmt$(s.avg_cost_per_shipment)} ea`} />
        <MetricCard label="Total Packages" value={fmtN(s.total_packages)} />
        <MetricCard label="Hazmat" value={fmtN(s.hazmat_count)} />
        <MetricCard label="LTL / Freight" value={fmtN(s.ltl_count)} />
        <MetricCard label="Exceptions" value={fmtN(data.exceptionCount)} />
      </div>

      <div style={{ marginBottom: "var(--space-md)" }}>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)", marginBottom: "var(--space-sm)" }}>
          Shipments per Day — last 30 days
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.byDay} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip
              formatter={(v: number) => [v, "Shipments"]}
              labelFormatter={(l) => `Date: ${l}`}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="count" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)", marginBottom: "var(--space-sm)" }}>
          By Carrier
        </div>
        <table>
          <thead>
            <tr>
              <th>Carrier</th>
              <th style={{ textAlign: "right" }}>Shipments</th>
              <th style={{ textAlign: "right" }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.byCarrier.map((row) => (
              <tr key={row.carrier_name}>
                <td>{row.carrier_name || "Unknown"}</td>
                <td style={{ textAlign: "right" }}>{row.count}</td>
                <td style={{ textAlign: "right" }}>{fmt$(row.total_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
