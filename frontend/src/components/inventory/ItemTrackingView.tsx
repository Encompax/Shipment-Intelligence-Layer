import { useState } from "react";
import { fetchItemTracking } from "../../api/client";

interface CurrentPosition {
  item_number: string;
  item_description: string;
  lot_number: string;
  current_location: string;
  current_bin: string;
  quantity_at_location: number;
}

interface MovementHistory {
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
  notes?: string;
}

interface ItemTrackingData {
  current_position: CurrentPosition;
  total_moves: number;
  movement_history: MovementHistory[];
}

function formatTime(isoString: string): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function reasonColor(reason: string): string {
  if (reason === "QC_PASS") return "var(--color-success)";
  if (reason === "QC_FAIL" || reason === "DAMAGED") return "var(--color-error)";
  if (reason === "PICKING_PREP" || reason === "STAGING") return "var(--color-warning)";
  if (reason === "MANUFACTURING_COMPLETE") return "var(--color-info)";
  return "var(--color-text-secondary)";
}

export function ItemTrackingView() {
  const [searchItem, setSearchItem] = useState<string>("");
  const [searchLot, setSearchLot] = useState<string>("");
  const [trackingData, setTrackingData] = useState<ItemTrackingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchItem || !searchLot) {
      setError("Please enter both item number and lot number");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchItemTracking(searchItem.toUpperCase(), searchLot.toUpperCase());
      setTrackingData(data);
    } catch (e) {
      setError((e as Error).message);
      setTrackingData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div>
      {/* Search Controls */}
      <div style={{ marginBottom: "var(--space-lg)", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "var(--color-text-secondary)" }}>
            Item Number
          </label>
          <input
            type="text"
            value={searchItem}
            onChange={(e) => setSearchItem(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="e.g., ACC-SP5740"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              fontSize: "13px",
              fontFamily: "monospace",
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", marginBottom: "4px", color: "var(--color-text-secondary)" }}>
            Lot Number
          </label>
          <input
            type="text"
            value={searchLot}
            onChange={(e) => setSearchLot(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="e.g., LOT-202603-SP5740-001"
            style={{
              width: "100%",
              padding: "8px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: "4px",
              fontSize: "13px",
              fontFamily: "monospace",
            }}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            padding: "8px 20px",
            backgroundColor: "var(--color-primary)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: "13px",
            fontWeight: "600",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Searching…" : "Track Item"}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{marginBottom: "var(--space-md)", padding: "12px", backgroundColor: "rgba(244, 67, 54, 0.1)", borderRadius: "4px", color: "var(--color-error)", fontSize: "12px" }}>
          ⚠ {error}
        </div>
      )}

      {/* Tracking Result */}
      {trackingData && (
        <div>
          {/* Current Position Card */}
          <div
            style={{
              marginBottom: "var(--space-lg)",
              padding: "16px",
              border: "2px solid var(--color-success)",
              borderRadius: "6px",
              backgroundColor: "rgba(76, 175, 80, 0.05)",
            }}
          >
            <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-success)", marginBottom: "8px", textTransform: "uppercase" }}>
              📍 Current Location
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>Item</div>
                <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-text-primary)" }}>
                  {trackingData.current_position.item_number}
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-text-light)" }}>
                  {trackingData.current_position.item_description}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>Location</div>
                <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--color-info)" }}>
                  {trackingData.current_position.current_location}
                </div>
                {trackingData.current_position.current_bin && (
                  <div style={{ fontSize: "11px", color: "var(--color-text-light)", fontFamily: "monospace" }}>
                    {trackingData.current_position.current_bin}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>Lot Number</div>
                <div style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-primary)" }}>
                  {trackingData.current_position.lot_number}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>Quantity</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--color-success)" }}>
                  {trackingData.current_position.quantity_at_location} units
                </div>
              </div>
            </div>
          </div>

          {/* Movement Timeline */}
          <div>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text-primary)", marginBottom: "12px" }}>
              Movement History ({trackingData.total_moves} moves)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {trackingData.movement_history.map((move, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr 1fr",
                    gap: "12px",
                    padding: "12px",
                    backgroundColor: "var(--color-bg-muted)",
                    borderRadius: "4px",
                    borderLeft: `4px solid ${reasonColor(move.reason)}`,
                  }}
                >
                  {/* Timeline Step Number */}
                  <div style={{textAlign: "center" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        backgroundColor: reasonColor(move.reason),
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      {idx + 1}
                    </div>
                  </div>

                  {/* Movement Details */}
                  <div style={{ fontSize: "12px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                      <div style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>
                        {move.from_location}
                      </div>
                      <div style={{ color: "var(--color-text-light)" }}>→</div>
                      <div style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>
                        {move.to_location}
                      </div>
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      {move.from_bin && `From: ${move.from_bin}`}
                      {move.from_bin && move.to_bin && " • "}
                      {move.to_bin && `To: ${move.to_bin}`}
                    </div>
                    {move.notes && (
                      <div style={{ fontSize: "11px", color: "var(--color-text-light)", marginTop: "2px" }}>
                        {move.notes}
                      </div>
                    )}
                  </div>

                  {/* Reason & Operator */}
                  <div style={{ fontSize: "11px", textAlign: "right" }}>
                    <div
                      style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        backgroundColor: `${reasonColor(move.reason)}20`,
                        color: reasonColor(move.reason),
                        borderRadius: "3px",
                        fontWeight: "600",
                        marginBottom: "4px",
                      }}
                    >
                      {move.reason.replace(/_/g, " ")}
                    </div>
                    <div style={{ color: "var(--color-text-light)" }}>{move.moved_by}</div>
                    <div style={{ color: "var(--color-text-light)", fontSize: "10px" }}>
                      {formatTime(move.moved_timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!trackingData && !error && !loading && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "var(--color-text-muted)",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔍</div>
          <div>Enter an item number and lot number to track its warehouse journey</div>
        </div>
      )}
    </div>
  );
}
