import React, { useMemo, useState } from "react";
import EncompaxMark from "../components/EncompaxMark";
import SILLogo from "../components/SILLogo";

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
          ) : (
            <section className="panel-full"><div className="panel-header"><div><p className="transport-eyebrow">Assigned transactions</p><h1 className="panel-title">{activeArea?.label}</h1></div></div><div className="partner-empty"><strong>No assigned work yet</strong><p>{activeArea?.description}</p><p>Items will appear here only after {clientName} assigns them to {partnerName}.</p></div></section>
          )}
        </main>
      </div>
    </div>
  );
};

export default PartnerWorkspace;
