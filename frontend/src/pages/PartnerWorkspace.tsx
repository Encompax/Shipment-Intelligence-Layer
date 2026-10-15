import React, { useEffect, useMemo, useState } from "react";
import EncompaxMark from "../components/EncompaxMark";
import SILLogo from "../components/SILLogo";
import { createPartnerLoadEvent, fetchPartnerLoads, fetchPartnerTenders, respondToPartnerTender } from "../api/client";

type PartnerWorkspaceProps = {
  partnerName: string;
  clientName: string;
  currentUserName: string;
  currentUserEmail: string;
  accessScopes: string[];
  onSignOut: () => Promise<void>;
};

const areas = [
  { key: "tenders", label: "Tender requests", description: "Review tenders assigned to your organization and respond when client workflows are enabled." },
  { key: "shipments", label: "Active shipments", description: "View shipments assigned to your organization without exposing other carrier activity." },
  { key: "tracking", label: "Tracking & ETAs", description: "Provide authorized pickup, status, ETA, and delivery updates." },
  { key: "documents", label: "Documents & POD", description: "View authorized shipment documents and submit proof of delivery." },
  { key: "invoices", label: "Invoices", description: "Submit invoices for assigned work and follow their review status." },
  { key: "comments", label: "Comments & exceptions", description: "Explain delays, report exceptions, and respond to client questions." },
];
type PartnerTenderItem = { load: { loadId: string; displayId: string; laneName: string; laneType: string; equipmentType?: string; plannedPickup?: string; plannedDelivery?: string; orderMeids?: string[]; carrier: { name: string; scac?: string }; award: { rate: number; currency: string; rateUnit: string } }; state: { status: string; activeTenderId?: string | null }; tenders: { tenderId: string; issuedAt: string; responseDueAt?: string | null; note?: string | null }[] };
type PartnerLoadItem = PartnerTenderItem & { execution: { status: string; latestEta?: string | null; updatedAt: string }; events: Array<{ eventId: string; eventType: string; resultingStatus: string; estimatedArrival?: string | null; location?: string | null; note?: string | null; occurredAt: string; integrity: string }> };

const PartnerWorkspace: React.FC<PartnerWorkspaceProps> = ({
  partnerName,
  clientName,
  currentUserName,
  currentUserEmail,
  accessScopes,
  onSignOut,
}) => {
  const allowed = useMemo(() => new Set(accessScopes), [accessScopes]);
  const visibleAreas = areas.filter((area) => allowed.has(area.key));
  const [activeKey, setActiveKey] = useState("overview");
  const activeArea = visibleAreas.find((area) => area.key === activeKey);
  const serviceScopes = ["linehaul", "final_mile", "adhoc", "inbound"].filter((scope) => allowed.has(scope));
  const serviceLabels: Record<string, string> = { linehaul: "Linehaul", final_mile: "Final mile", adhoc: "Adhoc", inbound: "Inbound" };
  const [tenderItems, setTenderItems] = useState<PartnerTenderItem[]>([]);
  const [tenderReason, setTenderReason] = useState("");
  const [tenderMessage, setTenderMessage] = useState<string | null>(null);
  const [tenderBusy, setTenderBusy] = useState<string | null>(null);
  const [activeLoads, setActiveLoads] = useState<PartnerLoadItem[]>([]);
  const [executionBusy, setExecutionBusy] = useState(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);
  const [executionDraft, setExecutionDraft] = useState({ loadId: "", eventType: "ETA_UPDATED", estimatedArrival: "", location: "", note: "" });
  const loadTenders = async () => { try { const result = await fetchPartnerTenders(); setTenderItems(result.queue ?? []); } catch (error) { setTenderMessage(error instanceof Error ? error.message : "Could not load assigned tenders."); } };
  useEffect(() => { if (activeKey === "tenders") void loadTenders(); }, [activeKey]);
  const loadActiveLoads = async () => { try { const result = await fetchPartnerLoads(); setActiveLoads(result.loads ?? []); setExecutionMessage(null); } catch (error) { setExecutionMessage(error instanceof Error ? error.message : "Could not load active shipments."); } };
  useEffect(() => { if (["shipments", "tracking", "comments"].includes(activeKey)) void loadActiveLoads(); }, [activeKey]);
  useEffect(() => { setExecutionDraft((current) => ({ ...current, eventType: activeKey === "comments" ? "EXCEPTION_REPORTED" : "ETA_UPDATED" })); }, [activeKey]);
  const respond = async (tenderId: string, response: "ACCEPTED" | "REJECTED") => { try { setTenderBusy(tenderId); await respondToPartnerTender(tenderId, { response, reason: tenderReason || undefined }); setTenderMessage(response === "ACCEPTED" ? "Tender accepted. The client can now prepare execution." : "Tender rejected and returned to the client for review."); setTenderReason(""); await loadTenders(); } catch (error) { setTenderMessage(error instanceof Error ? error.message : "Could not record the response."); } finally { setTenderBusy(null); } };
  const submitExecution = async (event: React.FormEvent) => { event.preventDefault(); if (!executionDraft.loadId) return; try { setExecutionBusy(true); await createPartnerLoadEvent(executionDraft.loadId, { eventType: executionDraft.eventType, estimatedArrival: executionDraft.estimatedArrival || undefined, location: executionDraft.location || undefined, note: executionDraft.note || undefined }); setExecutionMessage("Execution update recorded with the accepted tender evidence."); setExecutionDraft((current) => ({ ...current, estimatedArrival: "", location: "", note: "" })); await loadActiveLoads(); } catch (error) { setExecutionMessage(error instanceof Error ? error.message : "Could not record the execution update."); } finally { setExecutionBusy(false); } };

  return (
    <div className="app-shell partner-shell">
      <aside className="sidebar">
        <div className="sidebar-client-brand">
          <SILLogo size={38} />
          <div className="sidebar-client-text">
            <span className="sidebar-client-name">SIL Partner</span>
            <span className="sidebar-client-sub">{partnerName}</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Partner operations">
          <button className={`sidebar-nav-item overview-item${activeKey === "overview" ? " active" : ""}`} onClick={() => setActiveKey("overview")}>Overview</button>
          <div className="sidebar-section">
            <span className="sidebar-section-label">Assigned work</span>
            {visibleAreas.map((area) => (
              <button key={area.key} className={`sidebar-nav-item${activeKey === area.key ? " active" : ""}`} onClick={() => setActiveKey(area.key)}>{area.label}</button>
            ))}
          </div>
        </nav>
        <div className="sidebar-powered-by">
          <span className="powered-by-label">powered by</span>
          <div className="powered-by-brand"><EncompaxMark size={18} opacity={0.8} /><span className="powered-by-name">Encompax</span></div>
        </div>
      </aside>
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-breadcrumb"><span className="topbar-parent-brand"><EncompaxMark size={18} /><span>Encompax</span></span><span className="topbar-separator">/</span><span className="topbar-app-name">SIL Partner Workspace</span></div>
          <div className="topbar-meta"><span className="topbar-org">Working with {clientName}</span><div className="topbar-user"><span className="topbar-user-name">{currentUserName}</span><span className="topbar-user-email">{currentUserEmail}</span></div><button type="button" className="topbar-signout" onClick={() => void onSignOut()}>Sign out</button></div>
        </header>
        <main className="content-area">
          {activeKey === "overview" ? (
            <div className="partner-overview">
              <section className="transport-hero overview-hero"><div><p className="transport-eyebrow">External collaboration</p><h2>{clientName} partner operations</h2><p>Work only with tenders and shipments assigned to {partnerName}.</p></div></section>
              <section className="partner-scope-band"><div><span>Relationship</span><strong>Active</strong></div><div><span>Authorized services</span><strong>{serviceScopes.map((scope) => serviceLabels[scope]).join(", ") || "Not assigned"}</strong></div><div><span>Data boundary</span><strong>Assigned transactions only</strong></div></section>
              <section className="overview-route-grid partner-route-grid">{visibleAreas.map((area) => <button key={area.key} className="overview-route-card" type="button" onClick={() => setActiveKey(area.key)}><strong>{area.label}</strong><p>{area.description}</p></button>)}</section>
            </div>
          ) : activeKey === "tenders" ? (
            <section className="panel-full"><div className="panel-header"><div><p className="transport-eyebrow">Assigned transactions</p><h1 className="panel-title">Tender requests</h1></div></div>{tenderMessage && <p className="ops-note">{tenderMessage}</p>}<div className="partner-tender-list">{tenderItems.map((item) => { const tender = item.tenders[0]; return <article className="transport-panel" key={item.load.displayId}><div className="transport-panel-header"><div><p className="transport-eyebrow">{item.load.laneType.replaceAll("_", " ")}</p><h3>{item.load.displayId}</h3></div><span>{item.state.status.replaceAll("_", " ")}</span></div><div className="tender-detail-grid"><div><span>Lane</span><strong>{item.load.laneName}</strong></div><div><span>Equipment</span><strong>{item.load.equipmentType || "Not set"}</strong></div><div><span>Rate</span><strong>{item.load.award.currency} {item.load.award.rate}</strong><small>{item.load.award.rateUnit.replaceAll("_", " ")}</small></div><div><span>Pickup</span><strong>{item.load.plannedPickup ? new Date(item.load.plannedPickup).toLocaleString() : "Not set"}</strong></div><div><span>Delivery</span><strong>{item.load.plannedDelivery ? new Date(item.load.plannedDelivery).toLocaleString() : "Not set"}</strong></div><div><span>Response due</span><strong>{tender?.responseDueAt ? new Date(tender.responseDueAt).toLocaleString() : "Not set"}</strong></div></div>{item.state.status === "AWAITING_RESPONSE" && tender ? <div className="partner-tender-response"><label>Response note<textarea rows={2} placeholder="Required when rejecting" value={tenderReason} onChange={(event) => setTenderReason(event.target.value)} /></label><div><button className="btn btn-secondary" type="button" disabled={tenderBusy === tender.tenderId || !tenderReason.trim()} onClick={() => void respond(tender.tenderId, "REJECTED")}>Reject</button><button className="btn btn-primary" type="button" disabled={tenderBusy === tender.tenderId} onClick={() => void respond(tender.tenderId, "ACCEPTED")}>Accept tender</button></div></div> : <div className="tender-issued"><strong>Response recorded</strong><small>This tender is {item.state.status.toLowerCase()}.</small></div>}</article>; })}{!tenderItems.length && <div className="partner-empty"><strong>No assigned tenders</strong><p>New tender requests from {clientName} will appear here.</p></div>}</div></section>
          ) : ["shipments", "tracking", "comments"].includes(activeKey) ? (
            <section className="panel-full"><div className="panel-header"><div><p className="transport-eyebrow">Accepted carrier work</p><h1 className="panel-title">{activeKey === "tracking" ? "Tracking & ETAs" : activeKey === "comments" ? "Comments & exceptions" : "Active shipments"}</h1></div></div>{executionMessage && <p className="ops-note">{executionMessage}</p>}{["tracking", "comments"].includes(activeKey) && <form className="partner-execution-form transport-panel" onSubmit={(event) => void submitExecution(event)}><label>Assigned load<select required value={executionDraft.loadId} onChange={(event) => setExecutionDraft({ ...executionDraft, loadId: event.target.value })}><option value="">Select accepted load</option>{activeLoads.filter((item) => item.execution.status !== "DELIVERED").map((item) => <option key={item.load.loadId} value={item.load.loadId}>{item.load.displayId} | {item.load.laneName}</option>)}</select></label><label>Update<select value={executionDraft.eventType} onChange={(event) => setExecutionDraft({ ...executionDraft, eventType: event.target.value })}>{activeKey === "comments" ? <><option value="EXCEPTION_REPORTED">Report exception</option><option value="EXCEPTION_RESOLVED">Resolve exception</option></> : <><option value="DISPATCH_CONFIRMED">Dispatch confirmed</option><option value="ARRIVED_PICKUP">Arrived for pickup</option><option value="PICKED_UP">Picked up</option><option value="IN_TRANSIT">In transit update</option><option value="ETA_UPDATED">ETA updated</option><option value="DELIVERED">Delivered</option></>}</select></label><label>Estimated arrival<input type="datetime-local" required={executionDraft.eventType === "ETA_UPDATED"} value={executionDraft.estimatedArrival} onChange={(event) => setExecutionDraft({ ...executionDraft, estimatedArrival: event.target.value })} /></label><label>Current location<input value={executionDraft.location} onChange={(event) => setExecutionDraft({ ...executionDraft, location: event.target.value })} placeholder="City, state or facility" /></label><label className="partner-execution-note">Operating note<textarea required={executionDraft.eventType === "EXCEPTION_REPORTED"} rows={2} value={executionDraft.note} onChange={(event) => setExecutionDraft({ ...executionDraft, note: event.target.value })} /></label><button className="btn btn-primary" type="submit" disabled={executionBusy || !executionDraft.loadId}>{executionBusy ? "Recording..." : "Record update"}</button></form>}<div className="partner-load-list">{activeLoads.map((item) => <article className="transport-panel" key={item.load.loadId}><div className="transport-panel-header"><div><p className="transport-eyebrow">{item.load.laneType.replaceAll("_", " ")}</p><h3>{item.load.displayId}</h3></div><span>{item.execution.status.replaceAll("_", " ")}</span></div><div className="tender-detail-grid"><div><span>Lane</span><strong>{item.load.laneName}</strong></div><div><span>Equipment</span><strong>{item.load.equipmentType || "Not set"}</strong></div><div><span>Orders</span><strong>{item.load.orderMeids?.join(", ") || "Assigned"}</strong></div><div><span>Pickup</span><strong>{item.load.plannedPickup ? new Date(item.load.plannedPickup).toLocaleString() : "Not set"}</strong></div><div><span>Delivery</span><strong>{item.load.plannedDelivery ? new Date(item.load.plannedDelivery).toLocaleString() : "Not set"}</strong></div><div><span>Current ETA</span><strong>{item.execution.latestEta ? new Date(item.execution.latestEta).toLocaleString() : "Not reported"}</strong></div></div>{item.events.length > 0 && <div className="partner-event-history"><strong>Execution history</strong>{item.events.map((entry) => <div key={entry.eventId}><span>{entry.eventType.replaceAll("_", " ")}</span><small>{new Date(entry.occurredAt).toLocaleString()} | {entry.location || "Location not provided"} | {entry.integrity}</small>{entry.note && <p>{entry.note}</p>}</div>)}</div>}</article>)}{!activeLoads.length && <div className="partner-empty"><strong>No active shipments</strong><p>Accepted tenders assigned by {clientName} will appear here.</p></div>}</div></section>
          ) : (
            <section className="panel-full"><div className="panel-header"><div><p className="transport-eyebrow">Assigned transactions</p><h1 className="panel-title">{activeArea?.label}</h1></div></div><div className="partner-empty"><strong>No assigned work yet</strong><p>{activeArea?.description}</p><p>Items will appear here only after {clientName} assigns them to {partnerName}.</p></div></section>
          )}
        </main>
      </div>
    </div>
  );
};

export default PartnerWorkspace;
