import { useEffect, useState } from "react";
import { fetchPickingTickets } from "../../api/client";

interface PickingTask {
  id: string;
  picking_ticket_id: string;
  order_id: string;
  item_number: string;
  item_description: string;
  location: string;
  lot_number: string;
  quantity_to_pick: number;
  quantity_picked: number;
  status: 'pending' | 'in-progress' | 'completed';
  assigned_to?: string;
  assigned_time?: string;
  scanned_timestamp?: string;
  scanner_id?: string;
}

interface PickingData {
  total_picking_tickets: number;
  total_items_to_pick: number;
  pending_picks: number;
  in_progress_picks: number;
  completed_picks: number;
  picking_tasks: PickingTask[];
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

export function PickingTicketsWidget() {
  const [data, setData] = useState<PickingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterOperator, setFilterOperator] = useState<string | null>(null);

  useEffect(() => {
    fetchPickingTickets()
      .then((response) => {
        setData(response);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  }

  if (!data) {
    return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading picking tickets…</div>;
  }

  const operators = [...new Set(data.picking_tasks.map((t) => t.assigned_to).filter(Boolean) as string[])].sort();

  const filteredTasks = data.picking_tasks.filter((task) => {
    const matchesStatus = !filterStatus || task.status === filterStatus;
    const matchesOperator = !filterOperator || task.assigned_to === filterOperator;
    return matchesStatus && matchesOperator;
  });

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ago`;
  };

  const getProgressPercent = (task: PickingTask) => {
    return Math.round((task.quantity_picked / task.quantity_to_pick) * 100);
  };

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-sm)", marginBottom: "var(--space-lg)" }}>
        <MetricCard label="Active Tickets" value={data.total_picking_tickets.toString()} />
        <MetricCard label="Total Items" value={data.total_items_to_pick.toString()} />
        <MetricCard label="Pending" value={data.pending_picks.toString()} />
        <MetricCard label="In Progress" value={data.in_progress_picks.toString()} />
        <MetricCard label="Completed" value={data.completed_picks.toString()} />
      </div>

      {/* Filters */}
      <div style={{ marginBottom: "var(--space-md)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
          All Status
        </button>
        {['pending', 'in-progress', 'completed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(filterStatus === status ? null : status)}
            style={{
              padding: "8px 12px",
              border: filterStatus === status ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
              backgroundColor: filterStatus === status ? "var(--color-primary-bg)" : "transparent",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: filterStatus === status ? "600" : "400",
            }}
          >
            {status === 'pending' && '⏳'}
            {status === 'in-progress' && '▶'}
            {status === 'completed' && '✓'}
            {' '}{status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Operator Filter */}
      <div style={{ marginBottom: "var(--space-lg)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary)", alignSelf: "center" }}>
          Operator:
        </span>
        <button
          onClick={() => setFilterOperator(null)}
          style={{
            padding: "6px 12px",
            border: filterOperator === null ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
            backgroundColor: filterOperator === null ? "var(--color-primary-bg)" : "transparent",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: filterOperator === null ? "600" : "400",
          }}
        >
          All
        </button>
        {operators.map((op) => (
          <button
            key={op}
            onClick={() => setFilterOperator(filterOperator === op ? null : op)}
            style={{
              padding: "6px 12px",
              border: filterOperator === op ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
              backgroundColor: filterOperator === op ? "var(--color-primary-bg)" : "transparent",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "11px",
              fontWeight: filterOperator === op ? "600" : "400",
            }}
          >
            {op}
          </button>
        ))}
      </div>

      {/* Picking Tickets Table */}
      <div style={{ overflowX: "auto", borderRadius: "4px", border: "1px solid var(--color-border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--color-bg-muted)", borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Ticket ID</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Order</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Item</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Location</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Qty</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Progress</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Operator</th>
              <th style={{ padding: "12px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>Scanner</th>
              <th style={{ padding: "12px", textAlign: "center", fontWeight: "600", color: "var(--color-text-secondary)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => {
              const progress = getProgressPercent(task);
              const statusColor = task.status === 'completed' ? 'var(--color-success)' : task.status === 'in-progress' ? 'var(--color-info)' : 'var(--color-warning)';

              return (
                <tr key={task.id} style={{ borderBottom: "1px solid var(--color-border-muted)" }}>
                  <td style={{ padding: "12px", fontWeight: "600", color: "var(--color-primary)" }}>
                    {task.picking_ticket_id}
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-secondary)", fontSize: "12px" }}>
                    {task.order_id}
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-primary)" }}>
                    <div style={{ fontWeight: "500", fontSize: "13px" }}>{task.item_number}</div>
                    <div style={{ fontSize: "10px", color: "var(--color-text-secondary)" }}>{task.item_description}</div>
                  </td>
                  <td style={{ padding: "12px", fontWeight: "600", color: "var(--color-primary)" }}>
                    {task.location}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center", color: "var(--color-text-primary)" }}>
                    {task.quantity_picked}/{task.quantity_to_pick}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div
                        style={{
                          width: "60px",
                          height: "6px",
                          backgroundColor: "var(--color-bg-muted)",
                          borderRadius: "3px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${progress}%`,
                            backgroundColor: statusColor,
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                        {progress}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-primary)", fontSize: "12px" }}>
                    {task.assigned_to}
                  </td>
                  <td style={{ padding: "12px", color: "var(--color-text-secondary)", fontSize: "11px" }}>
                    {task.scanner_id || '—'}
                  </td>
                  <td style={{ padding: "12px", textAlign: "center" }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "3px",
                        fontSize: "10px",
                        fontWeight: "600",
                        backgroundColor: statusColor,
                        color: "white",
                      }}
                    >
                      {task.status === 'in-progress' && '▶ IN PROGRESS'}
                      {task.status === 'completed' && '✓ DONE'}
                      {task.status === 'pending' && '⏳ PENDING'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredTasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--color-text-muted)" }}>
          No picking tickets found matching your filters.
        </div>
      )}

      <div style={{ marginTop: "var(--space-lg)", padding: "12px", backgroundColor: "var(--color-bg-muted)", borderRadius: "4px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
        <strong>Scanner Integration:</strong> Picking tickets are tracked via Datalogic Skorpio X5 scanners running PanaTracker GP. Items are picked to location 00-STAGING.
      </div>
    </div>
  );
}
