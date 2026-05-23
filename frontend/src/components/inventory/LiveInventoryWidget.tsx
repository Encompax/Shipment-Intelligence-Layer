import { useEffect, useState } from "react";

interface InventoryItem {
  id: string;
  item_number: string;
  location: string;
  lot_number: string;
  quantity: number;
  unit: string;
  last_updated: string;
}

export function LiveInventoryWidget() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const mockInventory: InventoryItem[] = [
      {
        id: "1",
        item_number: "SKU-4521-A",
        location: "Bin A1-03",
        lot_number: "LOT-2026-0342",
        quantity: 542,
        unit: "units",
        last_updated: "2026-03-17T14:22:00Z",
      },
      {
        id: "2",
        item_number: "SKU-4521-B",
        location: "Bin A1-04",
        lot_number: "LOT-2026-0341",
        quantity: 389,
        unit: "units",
        last_updated: "2026-03-17T14:18:00Z",
      },
      {
        id: "3",
        item_number: "SKU-5834-C",
        location: "Bin B2-01",
        lot_number: "LOT-2026-0240",
        quantity: 1250,
        unit: "units",
        last_updated: "2026-03-17T14:25:00Z",
      },
      {
        id: "4",
        item_number: "SKU-5834-D",
        location: "Bin B2-02",
        lot_number: "LOT-2026-0239",
        quantity: 867,
        unit: "units",
        last_updated: "2026-03-17T13:55:00Z",
      },
      {
        id: "5",
        item_number: "SKU-1923-E",
        location: "Bin C1-15",
        lot_number: "LOT-2026-0142",
        quantity: 634,
        unit: "units",
        last_updated: "2026-03-17T14:20:00Z",
      },
      {
        id: "6",
        item_number: "SKU-1923-F",
        location: "Bin C1-16",
        lot_number: "LOT-2026-0140",
        quantity: 445,
        unit: "units",
        last_updated: "2026-03-17T14:10:00Z",
      },
      {
        id: "7",
        item_number: "SKU-7652-G",
        location: "Bin A2-08",
        lot_number: "LOT-2026-0425",
        quantity: 2100,
        unit: "units",
        last_updated: "2026-03-17T14:15:00Z",
      },
      {
        id: "8",
        item_number: "SKU-7652-H",
        location: "Bin A2-09",
        lot_number: "LOT-2026-0423",
        quantity: 1876,
        unit: "units",
        last_updated: "2026-03-17T14:05:00Z",
      },
    ];
    setInventory(mockInventory);
  }, []);

  const filteredInventory = inventory.filter((item) =>
    item.item_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.lot_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  if (error) return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;

  return (
    <div>
      <div style={{ marginBottom: "var(--space-md)" }}>
        <input
          type="text"
          placeholder="Search by item number, location, or lot number..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%",
            padding: "10px",
            border: "1px solid var(--color-border)",
            borderRadius: "4px",
            fontSize: "var(--font-size-sm)",
          }}
        />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "var(--font-size-sm)",
        }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ padding: "10px", textAlign: "left", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)" }}>Item Number</th>
              <th style={{ padding: "10px", textAlign: "left", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)" }}>Location</th>
              <th style={{ padding: "10px", textAlign: "left", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)" }}>Lot Number</th>
              <th style={{ padding: "10px", textAlign: "right", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)" }}>Quantity</th>
              <th style={{ padding: "10px", textAlign: "left", fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-secondary)" }}>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((item) => (
              <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border-light)", }}>
                <td style={{ padding: "10px", color: "var(--color-text-primary)", fontWeight: "500" }}>{item.item_number}</td>
                <td style={{ padding: "10px", color: "var(--color-text-secondary)" }}>{item.location}</td>
                <td style={{ padding: "10px", color: "var(--color-text-secondary)" }}>{item.lot_number}</td>
                <td style={{ padding: "10px", textAlign: "right", color: "var(--color-text-primary)", fontWeight: "500" }}>
                  {item.quantity.toLocaleString()} {item.unit}
                </td>
                <td style={{ padding: "10px", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>{formatTime(item.last_updated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredInventory.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--color-text-muted)" }}>
          No inventory items found matching your search.
        </div>
      )}
    </div>
  );
}
