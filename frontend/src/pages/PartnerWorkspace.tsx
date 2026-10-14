import React, { useEffect, useMemo, useState } from "react";
import EncompaxMark from "../components/EncompaxMark";
import SILLogo from "../components/SILLogo";
import { fetchPartnerTenders, respondToPartnerTender } from "../api/client";

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
type PartnerTenderItem = { load: { displayId: string; laneName: string; laneType: string; equipmentType?: string; plannedPickup?: string; plannedDelivery?: string; carrier: { name: string; scac?: string }; award: { rate: number; currency: string; rateUnit: string } }; state: { status: string; activeTenderId?: string | null }; tenders: { tenderId: string; issuedAt: string; responseDueAt?: string | null; note?: string | null }[] };

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
  const loadTenders = async () => { try { const result = await fetchPartnerTenders(); setTenderItems(result.queue ?? []); } catch (error) { setTenderMessage(error instanceof Error ? error.message : "Could not load assigned tenders."); } };
  useEffect(() => { if (activeKey === "tenders") void loadTenders(); }, [activeKey]);
  const respond = async (tenderId: string, response: "ACCEPTED" | "REJECTED") => { try { setTenderBusy(tenderId); await respondToPartnerTender(tenderId, { response, reason: tenderReason || undefined }); setTenderMessage(response === "ACCEPTED" ? "Tender accepted. The client can now prepare execution." : "Tender rejected and returned to the client for review."); setTenderReason(""); await loadTenders(); } catch (error) { setTenderMessage(error instanceof Error ? error.message : "Could not record the response."); } finally { setTenderBusy(null); } };

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
          ) : (
            <section className="panel-full"><div className="panel-header"><div><p className="transport-eyebrow">Assigned transactions</p><h1 className="panel-title">{activeArea?.label}</h1></div></div><div className="partner-empty"><strong>No assigned work yet</strong><p>{activeArea?.description}</p><p>Items will appear here only after {clientName} assigns them to {partnerName}.</p></div></section>
          )}
        </main>
      </div>
    </div>
  );
};

export default PartnerWorkspace;
