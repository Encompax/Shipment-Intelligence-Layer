import React, { Suspense, useMemo, useState } from "react";
import {
  PANEL_CONFIG,
  PANEL_GROUPS,
  PanelKey,
  PanelConfig,
} from "../config/panels";
import EncompaxMark from "../components/EncompaxMark";
import SILLogo from "../components/SILLogo";
import EncompaxLoader from "../components/EncompaxLoader";
import { defaultWorkspaceViewSettings, useWorkspaceViewSettings } from "../context/WorkspaceViewSettings";

type TabKey = "overview" | PanelKey;
type DashboardProps = {
  currentUserName: string;
  currentUserEmail: string;
  workspaceName: string;
  organizationName: string;
  onSignOut: () => Promise<void>;
};

type ShellAction = {
  key: string;
  label: string;
  meta: string;
  keywords: string;
  href?: string;
  tab?: TabKey;
};

const CURRENT_USER_PERMISSIONS: string[] = [
  "transportation:view",
  "datasources:view",
  "sourcing:view",
  "planning:view",
  "productAlignment:view",
  "production:view",
];

const hasPermission = (panel: PanelConfig) =>
  panel.requiredPermissions.length === 0 ||
  panel.requiredPermissions.every((p) => CURRENT_USER_PERMISSIONS.includes(p));

const SIDEBAR_WORKFLOW_ORDER: PanelKey[] = [
  "transportationCommand",
  "datasources",
  "orders",
  "planning",
  "sourcing",
  "facilities",
  "tenders",
  "production",
  "productAlignment",
];

const Dashboard: React.FC<DashboardProps> = ({
  currentUserName,
  currentUserEmail,
  workspaceName,
  organizationName,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [shellSearch, setShellSearch] = useState("");
  const [shellSearchOpen, setShellSearchOpen] = useState(false);
  const { settings: viewSettings, setSettings: setViewSettings } = useWorkspaceViewSettings();

  const visiblePanels = PANEL_CONFIG.filter(hasPermission);

  const activePanel =
    activeTab !== "overview"
      ? visiblePanels.find((p) => p.key === activeTab) ?? null
      : null;

  const topbarTitle =
    activeTab === "overview" ? "Overview" : (activePanel?.label ?? "Dashboard");

  const shellActions = useMemo<ShellAction[]>(
    () => [
      {
        key: "workspace",
        label: "Encompax workspace",
        meta: "Signed-in profile and module access",
        href: "https://www.encompax.com/workspace.html",
        keywords: "encompax workspace dashboard profile packages support",
      },
      {
        key: "resources",
        label: "Resource library",
        meta: "Guides and rollout learning",
        href: "https://www.encompax.com/resources.html",
        keywords: "resources guides library tutorials onboarding",
      },
      {
        key: "help",
        label: "Support center",
        meta: "Help and business contacts",
        href: "https://www.encompax.com/help.html",
        keywords: "help support faq business contacts",
      },
      {
        key: "overview",
        label: "SIL overview",
        meta: "Return to operations overview",
        tab: "overview",
        keywords: "overview home sil operations visibility",
      },
      ...visiblePanels.map((panel) => ({
        key: panel.key,
        label: panel.label,
        meta: panel.group,
        tab: panel.key,
        keywords: `${panel.label} ${panel.group} sil panel module`,
      })),
    ],
    [visiblePanels]
  );

  const filteredShellActions = useMemo(() => {
    const query = shellSearch.trim().toLowerCase();
    if (!query) {
      return shellActions.slice(0, 7);
    }
    return shellActions
      .filter((item) =>
        `${item.label} ${item.meta} ${item.keywords}`.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [shellActions, shellSearch]);

  const runShellAction = (action: ShellAction) => {
    setShellSearch("");
    setShellSearchOpen(false);
    if (action.tab) {
      setActiveTab(action.tab);
      return;
    }
    if (action.href) {
      window.location.assign(action.href);
    }
  };

  const renderContent = () => {
    if (activeTab === "overview") {
      return (
        <div className="overview-command">
          <section className="transport-hero overview-hero">
            <div>
              <p className="transport-eyebrow">Shipment Intelligence Layer</p>
              <h2>Transportation Control Tower</h2>
              <p>Prioritize the work required to plan, tender, move, and document freight.</p>
            </div>
            <div className="transport-parent-brand">
              <SILLogo size={34} />
              <div>
                <span>Workspace</span>
                <strong>{workspaceName}</strong>
              </div>
            </div>
          </section>

          <section className="overview-route-grid">
            {[
              {
                key: "transportationCommand" as TabKey,
                label: "My work",
                eyebrow: "Control tower",
                body: "Open the operating queue for tenders, active loads, shipment updates, and decisions needing attention.",
              },
              {
                key: "datasources" as TabKey,
                label: "Data intake",
                eyebrow: "Connect",
                body: "Bring operational records into SIL through governed file intake or a supported source connection.",
              },
              {
                key: "orders" as TabKey,
                label: "Orders",
                eyebrow: "Build",
                body: "Create and review transfer, inbound, and ad hoc orders before they are assigned to loads and lanes.",
              },
              {
                key: "planning" as TabKey,
                label: "Loads & lanes",
                eyebrow: "Plan",
                body: "Review coverage, lane requirements, timing pressure, and the work that needs to be tendered.",
              },
              {
                key: "sourcing" as TabKey,
                label: "Carrier network & RFPs",
                eyebrow: "Source",
                body: "Manage carrier eligibility, bid participation, and the supplier relationships used for award decisions.",
              },
              {
                key: "tenders" as TabKey,
                label: "Tender Queue",
                eyebrow: "Tender",
                body: "Release approved loads to awarded carriers and track the response boundary before execution.",
              },
              {
                key: "production" as TabKey,
                label: "Active shipments",
                eyebrow: "Execute",
                body: "Follow pickup, ETA, delivery, documents, and exceptions through completion.",
              },
            ].map((card) => (
              <button key={card.key} className="overview-route-card" type="button" onClick={() => setActiveTab(card.key)}>
                <span>{card.eyebrow}</span>
                <strong>{card.label}</strong>
                <p>{card.body}</p>
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
          <Suspense fallback={<EncompaxLoader label={`Opening ${activePanel.label}`} detail="Preparing your workspace" />}>
            <PanelComponent />
          </Suspense>
        </div>
      </div>
    );
  };

  return (
    <div className={`app-shell sil-density-${viewSettings.density}${viewSettings.resizablePanels ? " sil-resizable-panels" : ""}${viewSettings.pinPanels ? " sil-pin-panels" : ""}`} style={{ "--sil-panel-height": `${viewSettings.panelHeight}dvh` } as React.CSSProperties}>
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
            const groupPanels = visiblePanels
              .filter((p) => p.group === group)
              .sort((a, b) => SIDEBAR_WORKFLOW_ORDER.indexOf(a.key) - SIDEBAR_WORKFLOW_ORDER.indexOf(b.key));
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
          <div className="topbar-shell-intro">
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
          </div>
          <div className="topbar-meta">
            <div className="topbar-utility">
              <div className="topbar-link-row">
                <a href="https://www.encompax.com/workspace.html">Workspace</a>
                <a href="https://www.encompax.com/resources.html">Resources</a>
                <a href="https://www.encompax.com/help.html">Help</a>
              </div>
              <div className="topbar-search-shell">
                <label className="topbar-search-field" htmlFor="silShellSearch">
                  <span>Search</span>
                  <input
                    id="silShellSearch"
                    type="search"
                    value={shellSearch}
                    placeholder="Search SIL"
                    onFocus={() => setShellSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setShellSearchOpen(false), 120)}
                    onChange={(event) => {
                      setShellSearch(event.target.value);
                      setShellSearchOpen(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setShellSearchOpen(false);
                        setShellSearch("");
                      }
                      if (event.key === "Enter" && filteredShellActions.length) {
                        event.preventDefault();
                        runShellAction(filteredShellActions[0]);
                      }
                    }}
                  />
                </label>
                {shellSearchOpen ? (
                  <div className="topbar-search-results">
                    {filteredShellActions.length ? (
                      filteredShellActions.map((action) => (
                        <button
                          key={action.key}
                          type="button"
                          className="topbar-search-result"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            runShellAction(action);
                          }}
                        >
                          <strong>{action.label}</strong>
                          <span>{action.meta}</span>
                        </button>
                      ))
                    ) : (
                      <div className="topbar-search-empty">No matching routes yet.</div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <span className="topbar-org">{organizationName || workspaceName}</span>
            <details className="workspace-view-settings"><summary>View</summary><div className="workspace-view-settings-panel"><label>Workspace layout<select value={viewSettings.layout} onChange={(event) => setViewSettings((current) => ({ ...current, layout: event.target.value as "stacked" | "panels" }))}><option value="stacked">Stacked</option><option value="panels">Panels</option></select></label><label>Density<select value={viewSettings.density} onChange={(event) => setViewSettings((current) => ({ ...current, density: event.target.value as "compact" | "comfortable" }))}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label><label className="workspace-setting-toggle"><input type="checkbox" checked={viewSettings.resizablePanels} onChange={(event) => setViewSettings((current) => ({ ...current, resizablePanels: event.target.checked }))} />Resizable frames</label><label className="workspace-setting-toggle"><input type="checkbox" checked={viewSettings.pinPanels} onChange={(event) => setViewSettings((current) => ({ ...current, pinPanels: event.target.checked }))} />Pin active workbench</label><label>Frame height <span>{viewSettings.panelHeight}%</span><input type="range" min="45" max="90" step="5" value={viewSettings.panelHeight} onChange={(event) => setViewSettings((current) => ({ ...current, panelHeight: Number(event.target.value) }))} /></label><label className="workspace-setting-toggle"><input type="checkbox" checked={viewSettings.showDiagnostics} onChange={(event) => setViewSettings((current) => ({ ...current, showDiagnostics: event.target.checked }))} />Show diagnostics</label><button className="btn btn-secondary" type="button" onClick={() => setViewSettings(defaultWorkspaceViewSettings)}>Reset view</button></div></details>
            <div className="topbar-user">
              <span className="topbar-user-name">{currentUserName}</span>
              <span className="topbar-user-email">{currentUserEmail}</span>
            </div>
            <button type="button" className="topbar-signout" onClick={() => void onSignOut()}>
              Sign out
            </button>
          </div>
        </header>

        <main className="content-area">{renderContent()}</main>
      </div>
    </div>
  );
};

export default Dashboard;
