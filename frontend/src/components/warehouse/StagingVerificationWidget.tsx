import { useEffect, useState } from "react";

interface StagedItem {
  id: string;
  order_id: string;
  order_source: 'ground_pallet' | 'online_website';
  item_number: string;
  item_description: string;
  lot_number: string;
  quantity_ordered: number;
  quantity_staged: number;
  picking_ticket_id: string;
  staged_time: string;
  verified: boolean;
  verified_by?: string;
  verified_time?: string;
  picked_by: string;
  carrier?: string;
  customer_name?: string;
}

interface StagingQueueData {
  total_orders_staged: number;
  total_items_staged: number;
  pending_verification: number;
  completed_verification: number;
  stagedItems: StagedItem[];
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

export function StagingVerificationWidget() {
  const [data, setData] = useState<StagingQueueData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterVerified, setFilterVerified] = useState(false);
  const [filterSource, setFilterSource] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Connect to backend API: fetchStagingQueue()
    const mockData: StagingQueueData = {
      total_orders_staged: 12,
      total_items_staged: 47,
      pending_verification: 8,
      completed_verification: 4,
      stagedItems: [
        {
          id: '1',
          order_id: 'ORD-001842',
          order_source: 'online_website',
          item_number: 'ACC-SP5740',
          item_description: 'Sample Item A, 4L',
          lot_number: 'LOT-202603-SP5740-001',
          quantity_ordered: 12,
          quantity_staged: 12,
          picking_ticket_id: 'PKT-0842-001',
          staged_time: '2026-03-17T09:15:00Z',
          verified: false,
          picked_by: 'Mike Chen',
          customer_name: 'Customer Alpha',
        },
        {
          id: '2',
          order_id: 'ORD-001843',
          order_source: 'online_website',
          item_number: 'ACC-SP5741',
          item_description: 'Sample Item B, 4L',
          lot_number: 'LOT-202603-SP5741-001',
          quantity_ordered: 8,
          quantity_staged: 8,
          picking_ticket_id: 'PKT-0843-001',
          staged_time: '2026-03-17T09:22:00Z',
          verified: false,
          picked_by: 'Mike Chen',
          customer_name: 'Customer Alpha',
        },
        {
          id: '3',
          order_id: 'ORD-001844',
          order_source: 'ground_pallet',
          item_number: 'FG-5001',
          item_description: 'Genomic Assay Kit v3.2',
          lot_number: 'LOT-202603-FG5001-050',
          quantity_ordered: 24,
          quantity_staged: 24,
          picking_ticket_id: 'PKT-0844-001',
          staged_time: '2026-03-17T08:45:00Z',
          verified: true,
          verified_by: 'Sarah Martinez',
          verified_time: '2026-03-17T09:32:00Z',
          picked_by: 'James Rodriguez',
          carrier: 'Carrier A',
        },
        {
          id: '4',
          order_id: 'ORD-001845',
          order_source: 'ground_pallet',
          item_number: 'RM-2401',
          item_description: 'DNA Extraction Buffer, 1L',
          lot_number: 'LOT-202603-RM2401-012',
          quantity_ordered: 36,
          quantity_staged: 36,
          picking_ticket_id: 'PKT-0845-001',
          staged_time: '2026-03-17T10:02:00Z',
          verified: false,
          picked_by: 'James Rodriguez',
        },
        {
          id: '5',
          order_id: 'ORD-001846',
          order_source: 'online_website',
          item_number: 'RGT-3101',
          item_description: 'Array Platform Reagent Kit',
          lot_number: 'LOT-202603-RGT3101-008',
          quantity_ordered: 4,
          quantity_staged: 4,
          picking_ticket_id: 'PKT-0846-001',
          staged_time: '2026-03-17T10:15:00Z',
          verified: true,
          verified_by: 'David Park',
          verified_time: '2026-03-17T10:28:00Z',
          picked_by: 'Mike Chen',
          customer_name: 'Customer Gamma',
        },
        {
          id: '6',
          order_id: 'ORD-001847',
          order_source: 'ground_pallet',
          item_number: 'ACC-SP5740',
          item_description: 'Sample Item A, 4L',
          lot_number: 'LOT-202603-SP5740-001',
          quantity_ordered: 16,
          quantity_staged: 16,
          picking_ticket_id: 'PKT-0847-001',
          staged_time: '2026-03-17T10:30:00Z',
          verified: false,
          picked_by: 'James Rodriguez',
        },
        {
          id: '7',
          order_id: 'ORD-001848',
          order_source: 'ground_pallet',
          item_number: 'RM-2403',
          item_description: 'Isopropanol, 99.9%',
          lot_number: 'LOT-202603-RM2403-003',
          quantity_ordered: 24,
          quantity_staged: 24,
          picking_ticket_id: 'PKT-0848-001',
          staged_time: '2026-03-17T10:45:00Z',
          verified: false,
          picked_by: 'Mike Chen',
        },
        {
          id: '8',
          order_id: 'ORD-001849',
          order_source: 'online_website',
          item_number: 'ACC-SP5741',
          item_description: 'Sample Item B, 4L',
          lot_number: 'LOT-202602-SP5741-043',
          quantity_ordered: 4,
          quantity_staged: 4,
          picking_ticket_id: 'PKT-0849-001',
          staged_time: '2026-03-17T11:00:00Z',
          verified: true,
          verified_by: 'Sarah Martinez',
          verified_time: '2026-03-17T11:08:00Z',
          picked_by: 'James Rodriguez',
          customer_name: 'Customer Alpha',
        },
      ],
    };

    setData(mockData);
  }, []);

  if (error) {
    return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  }

  if (!data) {
    return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading staging queue…</div>;
  }

  const filteredItems = data.stagedItems.filter((item) => {
    const matchesVerified = !filterVerified || (filterVerified ? item.verified : !item.verified);
    const matchesSource = !filterSource || item.order_source === filterSource;
    return matchesVerified && matchesSource;
  });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
        <MetricCard label="Staged Orders" value={data.total_orders_staged.toString()} />
        <MetricCard label="Staged Items" value={data.total_items_staged.toString()} />
        <MetricCard label="Pending Verify" value={data.pending_verification.toString()} sub="Action Required" />
        <MetricCard label="Verified" value={data.completed_verification.toString()} />
      </div>

      {/* Filters */}
      <div style={{ marginBottom: "var(--space-md)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          onClick={() => setFilterVerified(!filterVerified)}
          style={{
            padding: "8px 12px",
            border: filterVerified ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: filterVerified ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: filterVerified ? "600" : "400",
          }}
        >
          Pending Only
        </button>
        <button
          onClick={() => setFilterSource(filterSource === 'ground_pallet' ? null : 'ground_pallet')}
          style={{
            padding: "8px 12px",
            border: filterSource === 'ground_pallet' ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: filterSource === 'ground_pallet' ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: filterSource === 'ground_pallet' ? "600" : "400",
          }}
        >
          Ground Pallets
        </button>
        <button
          onClick={() => setFilterSource(filterSource === 'online_website' ? null : 'online_website')}
          style={{
            padding: "8px 12px",
            border: filterSource === 'online_website' ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: filterSource === 'online_website' ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: filterSource === 'online_website' ? "600" : "400",
          }}
        >
          Online Orders
        </button>
      </div>

      {/* Staging Queue Table */}
      <div style={{ overflowX: "auto", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--color-bg-muted)", borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Order ID</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Source</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Item</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Qty</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Lot</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Picked By</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Staged</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr
                key={item.id}
                style={{
                  borderBottom: "1px solid var(--color-border-muted)",
                  backgroundColor: !item.verified ? "rgba(255, 193, 7, 0.05)" : "transparent",
                }}
              >
                <td style={{ padding: "12px", fontWeight: "600", color: "var(--color-primary)" }}>
                  {item.order_id}
                </td>
                <td style={{ padding: "12px", fontSize: "11px", fontWeight: "500", color: "var(--color-text-secondary)" }}>
                  {item.order_source === 'ground_pallet' ? '📦 Ground' : '🌐 Online'}
                </td>
                <td style={{ padding: "12px", color: "var(--color-text-primary)" }}>
                  <div style={{ fontWeight: "500" }}>{item.item_number}</div>
                  <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>{item.item_description}</div>
                </td>
                <td style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-primary)" }}>
                  {item.quantity_staged}
                </td>
                <td style={{ padding: "12px", fontFamily: "monospace", fontSize: "10px", color: "var(--color-text-secondary)" }}>
                  {item.lot_number}
                </td>
                <td style={{ padding: "12px", color: "var(--color-text-primary)", fontSize: "12px" }}>
                  {item.picked_by}
                </td>
                <td style={{ padding: "12px", color: "var(--color-text-secondary)", fontSize: "12px" }}>
                  {formatTime(item.staged_time)}
                </td>
                <td style={{ padding: "12px", textAlign: "center" }}>
                  {item.verified ? (
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "3px",
                      fontSize: "10px",
                      fontWeight: "600",
                      backgroundColor: "var(--color-success)",
                      color: "white",
                    }}>
                      ✓ VERIFIED
                    </span>
                  ) : (
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "3px",
                      fontSize: "10px",
                      fontWeight: "600",
                      backgroundColor: "var(--color-warning)",
                      color: "white",
                    }}>
                      ⏳ PENDING
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredItems.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--color-text-muted)" }}>
          No items in staging queue matching your filters.
        </div>
      )}

      <div style={{ marginTop: "var(--space-md)", padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
        <strong>00-STAGING Location:</strong> All items listed above are currently in the 00-STAGING location awaiting management verification before shipping.
      </div>
    </div>
  );
}
