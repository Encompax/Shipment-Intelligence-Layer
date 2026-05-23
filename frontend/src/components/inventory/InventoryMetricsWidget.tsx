import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface CycleCountMetrics {
  total_sku_count: number;
  locations_completed: number;
  locations_pending: number;
  accuracy_rate: number;
  variance_percentage: number;
  avg_count_time_minutes: number;
}

interface CycleCountData {
  location: string;
  completed: number;
  pending: number;
  accuracy: number;
}

interface MetricsResponse {
  summary: CycleCountMetrics;
  byLocation: CycleCountData[];
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

export function InventoryMetricsWidget() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mockData: MetricsResponse = {
      summary: {
        total_sku_count: 12847,
        locations_completed: 42,
        locations_pending: 8,
        accuracy_rate: 98.6,
        variance_percentage: 1.4,
        avg_count_time_minutes: 23,
      },
      byLocation: [
        { location: "Bin A1", completed: 341, pending: 15, accuracy: 99.2 },
        { location: "Bin A2", completed: 289, pending: 22, accuracy: 98.1 },
        { location: "Bin B1", completed: 412, pending: 18, accuracy: 98.9 },
        { location: "Bin B2", completed: 356, pending: 25, accuracy: 97.8 },
        { location: "Bin C1", completed: 398, pending: 12, accuracy: 99.1 },
        { location: "Bin C2", completed: 325, pending: 20, accuracy: 98.5 },
      ],
    };
    setData(mockData);
  }, []);

  if (error) return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  if (!data) return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading metrics…</div>;

  const s = data.summary;
  const fmtP = (v: number | null) =>
    v == null ? "—" : v.toFixed(1) + "%";
  const fmtN = (v: number | null) =>
    v == null ? "—" : v.toLocaleString();

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
        <MetricCard label="Total SKUs Counted" value={fmtN(s.total_sku_count)} />
        <MetricCard label="Locations Completed" value={fmtN(s.locations_completed)} sub={`${s.locations_pending} pending`} />
        <MetricCard label="Accuracy Rate" value={fmtP(s.accuracy_rate)} />
        <MetricCard label="Variance" value={fmtP(s.variance_percentage)} />
        <MetricCard label="Avg Count Time" value={s.avg_count_time_minutes + " min"} />
      </div>

      <div style={{ marginBottom: "var(--space-md)" }}>
        <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)", marginBottom: "var(--space-sm)" }}>
          Accuracy by Location
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.byLocation} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="location" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} domain={[0, 100]} />
            <Tooltip
              formatter={(v: number) => [v.toFixed(1) + "%", "Accuracy"]}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="accuracy" fill="var(--color-success)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
