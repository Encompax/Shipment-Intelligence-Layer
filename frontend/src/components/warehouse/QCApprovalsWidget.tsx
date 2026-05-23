import { useEffect, useState } from "react";

interface QuarantineItem {
  id: string;
  item_number: string;
  item_description: string;
  batch_number: string;
  quantity: number;
  production_date: string;
  received_quarantine_date: string;
  inspected_status: 'pending' | 'passed' | 'failed' | 'rework';
  inspected_by?: string;
  inspected_date?: string;
  qc_verified_status: 'pending' | 'passed' | 'failed';
  qc_verified_by?: string;
  qc_verified_date?: string;
  notes?: string;
}

interface QCData {
  total_in_quarantine: number;
  awaiting_inspection: number;
  awaiting_qc_verification: number;
  approved_for_storage: number;
  failed_items: number;
  items: QuarantineItem[];
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

export function QCApprovalsWidget() {
  const [data, setData] = useState<QCData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Connect to backend API: fetchQCApprovals()
    const mockData: QCData = {
      total_in_quarantine: 12,
      awaiting_inspection: 3,
      awaiting_qc_verification: 4,
      approved_for_storage: 4,
      failed_items: 1,
      items: [
        {
          id: '1',
          item_number: 'ACC-SP5740',
          item_description: 'Sample Item A, 4L',
          batch_number: 'BATCH-202603-SP5740-001',
          quantity: 120,
          production_date: '2026-03-10',
          received_quarantine_date: '2026-03-11T08:00:00Z',
          inspected_status: 'passed',
          inspected_by: 'Maria Garcia',
          inspected_date: '2026-03-11T10:30:00Z',
          qc_verified_status: 'pending',
          notes: 'Visual inspection passed. Waiting QC verification.',
        },
        {
          id: '2',
          item_number: 'ACC-SP5741',
          item_description: 'Sample Item B, 4L',
          batch_number: 'BATCH-202603-SP5741-001',
          quantity: 100,
          production_date: '2026-03-10',
          received_quarantine_date: '2026-03-11T09:15:00Z',
          inspected_status: 'passed',
          inspected_by: 'Maria Garcia',
          inspected_date: '2026-03-11T11:00:00Z',
          qc_verified_status: 'pending',
          notes: 'Meets specification. QC testing in progress.',
        },
        {
          id: '3',
          item_number: 'FG-5001',
          item_description: 'Genomic Assay Kit v3.2',
          batch_number: 'BATCH-202603-FG5001-050',
          quantity: 200,
          production_date: '2026-03-09',
          received_quarantine_date: '2026-03-10T14:00:00Z',
          inspected_status: 'passed',
          inspected_by: 'David Park',
          inspected_date: '2026-03-10T16:15:00Z',
          qc_verified_status: 'passed',
          qc_verified_by: 'Dr. Jennifer Wu',
          qc_verified_date: '2026-03-11T09:45:00Z',
          notes: 'All tests passed. Approved for storage.',
        },
        {
          id: '4',
          item_number: 'RM-2401',
          item_description: 'DNA Extraction Buffer, 1L',
          batch_number: 'BATCH-202603-RM2401-012',
          quantity: 240,
          production_date: '2026-03-12',
          received_quarantine_date: '2026-03-12T10:30:00Z',
          inspected_status: 'passed',
          inspected_by: 'Maria Garcia',
          inspected_date: '2026-03-12T12:45:00Z',
          qc_verified_status: 'passed',
          qc_verified_by: 'Dr. Robert Chen',
          qc_verified_date: '2026-03-12T15:20:00Z',
          notes: 'Ready for storage.',
        },
        {
          id: '5',
          item_number: 'RGT-3101',
          item_description: 'Array Platform Reagent Kit',
          batch_number: 'BATCH-202603-RGT3101-008',
          quantity: 60,
          production_date: '2026-03-11',
          received_quarantine_date: '2026-03-12T08:00:00Z',
          inspected_status: 'pending',
          qc_verified_status: 'pending',
          notes: 'Awaiting inspection.',
        },
        {
          id: '6',
          item_number: 'RM-2403',
          item_description: 'Isopropanol, 99.9%',
          batch_number: 'BATCH-202603-RM2403-003',
          quantity: 500,
          production_date: '2026-03-13',
          received_quarantine_date: '2026-03-13T11:00:00Z',
          inspected_status: 'pending',
          qc_verified_status: 'pending',
          notes: 'Just received. Awaiting visual inspection.',
        },
        {
          id: '7',
          item_number: 'PKG-4001',
          item_description: 'Packaging - Shipper Box 12x12',
          batch_number: 'BATCH-202603-PKG4001-200',
          quantity: 5000,
          production_date: '2026-03-12',
          received_quarantine_date: '2026-03-12T16:00:00Z',
          inspected_status: 'passed',
          inspected_by: 'David Park',
          inspected_date: '2026-03-13T08:30:00Z',
          qc_verified_status: 'pending',
          notes: 'Inspection complete. Pending QC count verification.',
        },
        {
          id: '8',
          item_number: 'STD-6001',
          item_description: 'Reference Standard - DNA 100bp',
          batch_number: 'BATCH-202603-STD6001-500',
          quantity: 8,
          production_date: '2026-03-10',
          received_quarantine_date: '2026-03-10T13:00:00Z',
          inspected_status: 'failed',
          inspected_by: 'Maria Garcia',
          inspected_date: '2026-03-10T14:30:00Z',
          qc_verified_status: 'failed',
          notes: 'Failed visual inspection - cosmetic damage on vials. Returned to manufacturing.',
        },
        {
          id: '9',
          item_number: 'ACC-SP5740',
          item_description: 'Sample Item A, 4L',
          batch_number: 'BATCH-202603-SP5740-002',
          quantity: 100,
          production_date: '2026-03-13',
          received_quarantine_date: '2026-03-13T15:30:00Z',
          inspected_status: 'pending',
          qc_verified_status: 'pending',
          notes: 'Awaiting inspection.',
        },
        {
          id: '10',
          item_number: 'FG-5002',
          item_description: 'Genomic Assay Kit v3.1 (Legacy)',
          batch_number: 'BATCH-202602-FG5002-045',
          quantity: 72,
          production_date: '2026-02-28',
          received_quarantine_date: '2026-03-01T09:00:00Z',
          inspected_status: 'passed',
          inspected_by: 'David Park',
          inspected_date: '2026-03-01T11:15:00Z',
          qc_verified_status: 'passed',
          qc_verified_by: 'Dr. Jennifer Wu',
          qc_verified_date: '2026-03-01T15:00:00Z',
          notes: 'Approved for storage.',
        },
      ],
    };

    setData(mockData);
  }, []);

  if (error) {
    return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  }

  if (!data) {
    return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading QC approvals…</div>;
  }

  const filteredItems = data.items.filter((item) => {
    if (!filterStatus) return true;
    if (filterStatus === 'awaiting-inspection') return item.inspected_status === 'pending';
    if (filterStatus === 'awaiting-qc') return item.inspected_status === 'passed' && item.qc_verified_status === 'pending';
    if (filterStatus === 'approved') return item.qc_verified_status === 'passed';
    if (filterStatus === 'failed') return item.inspected_status === 'failed' || item.qc_verified_status === 'failed';
    return true;
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
        <MetricCard label="In Quarantine" value={data.total_in_quarantine.toString()} sub="Total items" />
        <MetricCard label="Await Inspection" value={data.awaiting_inspection.toString()} sub="Priority Action" />
        <MetricCard label="Await QC Ver." value={data.awaiting_qc_verification.toString()} sub="Next Step" />
        <MetricCard label="Approved" value={data.approved_for_storage.toString()} />
        <MetricCard label="Failed" value={data.failed_items.toString()} sub="Returned" />
      </div>

      {/* Status Filter */}
      <div style={{ marginBottom: "var(--space-lg)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          onClick={() => setFilterStatus(null)}
          style={{
            padding: "8px 12px",
            border: filterStatus === null ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: filterStatus === null ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: filterStatus === null ? "600" : "400",
          }}
        >
          All Items
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'awaiting-inspection' ? null : 'awaiting-inspection')}
          style={{
            padding: "8px 12px",
            border: filterStatus === 'awaiting-inspection' ? "2px solid var(--color-error)" : "1px solid var(--color-border)",
            backgroundColor: filterStatus === 'awaiting-inspection' ? "rgba(220, 38, 38, 0.1)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: filterStatus === 'awaiting-inspection' ? "600" : "400",
          }}
        >
          🔴 Await Inspection ({data.awaiting_inspection})
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'awaiting-qc' ? null : 'awaiting-qc')}
          style={{
            padding: "8px 12px",
            border: filterStatus === 'awaiting-qc' ? "2px solid var(--color-warning)" : "1px solid var(--color-border)",
            backgroundColor: filterStatus === 'awaiting-qc' ? "rgba(217, 119, 6, 0.1)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: filterStatus === 'awaiting-qc' ? "600" : "400",
          }}
        >
          🟡 Await QC Verify ({data.awaiting_qc_verification})
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'approved' ? null : 'approved')}
          style={{
            padding: "8px 12px",
            border: filterStatus === 'approved' ? "2px solid var(--color-success)" : "1px solid var(--color-border)",
            backgroundColor: filterStatus === 'approved' ? "rgba(22, 163, 74, 0.1)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: filterStatus === 'approved' ? "600" : "400",
          }}
        >
          ✅ Approved ({data.approved_for_storage})
        </button>
        <button
          onClick={() => setFilterStatus(filterStatus === 'failed' ? null : 'failed')}
          style={{
            padding: "8px 12px",
            border: filterStatus === 'failed' ? "2px solid var(--color-error)" : "1px solid var(--color-border)",
            backgroundColor: filterStatus === 'failed' ? "rgba(220, 38, 38, 0.1)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: filterStatus === 'failed' ? "600" : "400",
          }}
        >
          ❌ Failed ({data.failed_items})
        </button>
      </div>

      {/* QC Approvals Table */}
      <div style={{ overflowX: "auto", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--color-bg-muted)", borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Item</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Batch</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Qty</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Inspection</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>By</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>QC Verified</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>By</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              let overallStatus = 'pending';
              let statusColor = 'var(--color-warning)';
              let statusIcon = '⏳';

              if (item.inspected_status === 'failed') {
                overallStatus = 'failed';
                statusColor = 'var(--color-error)';
                statusIcon = '❌';
              } else if (item.qc_verified_status === 'failed') {
                overallStatus = 'failed';
                statusColor = 'var(--color-error)';
                statusIcon = '❌';
              } else if (item.qc_verified_status === 'passed') {
                overallStatus = 'approved';
                statusColor = 'var(--color-success)';
                statusIcon = '✅';
              } else if (item.inspected_status === 'pending') {
                overallStatus = 'await-inspection';
                statusColor = 'var(--color-error)';
                statusIcon = '🔴';
              } else if (item.qc_verified_status === 'pending') {
                overallStatus = 'await-qc';
                statusColor = 'var(--color-warning)';
                statusIcon = '🟡';
              }

              return (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border-muted)" }}>
                  <td style={{ padding: "12px", fontWeight: "500", color: "var(--color-text-primary)" }}>
                    <div style={{ fontWeight: "600" }}>{item.item_number}</div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>{item.item_description}</div>
                  </td>
                  <td style={{ padding: "12px", fontFamily: "monospace", fontSize: "10px", color: "var(--color-text-secondary)" }}>
                    {item.batch_number}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center", color: "var(--color-text-primary)" }}>
                    {item.quantity}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {item.inspected_status === 'pending' && (
                      <span style={{ padding: "4px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", backgroundColor: "var(--color-warning)", color: "white" }}>
                        ⏳ PENDING
                      </span>
                    )}
                    {item.inspected_status === 'passed' && (
                      <span style={{ padding: "4px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", backgroundColor: "var(--color-success)", color: "white" }}>
                        ✓ PASSED
                      </span>
                    )}
                    {item.inspected_status === 'failed' && (
                      <span style={{ padding: "4px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", backgroundColor: "var(--color-error)", color: "white" }}>
                        ✗ FAILED
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-secondary)", fontSize: "11px" }}>
                    {item.inspected_by || '—'}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    {item.qc_verified_status === 'pending' && (
                      <span style={{ padding: "4px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", backgroundColor: "var(--color-warning)", color: "white" }}>
                        ⏳ PENDING
                      </span>
                    )}
                    {item.qc_verified_status === 'passed' && (
                      <span style={{ padding: "4px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", backgroundColor: "var(--color-success)", color: "white" }}>
                        ✓ PASSED
                      </span>
                    )}
                    {item.qc_verified_status === 'failed' && (
                      <span style={{ padding: "4px 8px", borderRadius: "3px", fontSize: "10px", fontWeight: "600", backgroundColor: "var(--color-error)", color: "white" }}>
                        ✗ FAILED
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-secondary)", fontSize: "11px" }}>
                    {item.qc_verified_by || '—'}
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-secondary)", fontSize: "11px" }}>
                    {item.notes}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredItems.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--color-text-muted)" }}>
          No items found matching the selected filter.
        </div>
      )}

      <div style={{ marginTop: "var(--space-lg)", padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
        <strong>Quarantine Workflow:</strong> Items enter quarantine from production floor. Step 1: "Inspected" approval required. Step 2: "QC-Verified" approval required. Once both approvals pass, items are released for put-away to inventory storage.
      </div>
    </div>
  );
}
