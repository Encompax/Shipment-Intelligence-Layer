import { useState, useEffect } from "react";
import { fetchCycleCountDepartments, fetchCycleCountTransactions, fetchCycleCountSummary } from "../../api/client";

interface Department {
  department: string;
  department_name: string;
  weeks_available: number[];
  transactions_count: number;
}

interface CycleCountTransaction {
  date_time: string;
  stock_count: string;
  status: "Completed" | "In Progress";
  section: string;
  user_name: string;
  item_number: string;
  item_description: string;
  bin: string;
  lot: string;
  unit_of_measure: string;
  previous_qty: number;
  classified_qty: number;
  submitted_qty: number;
  stock_count_action: string;
  stock_count_exception?: string;
  reason?: string;
}

interface WeekTransactionsResponse {
  department: string;
  week: number;
  stock_count: string;
  transactions: CycleCountTransaction[];
  summary: {
    total_items: number;
    completed: number;
    in_progress: number;
    accuracy_variance_count: number;
  };
}

interface DepartmentSummary {
  department: string;
  department_name: string;
  total_transactions: number;
  completed_count: number;
  in_progress_count: number;
  completion_rate: string;
  items_with_variance: number;
  average_variance: string;
}

export function CycleCountTransactions() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [transactionData, setTransactionData] = useState<WeekTransactionsResponse | null>(null);
  const [deptSummary, setDeptSummary] = useState<DepartmentSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load departments on mount
  useEffect(() => {
    const loadDepartments = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCycleCountDepartments();
        setDepartments(data);
        if (data.length > 0) {
          setSelectedDept(data[0].department);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    };
    loadDepartments();
  }, []);

  // Load summary when department changes
  useEffect(() => {
    if (!selectedDept) return;
    const loadSummary = async () => {
      setError(null);
      try {
        const data = await fetchCycleCountSummary(selectedDept);
        setDeptSummary(data);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    loadSummary();
  }, [selectedDept]);

  // Load transactions when department or week changes
  useEffect(() => {
    if (!selectedDept || selectedWeek === null) return;
    const loadTransactions = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCycleCountTransactions(selectedDept, selectedWeek);
        setTransactionData(data);
      } catch (e) {
        setError((e as Error).message);
        setTransactionData(null);
      } finally {
        setLoading(false);
      }
    };
    loadTransactions();
  }, [selectedDept, selectedWeek]);

  const currentDept = departments.find((d) => d.department === selectedDept);
  const availableWeeks = currentDept?.weeks_available || [];

  // Auto-select first week when department changes
  useEffect(() => {
    if (availableWeeks.length > 0 && selectedWeek === null) {
      setSelectedWeek(availableWeeks[0]);
    }
  }, [availableWeeks, selectedDept]);

  return (
    <div>
      {/* Department Tabs */}
      <div style={{ marginBottom: "var(--space-lg)", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--color-border)", paddingBottom: "8px" }}>
          {departments.map((dept) => (
            <button
              key={dept.department}
              onClick={() => {
                setSelectedDept(dept.department);
                setSelectedWeek(null);
                setTransactionData(null);
              }}
              style={{
                padding: "8px 16px",
                border: "none",
                backgroundColor: selectedDept === dept.department ? "var(--color-primary)" : "transparent",
                color: selectedDept === dept.department ? "white" : "var(--color-text-primary)",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: selectedDept === dept.department ? "600" : "500",
                whiteSpace: "nowrap",
              }}
            >
              {dept.department} {dept.weeks_available.length > 0 && `(${dept.transactions_count})`}
            </button>
          ))}
        </div>
      </div>

      {/* Department Summary Card */}
      {deptSummary && (
        <div
          style={{
            marginBottom: "var(--space-lg)",
            padding: "var(--space-md)",
            backgroundColor: "var(--color-bg-muted)",
            borderRadius: "6px",
            border: "1px solid var(--color-border)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "var(--space-md)",
          }}
        >
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
              Department
            </div>
            <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-text-primary)" }}>
              {deptSummary.department_name}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
              Completion Rate
            </div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--color-success)" }}>
              {deptSummary.completion_rate}%
            </div>
            <div style={{ fontSize: "10px", color: "var(--color-text-light)" }}>
              {deptSummary.completed_count} of {deptSummary.total_transactions}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
              Items with Variance
            </div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--color-warning)" }}>
              {deptSummary.items_with_variance}
            </div>
            <div style={{ fontSize: "10px", color: "var(--color-text-light)" }}>
              Avg variance: {deptSummary.average_variance} units
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "4px" }}>
              In Progress
            </div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--color-info)" }}>
              {deptSummary.in_progress_count}
            </div>
            <div style={{ fontSize: "10px", color: "var(--color-text-light)" }}>
              Week counts pending
            </div>
          </div>
        </div>
      )}

      {/* Week Selector */}
      {selectedDept && availableWeeks.length > 0 && (
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
            Select Week
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {availableWeeks.map((week) => (
              <button
                key={week}
                onClick={() => setSelectedWeek(week)}
                style={{
                  padding: "8px 16px",
                  border: selectedWeek === week ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                  backgroundColor: selectedWeek === week ? "rgba(0, 123, 255, 0.1)" : "var(--color-bg-muted)",
                  color: "var(--color-text-primary)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: selectedWeek === week ? "600" : "500",
                }}
              >
                Week {week}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{ marginBottom: "var(--space-md)", padding: "12px", backgroundColor: "rgba(244, 67, 54, 0.1)", borderRadius: "4px", color: "var(--color-error)", fontSize: "12px" }}>
          ⚠ {error}
        </div>
      )}

      {/* Transaction Table */}
      {transactionData && (
        <div>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text-primary)", marginBottom: "12px" }}>
            {transactionData.stock_count} - {transactionData.transactions.length} Items Counted
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
                backgroundColor: "var(--color-bg-primary)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <thead>
                <tr style={{ backgroundColor: "var(--color-bg-muted)", borderBottom: "2px solid var(--color-border)" }}>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                    Item #
                  </th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                    Description
                  </th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                    User
                  </th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                    DateTime
                  </th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                    Location / Bin
                  </th>
                  <th style={{ padding: "10px", textAlign: "right", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                    Qty Counted
                  </th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                    Lot #
                  </th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: "600", color: "var(--color-text-secondary)" }}>
                    Status / Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactionData.transactions.map((tx, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: "1px solid var(--color-border-light)",
                      backgroundColor: idx % 2 === 0 ? "var(--color-bg-primary)" : "rgba(0, 0, 0, 0.02)",
                    }}
                  >
                    <td style={{ padding: "10px", color: "var(--color-text-primary)", fontWeight: "500" }}>
                      {tx.item_number}
                    </td>
                    <td style={{ padding: "10px", color: "var(--color-text-primary)", fontSize: "11px" }}>
                      {tx.item_description || "—"}
                    </td>
                    <td style={{ padding: "10px", color: "var(--color-text-primary)", fontFamily: "monospace", fontSize: "11px" }}>
                      {tx.user_name}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        color: "var(--color-text-light)",
                        fontSize: "11px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tx.date_time}
                    </td>
                    <td style={{ padding: "10px", color: "var(--color-text-primary)", fontFamily: "monospace", fontSize: "11px" }}>
                      {tx.bin || "—"}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        textAlign: "right",
                        color: "var(--color-text-primary)",
                        fontWeight: "600",
                      }}
                    >
                      {tx.classified_qty}
                    </td>
                    <td style={{ padding: "10px", color: "var(--color-text-light)", fontFamily: "monospace", fontSize: "11px" }}>
                      {tx.lot || "—"}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <div style={{ display: "flex", gap: "4px", flexDirection: "column" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "3px",
                            fontSize: "10px",
                            fontWeight: "600",
                            backgroundColor:
                              tx.status === "Completed"
                                ? "rgba(76, 175, 80, 0.2)"
                                : "rgba(255, 193, 7, 0.2)",
                            color:
                              tx.status === "Completed"
                                ? "var(--color-success)"
                                : "var(--color-warning)",
                            display: "inline-block",
                            width: "fit-content",
                          }}
                        >
                          {tx.status}
                        </span>
                        {tx.stock_count_exception && (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "3px",
                              fontSize: "10px",
                              fontWeight: "600",
                              backgroundColor: "rgba(244, 67, 54, 0.2)",
                              color: "var(--color-error)",
                              display: "inline-block",
                              width: "fit-content",
                            }}
                          >
                            ⚠ {tx.stock_count_exception}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-light)", fontSize: "12px" }}>
          Loading transactions…
        </div>
      )}

      {!loading && !transactionData && !error && selectedWeek !== null && (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--color-text-muted)", fontSize: "12px" }}>
          No transactions found for this week and department
        </div>
      )}
    </div>
  );
}
