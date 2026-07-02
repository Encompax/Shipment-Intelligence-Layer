import React, { useEffect, useMemo, useState } from "react";
import { fetchSilOperationsPanel } from "../api/client";

type OperationArea = "sourcing" | "planning" | "production" | "supplyChain";

type OperationMetric = {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warning" | "risk";
};

type OperationWorkItem = {
  id: string;
  label: string;
  status: string;
  owner?: string;
  detail: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

type OperationSignal = {
  signalType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidenceScore: number;
  description: string;
  recommendedActions?: Array<{ description: string; priority: string }>;
};

type OperationPanelData = {
  area: OperationArea;
  eyebrow: string;
  title: string;
  summary: string;
  phaseStatus: "CONNECTED";
  metrics: OperationMetric[];
  workItems: OperationWorkItem[];
  governanceSignals: OperationSignal[];
  governanceTriggers: string[];
  recommendedActions: string[];
  evidence: string[];
};

const fallbackByArea: Record<OperationArea, OperationPanelData> = {
  sourcing: {
    area: "sourcing",
    eyebrow: "Carrier Network",
    title: "Sourcing Control",
    summary: "Carrier eligibility, tender visibility, and sourcing risk will appear here when the SIL API is available.",
    phaseStatus: "CONNECTED",
    metrics: [],
    workItems: [],
    governanceSignals: [],
    governanceTriggers: ["Carrier credit review", "Tender visibility", "Bid route to Encompax"],
    recommendedActions: ["Start the SIL backend to load live sourcing context."],
    evidence: ["This panel is wired for backend data."],
  },
  planning: {
    area: "planning",
    eyebrow: "Lane Plan",
    title: "Planning Control",
    summary: "Load coverage, lane volatility, market rates, and timing pressure will appear here when the SIL API is available.",
    phaseStatus: "CONNECTED",
    metrics: [],
    workItems: [],
    governanceSignals: [],
    governanceTriggers: ["Lane rate exception", "Coverage gap", "Timing risk"],
    recommendedActions: ["Start the SIL backend to load live planning context."],
    evidence: ["This panel is wired for backend data."],
  },
  production: {
    area: "production",
    eyebrow: "Execution",
    title: "Production Control",
    summary: "Appointments, shipment state, dispatch readiness, and document packets will appear here when the SIL API is available.",
    phaseStatus: "CONNECTED",
    metrics: [],
    workItems: [],
    governanceSignals: [],
    governanceTriggers: ["Dispatch hold", "Appointment breach", "Missing POD packet"],
    recommendedActions: ["Start the SIL backend to load live execution context."],
    evidence: ["This panel is wired for backend data."],
  },
  supplyChain: {
    area: "supplyChain",
    eyebrow: "Network Control",
    title: "Supply Chain Optimization",
    summary: "Cross-functional network pressure across loads, shipments, lanes, and governance memory will appear here when the SIL API is available.",
    phaseStatus: "CONNECTED",
    metrics: [],
    workItems: [],
    governanceSignals: [],
    governanceTriggers: ["High-severity signal", "Network pressure", "Customer commitment risk"],
    recommendedActions: ["Start the SIL backend to load live supply chain context."],
    evidence: ["This panel is wired for backend data."],
  },
};

const severityClass = (severity?: string) => (severity ? severity.toLowerCase() : "medium");

type Props = {
  area: OperationArea;
};

const OperationsPhasePanel: React.FC<Props> = ({ area }) => {
  const [panel, setPanel] = useState<OperationPanelData>(fallbackByArea[area]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetchSilOperationsPanel(area)
      .then((data) => {
        if (!mounted) return;
        setPanel(data.panel ?? fallbackByArea[area]);
      })
      .catch((err) => {
        if (!mounted) return;
        setPanel(fallbackByArea[area]);
        setError(err instanceof Error ? err.message : "SIL operations API unavailable");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [area]);

  const primarySignal = useMemo(() => panel.governanceSignals[0], [panel.governanceSignals]);

  return (
    <div className="ops-phase-panel">
      <header className="ops-phase-header">
        <div>
          <span className="ops-kicker">{panel.eyebrow}</span>
          <h2>{panel.title}</h2>
          <p>{panel.summary}</p>
        </div>
        <span className="ops-status-pill">{loading ? "Loading" : panel.phaseStatus}</span>
      </header>

      {error ? <div className="ops-inline-alert">{error}</div> : null}

      <section className="ops-metric-grid" aria-label={`${panel.title} metrics`}>
        {panel.metrics.length ? (
          panel.metrics.map((metric) => (
            <div className={`ops-metric-card ${metric.tone ?? "neutral"}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))
        ) : (
          <div className="ops-empty-card">No live metrics loaded yet.</div>
        )}
      </section>

      <section className="ops-two-column">
        <div className="ops-card">
          <div className="ops-card-heading">
            <span>Work Queue</span>
            <strong>{panel.workItems.length}</strong>
          </div>
          <div className="ops-work-list">
            {panel.workItems.length ? (
              panel.workItems.map((item) => (
                <article className="ops-work-item" key={item.id}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <span className={`ops-severity ${severityClass(item.severity)}`}>{item.status}</span>
                </article>
              ))
            ) : (
              <p className="ops-muted">No open work items for this panel.</p>
            )}
          </div>
        </div>

        <div className="ops-card">
          <div className="ops-card-heading">
            <span>Governance Signal</span>
            <strong>{panel.governanceSignals.length}</strong>
          </div>
          {primarySignal ? (
            <article className="ops-signal-card">
              <span className={`ops-severity ${severityClass(primarySignal.severity)}`}>{primarySignal.severity}</span>
              <h3>{primarySignal.signalType}</h3>
              <p>{primarySignal.description}</p>
              <small>Confidence {primarySignal.confidenceScore}</small>
            </article>
          ) : (
            <p className="ops-muted">No signal candidate is active.</p>
          )}
        </div>
      </section>

      <section className="ops-two-column">
        <div className="ops-card">
          <div className="ops-card-heading">
            <span>Encompax Triggers</span>
          </div>
          <ul className="ops-reason-list">
            {panel.governanceTriggers.map((trigger) => (
              <li key={trigger}>{trigger}</li>
            ))}
          </ul>
        </div>

        <div className="ops-card">
          <div className="ops-card-heading">
            <span>Next Actions</span>
          </div>
          <ul className="ops-reason-list">
            {panel.recommendedActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="ops-evidence-strip">
        {panel.evidence.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </footer>
    </div>
  );
};

export default OperationsPhasePanel;
