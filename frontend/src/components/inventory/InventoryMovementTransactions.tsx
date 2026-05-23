import { useEffect, useState } from "react";
import { fetchInventoryMovements } from "../../api/client";

interface InventoryMove {
  item_number: string;
  item_description: string;
  lot_number: string;
  quantity_moved: number;
  from_location: string;
  to_location: string;
  from_bin?: string;
  to_bin?: string;
  moved_by: string;
  moved_timestamp: string;
  reason: string;
  unit_of_measure: string;
  transaction_status: string;
  notes?: string;
}

type FilterReason = "all" | "RECEIVE" | "QC_PASS" | "QC_FAIL" | "PICKING_PREP" | "CYCLE_COUNT" | "DAMAGED" | "MANUFACTURING_COMPLETE";

function formatTime(isoString: string): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(isoString: string): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function reasonBadgeColor(reason: string): string {
  if (reason === "QC_PASS") return "var(--color-success)";
  if (reason === "QC_FAIL" || reason === "DAMAGED") return "var(--color-error)";
  if (reason === "PICKING_PREP") return "var(--color-warning)";
  return "var(--color-info)";
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    RECEIVE: "📦 Receive",
    QC_PASS: "✓ QC Pass",
    QC_FAIL: "✗ QC Fail",
    PICKING_PREP: "🎯 Picking Prep",
    STAGING: "📍 Staging",
    MANUFACTURING_COMPLETE: "⚙ Mfg Done",
    CYCLE_COUNT: "📋 Count",
    DAMAGED: "⚠ Damaged",
    RETURN: "↩ Return",
    AUDIT: "🔍 Audit",
  };
  return labels[reason] || reason;
}

export function InventoryMovementTransactions() {
  const [movements, setMovements] = useState<InventoryMove[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterReason, setFilterReason] = useState<FilterReason>("all");
  const [filterLocation, setFilterLocation] = useState<string>("");

  const load = () => {
    setLoading(true);
    const params: Parameters<typeof fetchInventoryMovements>[0] = {};
    if (filterReason !== "all") params.reason = filterReason;
    if (filterLocation) params.location = filterLocation;

    fetchInventoryMovements(params)
      .then((d) => setMovements(d.movements ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filterReason, filterLocation]);

  if (error) return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  if (loading) return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading movements…</div>;

  const reasons: FilterReason[] = ["all", "RECEIVE", "QC_PASS", "QC_FAIL", "PICKING_PREP", "MANUFACTURING_COMPLETE"];

  return (
    <div>
      <div style={{ marginBottom: "var(--space-md)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {reasons.map((r) => (
          <button
            key={r}
            onClick={() => setFilterReason(r)}
            style={{
              padding: "8px 12px",
              border:
                filterReason === r
                  ? "2px solid var(--color-primary)"
                  : "1px solid var(--color-border)",
              backgroundColor:
                filterReason === r
                  ? "var(--color-primary-bg)"
                  : "transparent",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: filterReason === r ? "600" : "400",
            }}
          >
            {reasonLabel(r)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {movements.map((move, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.9fr 1.2fr 0.8fr",
              gap: "12px",
              padding: "12px",
              backgroundColor: "var(--color-bg-muted)",
              borderRadius: "4px",
              borderLeft: `4px solid ${reasonBadgeColor(move.reason)}`,
              fontSize: "12px",
            }}
          >
            {/* Item Info */}
            <div>
              <div style={{ fontWeight: "600", color: "var(--color-text-primary)", marginBottom: "2px" }}>
                {move.item_number}
              </div>
              <div style={{ fontSize: "11px", color: "var(--color-text-light)", marginBottom: "2px" }}>
                {move.item_description}
              </div>
              <div style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>
                {move.lot_number}
              </div>
            </div>

            {/* Location Flow */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>From:</div>
                <div style={{ fontWeight: "500" }}>{move.from_location}</div>
                {move.from_bin && (
                  <div style={{ fontSize: "10px", color: "var(--color-text-light)" }}>{move.from_bin}</div>
                )}
              </div>
              <div style={{ fontSize: "16px", color: "var(--color-text-light)" }}>→</div>
              <div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>To:</div>
                <div style={{ fontWeight: "500" }}>{move.to_location}</div>
                {move.to_bin && (
                  <div style={{ fontSize: "10px", color: "var(--color-text-light)" }}>{move.to_bin}</div>
                )}
              </div>
            </div>

            {/* Quantity & Reason */}
            <div style={{ display: "flex", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Qty Moved:</div>
                <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--color-primary)" }}>
                  {move.quantity_moved}
                </div>
                <div style={{ fontSize: "10px", color: "var(--color-text-light)" }}>{move.unit_of_measure}</div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: "600",
                    color: reasonBadgeColor(move.reason),
                    backgroundColor: `${reasonBadgeColor(move.reason)}15`,
                    padding: "4px 8px",
                    borderRadius: "3px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {reasonLabel(move.reason)}
                </div>
                {move.notes && (
                  <div style={{ fontSize: "10px", color: "var(--color-text-light)", marginTop: "4px" }}>
                    {move.notes}
                  </div>
                )}
              </div>
            </div>

            {/* Operator & Time */}
            <div>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginBottom: "2px" }}>
                Moved By:
              </div>
              <div style={{ fontWeight: "500", marginBottom: "4px" }}>{move.moved_by}</div>
              <div style={{ fontSize: "10px", color: "var(--color-text-light)" }}>
                {formatDate(move.moved_timestamp)}
              </div>
              <div style={{ fontSize: "10px", color: "var(--color-text-light)" }}>
                {formatTime(move.moved_timestamp)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {movements.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          No movements in this view.
        </div>
      )}
    </div>
  );
}
