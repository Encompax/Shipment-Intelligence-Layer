import { useEffect, useState } from "react";
import { fetchSilInTransit } from "../../api/client";

interface InTransitRow {
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
  weight_lbs: number;
  pack_qty: number;
  is_hazmat: number;
  status_description: string;
  estimated_delivery: string;
  is_exception: number;
  days_in_transit: number;
}

export function InTransitWidget() {
  const [rows, setRows] = useState<InTransitRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSilInTransit()
      .then((d) => setRows(d.shipments ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading in-transit…</div>;
  if (error) return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  if (rows.length === 0) return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>No shipments currently in transit.</div>;

  return (
    <div>
      <div style={{ marginBottom: "var(--space-sm)" }}>
        <span className="badge badge-info">{rows.length} in transit</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Destination</th>
              <th>Carrier</th>
              <th>Est. Delivery</th>
              <th style={{ textAlign: "right" }}>Days Out</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const late = row.days_in_transit > 7;
              return (
                <tr key={row.id}>
                  <td style={{ fontWeight: "var(--font-weight-medium)" }}>
                    {row.gp_order_number || "—"}
                    {row.is_hazmat === 1 && (
                      <span className="badge badge-warning" style={{ marginLeft: "var(--space-xs)" }}>HazMat</span>
                    )}
                  </td>
                  <td>{row.dest_name ? `${row.dest_name} (${row.dest_state})` : `${row.dest_city}, ${row.dest_state}`}</td>
                  <td>{row.carrier_name}<br /><span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-light)" }}>{row.carrier_service}</span></td>
                  <td>{row.estimated_delivery ? new Date(row.estimated_delivery).toLocaleDateString() : "—"}</td>
                  <td style={{ textAlign: "right", color: late ? "var(--color-warning)" : undefined, fontWeight: late ? "var(--font-weight-semibold)" : undefined }}>
                    {row.days_in_transit ?? "—"}
                  </td>
                  <td>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                      {row.status_description || "In Transit"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
