import React from "react";
import { useEffect, useMemo, useState } from "react";
import { fetchExecutionLoads } from "../api/client";

type ExecutionLoad = {
  load: {
    loadId: string;
    displayId: string;
    laneName: string;
    laneType: string;
    equipmentType?: string;
    orderMeids?: string[];
    plannedPickup?: string;
    plannedDelivery?: string;
    carrier: { name: string; scac?: string };
  };
  execution: {
    status: string;
    latestEta?: string | null;
    activeException?: boolean;
    exceptionSummary?: string | null;
    updatedAt: string;
  };
  events: Array<{
    eventId: string;
    eventType: string;
    resultingStatus: string;
    estimatedArrival?: string | null;
    location?: string | null;
    note?: string | null;
    reportedBy: string;
    occurredAt: string;
    recordedAt: string;
    integrity: "VERIFIED" | "FAILED";
  }>;
};

const dateTime = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not reported";
const etaVariance = (item: ExecutionLoad) => {
  const plan = Date.parse(item.load.plannedDelivery || "");
  const eta = Date.parse(item.execution.latestEta || "");
  if (!Number.isFinite(plan) || !Number.isFinite(eta)) return null;
  return Math.round((eta - plan) / 60000);
};
const varianceLabel = (minutes: number | null) => {
  if (minutes === null || minutes === 0) return minutes === 0 ? "On plan" : "No comparison";
  const magnitude = Math.abs(minutes);
  const duration = magnitude >= 60 ? `${(magnitude / 60).toFixed(magnitude % 60 ? 1 : 0)} hr` : `${magnitude} min`;
  return `${duration} ${minutes > 0 ? "late" : "early"}`;
};

const ProductionManagementPanel: React.FC = () => {
  const [loads, setLoads] = useState<ExecutionLoad[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setError(null);
      const result = await fetchExecutionLoads();
      const next = (result.loads || []) as ExecutionLoad[];
      setLoads(next);
      setSelectedId((current) => current && next.some((item) => item.load.loadId === current) ? current : next[0]?.load.loadId || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Shipment execution could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 30000); return () => window.clearInterval(timer); }, []);
  const selected = loads.find((item) => item.load.loadId === selectedId) || null;
  const metrics = useMemo(() => ({
    moving: loads.filter((item) => ["DISPATCHED", "AT_PICKUP", "IN_TRANSIT"].includes(item.execution.status)).length,
    exceptions: loads.filter((item) => item.execution.activeException).length,
    late: loads.filter((item) => (etaVariance(item) || 0) > 0).length,
    delivered: loads.filter((item) => item.execution.status === "DELIVERED").length,
  }), [loads]);

  if (loading) return <div className="empty-state">Loading active shipments...</div>;
  if (error) return <div className="empty-state"><p className="empty-state-title">Shipment monitoring unavailable</p><p className="empty-state-body">{error}</p><button className="btn btn-secondary" type="button" onClick={() => void refresh()}>Try again</button></div>;

  return <section className="execution-monitor">
    <div className="panel-header execution-monitor-header"><div><p className="transport-eyebrow">Control tower</p><h1 className="panel-title">Active shipments</h1><p>Follow carrier progress, ETA changes, exceptions, and delivery evidence.</p></div><button className="btn btn-secondary" type="button" onClick={() => void refresh()}>Refresh</button></div>
    <div className="execution-monitor-metrics"><div><span>Accepted</span><strong>{loads.length}</strong></div><div><span>Moving</span><strong>{metrics.moving}</strong></div><div className={metrics.exceptions ? "has-risk" : ""}><span>Exceptions</span><strong>{metrics.exceptions}</strong></div><div className={metrics.late ? "has-warning" : ""}><span>Late ETA</span><strong>{metrics.late}</strong></div><div><span>Delivered</span><strong>{metrics.delivered}</strong></div></div>
    {loads.length ? <div className="execution-monitor-workbench">
      <div className="execution-load-list" role="list">{loads.map((item) => { const variance = etaVariance(item); return <button type="button" className={`execution-load-row ${selectedId === item.load.loadId ? "is-selected" : ""}`} key={item.load.loadId} onClick={() => setSelectedId(item.load.loadId)}><span className={`execution-state-dot ${item.execution.activeException ? "is-exception" : item.execution.status === "DELIVERED" ? "is-delivered" : ""}`} aria-hidden="true"/><span><strong>{item.load.displayId}</strong><small>{item.load.laneName}</small></span><span><strong>{item.execution.status.replaceAll("_", " ")}</strong><small className={(variance || 0) > 0 ? "eta-late" : ""}>{varianceLabel(variance)}</small></span></button>; })}</div>
      <div className="execution-load-detail">{selected && <><div className="transport-panel-header"><div><p className="transport-eyebrow">{selected.load.laneType.replaceAll("_", " ")}</p><h2>{selected.load.displayId}</h2></div><span>{selected.execution.status.replaceAll("_", " ")}</span></div>{selected.execution.activeException && <div className="execution-exception"><strong>Active exception</strong><p>{selected.execution.exceptionSummary}</p></div>}<div className="tender-detail-grid"><div><span>Lane</span><strong>{selected.load.laneName}</strong></div><div><span>Carrier</span><strong>{selected.load.carrier.name}</strong><small>{selected.load.carrier.scac || "No SCAC"}</small></div><div><span>Equipment</span><strong>{String(selected.load.equipmentType || "Not set")}</strong></div><div><span>Orders</span><strong>{selected.load.orderMeids?.join(", ") || "Assigned"}</strong></div><div><span>Planned pickup</span><strong>{dateTime(selected.load.plannedPickup)}</strong></div><div><span>Planned delivery</span><strong>{dateTime(selected.load.plannedDelivery)}</strong></div><div><span>Latest ETA</span><strong>{dateTime(selected.execution.latestEta)}</strong><small>{varianceLabel(etaVariance(selected))}</small></div><div><span>Last carrier update</span><strong>{dateTime(selected.execution.updatedAt)}</strong></div></div><div className="execution-audit"><div className="execution-audit-heading"><strong>Verified execution history</strong><small>Carrier events are append-only and cannot be edited here.</small></div>{selected.events.length ? selected.events.map((event) => <article key={event.eventId} className={event.eventType === "EXCEPTION_REPORTED" ? "is-exception" : ""}><span className="execution-timeline-marker"/><div><strong>{event.eventType.replaceAll("_", " ")}</strong><small>{dateTime(event.occurredAt)}{event.location ? ` | ${event.location}` : ""}</small>{event.estimatedArrival && <p>ETA: {dateTime(event.estimatedArrival)}</p>}{event.note && <p>{event.note}</p>}</div><span className={`integrity-badge ${event.integrity === "FAILED" ? "failed" : ""}`}>{event.integrity}</span></article>) : <p className="ops-note">The carrier has accepted this load but has not posted an execution update.</p>}</div></>}</div>
    </div> : <div className="partner-empty"><strong>No accepted shipments</strong><p>Loads appear here after an awarded carrier accepts a tender.</p></div>}
  </section>;
};

export default ProductionManagementPanel;
