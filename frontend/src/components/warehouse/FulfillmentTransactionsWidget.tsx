import React, { useEffect, useState } from "react";
import { fetchFulfillmentOrders, recordPickingTransaction, recordVerificationTransaction } from "../../api/client";

interface LineItemTransaction {
  line_number: number;
  item_number: string;
  item_description: string;
  quantity_requested: number;
  quantity_allocated: number;
  picking?: {
    quantity_picked: number;
    lot_number?: string;
    picked_by: string;
    picked_timestamp: string;
    status: string;
    notes?: string;
  };
  verification?: {
    quantity_verified: number;
    verified_by: string;
    verified_timestamp: string;
    status: string;
  };
}

interface FulfillmentOrder {
  sales_order_number: string;
  created_date: string;
  customer: string;
  business_unit: string;
  destination: string;
  backorder_reference?: string;
  backorder_note?: string;
  line_items: LineItemTransaction[];
}

type FilterStatus = "all" | "pending" | "picked" | "verified";

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

function getLineItemStatus(item: LineItemTransaction): "pending" | "picked" | "verified" {
  if (item.verification?.status === "verified") return "verified";
  if (item.picking?.status === "picked" && !item.verification) return "picked";
  return "pending";
}

function statusColor(status: "pending" | "picked" | "verified"): string {
  if (status === "verified") return "var(--color-success)";
  if (status === "picked") return "var(--color-warning)";
  return "var(--color-text-light)";
}

export function FulfillmentTransactionsWidget() {
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  const load = () => {
    setLoading(true);
    const params: Parameters<typeof fetchFulfillmentOrders>[0] = {};
    if (filterStatus !== "all") params.status = filterStatus;
    
    fetchFulfillmentOrders(params)
      .then((d) => setOrders(d.orders ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filterStatus]);

  if (error) return <div style={{ color: "var(--color-error)", fontSize: "var(--font-size-sm)" }}>⚠ {error}</div>;
  if (loading) return <div style={{ color: "var(--color-text-light)", fontSize: "var(--font-size-sm)" }}>Loading orders…</div>;

  return (
    <div>
      <div style={{ marginBottom: "var(--space-md)", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {(["all", "pending", "picked", "verified"] as FilterStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            style={{
              padding: "8px 14px",
              border:
                filterStatus === status
                  ? "2px solid var(--color-primary)"
                  : "1px solid var(--color-border)",
              backgroundColor:
                filterStatus === status
                  ? "var(--color-primary-bg)"
                  : "transparent",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: filterStatus === status ? "600" : "400",
              textTransform: "capitalize",
            }}
          >
            {status === "all" ? "All Orders" : status === "verified" ? "✓ Verified" : status === "picked" ? "⚙ Picked" : "⧖ Pending"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {orders.map((order) => (
          <div
            key={order.sales_order_number}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              padding: "16px",
              backgroundColor: "var(--color-bg-base)",
            }}
          >
            {/* Order Header */}
            <div style={{ marginBottom: "12px", paddingBottom: "12px", borderBottom: "1px solid var(--color-border-light)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "6px" }}>
                <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--color-text-primary)" }}>
                  {order.sales_order_number}
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-text-light)" }}>
                  {formatDate(order.created_date)}
                </div>
              </div>
              <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                {order.customer} • {order.destination}
              </div>
              {order.backorder_note && (
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "11px",
                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                    padding: "6px 8px",
                    borderRadius: "3px",
                    color: "var(--color-warning)",
                  }}
                >
                  📦 {order.backorder_note}
                </div>
              )}
            </div>

            {/* Line Items */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {order.line_items.map((item) => {
                const status = getLineItemStatus(item);
                const isPicked = item.picking && item.picking.status === "picked";
                const isVerified = item.verification && item.verification.status === "verified";

                return (
                  <div
                    key={`${order.sales_order_number}-${item.line_number}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto auto",
                      gap: "12px",
                      alignItems: "center",
                      padding: "10px",
                      backgroundColor: "var(--color-bg-muted)",
                      borderRadius: "4px",
                      fontSize: "13px",
                    }}
                  >
                    {/* Item Info */}
                    <div style={{ minWidth: "200px" }}>
                      <div style={{ fontWeight: "500", color: "var(--color-text-primary)", marginBottom: "2px" }}>
                        {item.item_number}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-light)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {item.item_description}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                        Req: {item.quantity_requested}
                        {item.quantity_allocated !== item.quantity_requested && ` / Alloc: ${item.quantity_allocated}`}
                      </div>
                    </div>

                    {/* Picking Status */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", minWidth: "200px" }}>
                      {isPicked ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 10px",
                            backgroundColor: "rgba(34, 197, 94, 0.1)",
                            borderRadius: "3px",
                          }}
                        >
                          <span style={{ color: "var(--color-success)", fontWeight: "600", fontSize: "14px" }}>✓</span>
                          <div>
                            <div style={{ fontWeight: "500", color: "var(--color-success)" }}>
                              {item.picking!.quantity_picked}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-light)" }}>
                              {item.picking!.picked_by}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-light)" }}>
                              {formatTime(item.picking!.picked_timestamp)}
                            </div>
                            {item.picking!.lot_number && (
                              <div style={{ fontSize: "10px", color: "var(--color-text-light)", marginTop: "2px", fontFamily: "monospace" }}>
                                {item.picking!.lot_number}
                              </div>
                            )}
                            {item.picking!.notes && (
                              <div style={{ fontSize: "10px", color: "var(--color-warning)", marginTop: "2px" }}>
                                {item.picking!.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: "12px", color: "var(--color-text-light)" }}>
                          ⧖ Pending Pick
                        </div>
                      )}
                    </div>

                    {/* Verification Status */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", minWidth: "200px" }}>
                      {isVerified ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 10px",
                            backgroundColor: "rgba(34, 197, 94, 0.1)",
                            borderRadius: "3px",
                          }}
                        >
                          <span style={{ color: "var(--color-success)", fontWeight: "600", fontSize: "14px" }}>✓</span>
                          <div>
                            <div style={{ fontWeight: "500", color: "var(--color-success)" }}>
                              {item.verification!.quantity_verified}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-light)" }}>
                              {item.verification!.verified_by}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-light)" }}>
                              {formatTime(item.verification!.verified_timestamp)}
                            </div>
                          </div>
                        </div>
                      ) : isPicked ? (
                        <div style={{ fontSize: "12px", color: "var(--color-warning)" }}>
                          ⧖ Awaiting Verify
                        </div>
                      ) : (
                        <div style={{ fontSize: "12px", color: "var(--color-text-light)" }}>—</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {orders.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          No orders in this view.
        </div>
      )}
    </div>
  );
}
