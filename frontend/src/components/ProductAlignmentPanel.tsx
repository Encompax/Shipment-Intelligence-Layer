import React, { useEffect, useMemo, useState } from "react";
import { fetchSilWorkspace, updateSilWorkspace } from "../api/client";
import EncompaxMark from "./EncompaxMark";
import SILLogo from "./SILLogo";

type ProductStatus = "ACTIVE" | "AVAILABLE" | "PLANNED";

type ProductModule = {
  id: string;
  name: string;
  shortName: string;
  status: ProductStatus;
  category: string;
  purpose: string;
  dataFlow: string;
  unlocks: string[];
  governanceRoute: string;
};

type WorkspaceState = {
  workspaceId: string;
  organization: string;
  workspaceName: string;
  ownerEmail?: string;
  status: "ACTIVE" | "TRIAL" | "MERGED" | "ARCHIVED";
  selectedProductIds: string[];
  governanceMode: "SIGNAL_ONLY" | "COUNCIL_REVIEW" | "ENTERPRISE_SYNC";
  monthlyTokenBudget: number;
  monthlySpendLimitUsd: number;
  enabledAgentProviders: Array<"MANUAL" | "OPENAI" | "ANTHROPIC" | "HUGGINGFACE">;
  modules: Array<{
    productId: string;
    status: ProductStatus;
    enabled: boolean;
    connectedAt?: string;
    governanceRoute: string;
  }>;
  teamMembers: Array<{
    email: string;
    role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
    status: "ACTIVE" | "INVITED";
  }>;
};

const productModules: ProductModule[] = [
  {
    id: "sil",
    name: "Shipment Intelligence Layer",
    shortName: "SIL",
    status: "ACTIVE",
    category: "Transportation execution",
    purpose: "Manage shipment planning, load posting, bid review, carrier award, lane visibility, and transportation exceptions.",
    dataFlow: "Shipments, loads, bids, carrier decisions, lane rates, workflow events",
    unlocks: ["Load board workflow", "Carrier scoring", "Market-rate checks", "Encompax routing"],
    governanceRoute: "platform_overview",
  },
  {
    id: "marengo",
    name: "Marengo Data Insights",
    shortName: "Marengo",
    status: "AVAILABLE",
    category: "Forecasting and analytics",
    purpose: "Turn SIL execution history into demand, customer-risk, service, and operating-pattern forecasts.",
    dataFlow: "Forecast candidates, customer risk, operational timing, service signals",
    unlocks: ["Forecast governance", "Risk ranking", "Customer intelligence", "Trend interpretation"],
    governanceRoute: "governance_council",
  },
  {
    id: "kardia",
    name: "Kardia Quality Management",
    shortName: "Kardia",
    status: "PLANNED",
    category: "Quality and compliance",
    purpose: "Govern quality events, corrective actions, release readiness, and compliance-sensitive process decisions.",
    dataFlow: "Quality holds, deviations, CAPA evidence, release checkpoints",
    unlocks: ["Quality signal routing", "CAPA evidence", "Release controls", "Audit packet generation"],
    governanceRoute: "ethos_sentinel_review",
  },
  {
    id: "encompax",
    name: "Encompax Governance Core",
    shortName: "Encompax",
    status: "AVAILABLE",
    category: "Decision governance",
    purpose: "Coordinate signal intake, seat routing, council review, decision audit, and operator-readable governance records.",
    dataFlow: "Normalized signals, seat assignments, council reviews, audit decisions",
    unlocks: ["Governance queue", "Seat contracts", "Decision audit", "Agent council readiness"],
    governanceRoute: "platform_overview",
  },
];

const defaultSelected = productModules
  .filter((product) => product.status === "ACTIVE")
  .map((product) => product.id);

const ProductAlignmentPanel: React.FC = () => {
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(defaultSelected);
  const [focusedProductId, setFocusedProductId] = useState("sil");
  const [workspace, setWorkspace] = useState<WorkspaceState>({
    workspaceId: "workspace-shipment-operations",
    organization: "Example Organization",
    workspaceName: "Shipment Operations",
    ownerEmail: "operator@example.com",
    status: "TRIAL",
    selectedProductIds: defaultSelected,
    governanceMode: "SIGNAL_ONLY",
    monthlyTokenBudget: 250000,
    monthlySpendLimitUsd: 25,
    enabledAgentProviders: ["MANUAL"],
    modules: productModules.map((product) => ({
      productId: product.id,
      status: product.status,
      enabled: product.status === "ACTIVE",
      governanceRoute: product.governanceRoute,
    })),
    teamMembers: [{ email: "operator@example.com", role: "OWNER", status: "ACTIVE" }],
  });
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "OPERATOR" | "VIEWER">("OPERATOR");

  useEffect(() => {
    let mounted = true;
    fetchSilWorkspace()
      .then((payload) => {
        if (!mounted || !payload.workspace) return;
        setWorkspace(payload.workspace);
        setSelectedProductIds(payload.workspace.selectedProductIds ?? defaultSelected);
      })
      .catch(() => {
        if (mounted) setSaveStatus("Workspace API unavailable; using local defaults.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const focusedProduct =
    productModules.find((product) => product.id === focusedProductId) ?? productModules[0];

  const selectedProducts = useMemo(
    () => productModules.filter((product) => selectedProductIds.includes(product.id)),
    [selectedProductIds]
  );

  const toggleProduct = (product: ProductModule) => {
    if (product.status === "PLANNED") return;
    setSelectedProductIds((current) => {
      const next = current.includes(product.id)
        ? current.filter((id) => id !== product.id)
        : [...current, product.id];
      return next.includes("sil") ? next : ["sil", ...next];
    });
    setFocusedProductId(product.id);
  };

  const handleWorkspaceSave = async () => {
    try {
      setSaveStatus("Saving workspace selection...");
      const moduleState = productModules.map((product) => {
        const existing = workspace.modules.find((module) => module.productId === product.id);
        return {
          productId: product.id,
          status: product.status,
          enabled: selectedProductIds.includes(product.id) && product.status !== "PLANNED",
          connectedAt: existing?.connectedAt,
          governanceRoute: product.governanceRoute,
        };
      });
      const result = await updateSilWorkspace({
        ...workspace,
        selectedProductIds,
        modules: moduleState,
      });
      setWorkspace(result.workspace);
      setSelectedProductIds(result.workspace.selectedProductIds);
      setSaveStatus("Workspace product selection saved.");
    } catch (err) {
      setSaveStatus(err instanceof Error ? err.message : "Workspace save failed");
    }
  };

  const updateWorkspaceField = <K extends keyof WorkspaceState>(key: K, value: WorkspaceState[K]) => {
    setWorkspace((current) => ({ ...current, [key]: value }));
  };

  const handleInviteMember = () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setWorkspace((current) => {
      const existingMembers = current.teamMembers ?? [];
      const withoutExisting = existingMembers.filter((member) => member.email.toLowerCase() !== email);
      return {
        ...current,
        teamMembers: [
          ...withoutExisting,
          {
            email,
            role: inviteRole,
            status: "INVITED",
          },
        ],
      };
    });
    setInviteEmail("");
    setSaveStatus("Invite staged. Save workspace to persist it.");
  };

  const updateMemberRole = (email: string, role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER") => {
    setWorkspace((current) => ({
      ...current,
      teamMembers: current.teamMembers.map((member) => (member.email === email ? { ...member, role } : member)),
    }));
  };

  const removeMember = (email: string) => {
    setWorkspace((current) => ({
      ...current,
      teamMembers: current.teamMembers.filter((member) => member.email !== email || member.role === "OWNER"),
    }));
  };

  return (
    <div className="product-suite">
      <section className="suite-hero">
        <div>
          <p className="transport-eyebrow">Selected Products</p>
          <h2>Organization Product Stack</h2>
          <p>
            Start with SIL, then connect forecasting, quality, and governance modules as the team grows.
            Each selected product keeps its own operating data while Encompax receives only governed signals.
          </p>
        </div>
        <div className="suite-brand-stack">
          <SILLogo size={42} />
          <div>
            <span>Current workspace</span>
            <strong>{workspace.workspaceName}</strong>
          </div>
        </div>
      </section>

      <section className="suite-summary-grid">
        <div>
          <span>Active products</span>
          <strong>{selectedProducts.length}</strong>
        </div>
        <div>
          <span>Primary module</span>
          <strong>SIL</strong>
        </div>
        <div>
          <span>Governance handoff</span>
          <strong>Signal only</strong>
        </div>
        <div>
          <span>Org boundary</span>
          <strong>{workspace.status}</strong>
        </div>
        <div>
          <span>Team members</span>
          <strong>{workspace.teamMembers.length}</strong>
        </div>
      </section>

      <section className="suite-layout">
        <div className="suite-product-list">
          {productModules.map((product) => {
            const selected = selectedProductIds.includes(product.id);
            return (
              <button
                key={product.id}
                className={`suite-product-card${focusedProduct.id === product.id ? " active" : ""}`}
                onClick={() => setFocusedProductId(product.id)}
              >
                <div>
                  <strong>{product.shortName}</strong>
                  <span className={`suite-status ${product.status.toLowerCase()}`}>{product.status}</span>
                </div>
                <h3>{product.name}</h3>
                <p>{product.category}</p>
                <label className="suite-select-toggle" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={product.status === "PLANNED"}
                    onChange={() => toggleProduct(product)}
                  />
                  <span>{selected ? "Selected" : product.status === "PLANNED" ? "Roadmap" : "Add product"}</span>
                </label>
              </button>
            );
          })}
        </div>

        <article className="suite-detail-panel">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">{focusedProduct.category}</p>
              <h3>{focusedProduct.name}</h3>
            </div>
            <span className={`suite-status ${focusedProduct.status.toLowerCase()}`}>{focusedProduct.status}</span>
          </div>

          <p className="suite-detail-purpose">{focusedProduct.purpose}</p>

          <div className="suite-flow-grid">
            <div>
              <span>Data kept inside module</span>
              <strong>{focusedProduct.dataFlow}</strong>
            </div>
            <div>
              <span>Encompax route</span>
              <strong>{focusedProduct.governanceRoute}</strong>
            </div>
          </div>

          <div className="suite-unlocks">
            <h4>What this unlocks</h4>
            <div>
              {focusedProduct.unlocks.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="suite-governance-card">
            <EncompaxMark size={28} />
            <div>
              <span>Governed connection style</span>
              <p>
                Product data remains scoped to the organization and module. Encompax receives normalized events,
                evidence, and routing metadata when a decision requires governance.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="suite-selected-strip">
        <div>
          <p className="transport-eyebrow">Current Selection</p>
          <h3>{workspace.organization}</h3>
        </div>
        <div className="suite-path">
          {selectedProducts.map((product) => (
            <span key={product.id}>{product.shortName}</span>
          ))}
          <span className="suite-path-governed">Encompax Review</span>
        </div>
        <button className="btn btn-primary" type="button" onClick={handleWorkspaceSave}>
          Save Selection
        </button>
        {saveStatus && <p className="ops-note">{saveStatus}</p>}
      </section>

      <section className="suite-admin-layout">
        <article className="suite-admin-card">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">Workspace Controls</p>
              <h3>Organization Boundary</h3>
            </div>
            <span className="suite-status available">{workspace.governanceMode}</span>
          </div>
          <div className="suite-admin-grid">
            <label>
              Organization
              <input
                value={workspace.organization}
                onChange={(event) => updateWorkspaceField("organization", event.target.value)}
              />
            </label>
            <label>
              Workspace
              <input
                value={workspace.workspaceName}
                onChange={(event) => updateWorkspaceField("workspaceName", event.target.value)}
              />
            </label>
            <label>
              Owner Email
              <input
                value={workspace.ownerEmail ?? ""}
                onChange={(event) => updateWorkspaceField("ownerEmail", event.target.value)}
              />
            </label>
            <label>
              Governance Mode
              <select
                value={workspace.governanceMode}
                onChange={(event) =>
                  updateWorkspaceField(
                    "governanceMode",
                    event.target.value as WorkspaceState["governanceMode"]
                  )
                }
              >
                <option value="SIGNAL_ONLY">Signal only</option>
                <option value="COUNCIL_REVIEW">Council review</option>
                <option value="ENTERPRISE_SYNC">Enterprise sync</option>
              </select>
            </label>
          </div>
        </article>

        <article className="suite-admin-card">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">Cost Guardrails</p>
              <h3>Token Budget Readiness</h3>
            </div>
            <span className="suite-status active">{workspace.enabledAgentProviders.join(", ")}</span>
          </div>
          <div className="suite-admin-grid compact">
            <label>
              Monthly Tokens
              <input
                value={workspace.monthlyTokenBudget}
                inputMode="numeric"
                onChange={(event) => updateWorkspaceField("monthlyTokenBudget", Number(event.target.value))}
              />
            </label>
            <label>
              Monthly Spend Limit
              <input
                value={workspace.monthlySpendLimitUsd}
                inputMode="numeric"
                onChange={(event) => updateWorkspaceField("monthlySpendLimitUsd", Number(event.target.value))}
              />
            </label>
          </div>
          <p className="suite-admin-note">
            These guardrails are placeholders for the future agent council: dry-run/manual by default,
            then API providers can be enabled when billing and seat contracts are ready.
          </p>
        </article>
      </section>

      <section className="suite-admin-card">
        <div className="transport-panel-header">
          <div>
            <p className="transport-eyebrow">Team Growth</p>
            <h3>Members and Invites</h3>
          </div>
          <span>{workspace.teamMembers.length} people</span>
        </div>
        <div className="suite-invite-row">
          <input
            value={inviteEmail}
            placeholder="teammate@company.com"
            onChange={(event) => setInviteEmail(event.target.value)}
          />
          <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)}>
            <option value="ADMIN">Admin</option>
            <option value="OPERATOR">Operator</option>
            <option value="VIEWER">Viewer</option>
          </select>
          <button className="btn btn-secondary" type="button" onClick={handleInviteMember}>
            Add Invite
          </button>
        </div>
        <div className="suite-member-list">
          {workspace.teamMembers.map((member) => (
            <div key={member.email} className="suite-member-row">
              <div>
                <strong>{member.email}</strong>
                <span>{member.status}</span>
              </div>
              <select
                value={member.role}
                disabled={member.role === "OWNER"}
                onChange={(event) =>
                  updateMemberRole(member.email, event.target.value as "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER")
                }
              >
                <option value="OWNER">Owner</option>
                <option value="ADMIN">Admin</option>
                <option value="OPERATOR">Operator</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <button
                className="btn btn-danger btn-sm"
                type="button"
                disabled={member.role === "OWNER"}
                onClick={() => removeMember(member.email)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProductAlignmentPanel;
