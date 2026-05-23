import { useEffect, useState } from "react";
import { fetchCurrentInventoryPositions } from "../../api/client";

interface LocationInventory {
  item_number: string;
  item_description: string;
  lot_number: string;
  location: string;
  bin: string;
  quantity: number;
}

interface InventoryData {
  total_items_in_warehouse: number;
  by_location: Record<string, LocationInventory[]>;
  locations: Array<{ code: string; name: string }>;
}

const LOCATION_COLORS: Record<string, string> = {
  RECEIVING: "#FF6B6B",
  QUARANTINE: "#FFA500",
  MAIN: "#4CAF50",
  PICKING: "#2196F3",
  SHIPPING_DESK: "#FF9800",
  MANUFACTURING: "#9C27B0",
  DAMAGED: "#F44336",
};

export function VisualInventoryMap() {
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null);

  useEffect(() => {
    fetchCurrentInventoryPositions()
      .then((d) => setInventory(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  if (loading) return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading inventory map…</div>;
  if (!inventory) return null;

  return (
    <div>
      {/* Summary Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
          marginBottom: "var(--space-lg)",
        }}
      >
        <div style={{ padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px" }}>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
            Total Items in Warehouse
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--color-primary)" }}>
            {inventory.total_items_in_warehouse}
          </div>
        </div>
        <div style={{ padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px" }}>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
            Locations in Use
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--color-info)" }}>
            {Object.keys(inventory.by_location).length}
          </div>
        </div>
      </div>

      {/* Warehouse Visualization */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {inventory.locations.map((loc) => {
          const items = inventory.by_location[loc.code] || [];
          const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
          const color = LOCATION_COLORS[loc.code] || "#999";

          return (
            <div key={loc.code} style={{ borderRadius: "6px", overflow: "hidden" }}>
              {/* Location Header */}
              <div
                onClick={() =>
                  setExpandedLocation(expandedLocation === loc.code ? null : loc.code)
                }
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  backgroundColor: color,
                  color: "white",
                  cursor: "pointer",
                  borderRadius: expandedLocation === loc.code ? "6px 6px 0 0" : "6px",
                  userSelect: "none",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "14px", fontWeight: "600" }}>{loc.name}</div>
                  <div style={{ fontSize: "12px", opacity: 0.9 }}>
                    {items.length} {items.length === 1 ? "item" : "items"} • {totalQty} units
                  </div>
                </div>
                <div style={{ fontSize: "18px" }}>{expandedLocation === loc.code ? "▲" : "▼"}</div>
              </div>

              {/* Expanded Content */}
              {expandedLocation === loc.code && items.length > 0 && (
                <div style={{ backgroundColor: "var(--color-bg-muted)", borderRadius: "0 0 6px 6px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px" }}>
                    {items.map((item) => (
                      <div
                        key={`${item.item_number}-${item.lot_number}-${item.bin}`}
                        style={{
                          padding: "10px",
                          backgroundColor: "var(--color-bg-base)",
                          borderRadius: "4px",
                          borderLeft: `3px solid ${color}`,
                          fontSize: "12px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <div style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>
                            {item.item_number} ({item.quantity})
                          </div>
                          {item.bin && (
                            <div style={{ fontSize: "11px", color: "var(--color-text-light)", fontFamily: "monospace" }}>
                              {item.bin}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-light)", marginBottom: "2px" }}>
                          {item.item_description}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>
                          {item.lot_number}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty Location */}
              {expandedLocation === loc.code && items.length === 0 && (
                <div
                  style={{
                    padding: "20px",
                    backgroundColor: "var(--color-bg-muted)",
                    borderRadius: "0 0 6px 6px",
                    textAlign: "center",
                    color: "var(--color-text-light)",
                    fontSize: "12px",
                  }}
                >
                  No items currently in this location
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
