import { useEffect, useState } from "react";
import { fetchSilExceptions } from "../../api/client";

interface ExceptionRow {
  id: string;
  tracking_number: string;
  carrier_name: string;
  carrier_service: string;
  ship_date: string;
  dest_name: string;
  dest_city: string;
  dest_state: string;
  gp_order_number: string;
  gp_customer_id: string;
  status_description: string;
  exception_reason: string;
  estimated_delivery: string;
  last_checked_at: string;
}

export function ExceptionsWidget() {
  const [rows, setRows] = useState<ExceptionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSilExceptions()
      .then((d) => setRows(d.exceptions ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Checking for exceptions…</div>;
  if (error) return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;

  if (rows.length === 0) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        padding: "var(--space-md)",
        background: "rgba(31,127,74,0.07)",
        borderRadius: "var(--radius-md)",
        color: "var(--color-success)",
        fontSize: "var(--font-size-sm)",
        fontWeight: "var(--font-weight-medium)",
      }}>
        ✓ No active exceptions
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        marginBottom: "var(--space-md)",
        padding: "var(--space-sm) var(--space-md)",
        background: "rgba(196,56,61,0.07)",
        borderRadius: "var(--radius-md)",
        color: "var(--color-error)",
        fontSize: "var(--font-size-sm)",
        fontWeight: "var(--font-weight-semibold)",
      }}>
        ⚠ {rows.length} active exception{rows.length !== 1 ? "s" : ""}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
        {rows.map((row) => (
          <div key={row.id} style={{
            border: "1px solid rgba(196,56,61,0.25)",
            borderLeft: "3px solid var(--color-error)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-sm) var(--space-md)",
            background: "rgba(196,56,61,0.03)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2px" }}>
              <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-primary)" }}>
                {row.gp_order_number || row.tracking_number || row.id}
              </span>
              <span className="badge badge-error">{row.carrier_name}</span>
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
              {row.dest_name} · {row.dest_city}, {row.dest_state}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-error)", marginTop: "2px" }}>
              {row.exception_reason || row.status_description || "Exception flagged"}
            </div>
            {row.estimated_delivery && (
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-light)", marginTop: "2px" }}>
                Est. delivery: {new Date(row.estimated_delivery).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
