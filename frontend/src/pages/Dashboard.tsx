import React, { useState } from "react";
import {
  PANEL_CONFIG,
  PANEL_GROUPS,
  PanelKey,
  PanelConfig,
} from "../config/panels";
import EncompaxMark from "../components/EncompaxMark";
import SILLogo from "../components/SILLogo";

type TabKey = "overview" | PanelKey;

const CURRENT_USER_PERMISSIONS: string[] = [
  "transportation:view",
  "datasources:view",
  "uploads:view",
  "jobs:view",
  "sourcing:view",
  "planning:view",
  "productAlignment:view",
  "production:view",
  "supplyChain:view",
  "warehouse:view",
  "inventory:view",
  "customer:view",
  "leanOps:view",
  "communication:view",
  "marketing:view",
  "references:view",
];

const hasPermission = (panel: PanelConfig) =>
  panel.requiredPermissions.length === 0 ||
  panel.requiredPermissions.every((p) => CURRENT_USER_PERMISSIONS.includes(p));

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("transportationCommand");

  const visiblePanels = PANEL_CONFIG.filter(hasPermission);

  const activePanel =
    activeTab !== "overview"
      ? visiblePanels.find((p) => p.key === activeTab) ?? null
      : null;

  const topbarTitle =
    activeTab === "overview" ? "Overview" : (activePanel?.label ?? "Dashboard");

  const renderContent = () => {
    if (activeTab === "overview") {
      return (
        <div className="overview-command">
          <section className="transport-hero overview-hero">
            <div>
              <p className="transport-eyebrow">Shipment Intelligence Layer</p>
              <h2>Operations Visibility Hub</h2>
              <p>
                Start with transportation execution, connect intake sources, and route governed decisions into Encompax.
              </p>
            </div>
            <div className="transport-parent-brand">
              <SILLogo size={34} />
              <div>
                <span>Workspace</span>
                <strong>Shipment Operations</strong>
              </div>
            </div>
          </section>

          <section className="overview-route-grid">
            {[
              {
                key: "transportationCommand" as TabKey,
                label: "Transportation Command",
                eyebrow: "Run the workflow",
                body: "Plan loads, post freight, score bids, select carriers, and govern dispatch readiness.",
              },
              {
                key: "datasources" as TabKey,
                label: "Data Intake",
                eyebrow: "Connect organization data",
                body: "Create manual sources, upload CSV or Excel files, and stage live database pipeline connections.",
              },
              {
                key: "productAlignment" as TabKey,
                label: "Product Alignment",
                eyebrow: "Suite growth",
                body: "Select products, control workspace boundaries, invite team members, and prepare governance routing.",
              },
              {
                key: "leanOps" as TabKey,
                label: "LEAN Operating System",
                eyebrow: "Templates and standards",
                body: "Turn operating procedures into reusable decision templates connected to SIL and Encompax.",
              },
            ].map((card) => (
              <button key={card.key} className="overview-route-card" type="button" onClick={() => setActiveTab(card.key)}>
                <span>{card.eyebrow}</span>
                <strong>{card.label}</strong>
                <p>{card.body}</p>
              </button>
            ))}
          </section>

          <section className="overview-module-strip">
            {visiblePanels
              .filter((panel) => panel.showInOverview)
              .map((panel) => (
                <button key={panel.key} type="button" onClick={() => setActiveTab(panel.key)}>
                  {panel.label}
                </button>
              ))}
          </section>
        </div>
      );
    }

    if (!activePanel) {
      return (
        <div className="empty-state">
          <p className="empty-state-title">Not authorized</p>
          <p className="empty-state-body">
            You don't have permission to view this panel.
          </p>
        </div>
      );
    }

    const PanelComponent = activePanel.component;
    return (
      <div className="panel-full">
        <div className="panel-header">
          <h1 className="panel-title">{activePanel.label}</h1>
        </div>
        <div className="panel-body">
          <PanelComponent />
        </div>
      </div>
    );
  };

  return (
    <div className="app-shell">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside className="sidebar">

        {/* Client brand — Ethos Shipment Intelligence, front and center */}
        <div className="sidebar-client-brand">
          <SILLogo size={38} />
          <div className="sidebar-client-text">
            <span className="sidebar-client-name">SIL</span>
            <span className="sidebar-client-sub">Shipment Intelligence</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item overview-item${activeTab === "overview" ? " active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>

          {PANEL_GROUPS.map((group) => {
            const groupPanels = visiblePanels.filter((p) => p.group === group);
            if (groupPanels.length === 0) return null;
            return (
              <div key={group} className="sidebar-section">
                <span className="sidebar-section-label">{group}</span>
                {groupPanels.map((panel) => (
                  <button
                    key={panel.key}
                    className={`sidebar-nav-item${activeTab === panel.key ? " active" : ""}`}
                    onClick={() => setActiveTab(panel.key)}
                  >
                    {panel.label}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Powered by Encompax — discreet, at the bottom */}
        <div className="sidebar-powered-by">
          <span className="powered-by-label">powered by</span>
          <div className="powered-by-brand">
            <EncompaxMark size={18} opacity={0.8} />
            <span className="powered-by-name">Encompax</span>
          </div>
        </div>

      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <span className="topbar-parent-brand">
              <EncompaxMark size={18} />
              <span>Encompax</span>
            </span>
            <span className="topbar-separator">/</span>
            <span className="topbar-app-name">Shipment Intelligence Layer</span>
            <span className="topbar-separator">/</span>
            <h1 className="topbar-title">{topbarTitle}</h1>
          </div>
          <div className="topbar-meta">
            <span className="topbar-org">Shipment Operations</span>
          </div>
        </header>

        <main className="content-area">{renderContent()}</main>
      </div>
    </div>
  );
};

export default Dashboard;
