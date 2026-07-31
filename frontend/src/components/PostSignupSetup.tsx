import React, { useEffect, useMemo, useState } from "react";
import { User } from "firebase/auth";
import { fetchSilWorkspace, updateSilWorkspace } from "../api/client";
import {
  getPlanOption,
  getProductivitySuiteOption,
  PRODUCTIVITY_SUITE_OPTIONS,
  ProductivitySuite,
  WORKSPACE_PLAN_OPTIONS,
  WorkspacePlan,
} from "../lib/onboarding";
import { SilUserProfile, updateSilUserProfile } from "../lib/userProfile";

type PostSignupSetupProps = {
  profile: SilUserProfile | null;
  user: User;
  onComplete: (profile: SilUserProfile) => void;
};

type SetupWorkspaceState = {
  organization: string;
  workspaceName: string;
  ownerEmail: string;
  plan: WorkspacePlan;
  productivitySuite: ProductivitySuite;
  firstDataSourceMode: "csv-upload" | "excel-upload" | "google-sheet-export" | "database-or-api" | "api-later";
  firstConnectionTarget: "sql-server" | "postgresql" | "mysql" | "erp-or-tms" | "custom-api" | "not-selected";
  firstOperationalGoal: "launch-workspace" | "connect-loads" | "tender-freight" | "govern-decisions";
};

const buildWorkspaceName = (organization: string) =>
  organization.trim() ? `${organization.trim()} Shipment Operations` : "Shipment Operations";
const defaultWorkspaceId = "workspace-shipment-operations";

const PostSignupSetup: React.FC<PostSignupSetupProps> = ({ profile, user, onComplete }) => {
  const initialPlan = profile?.intendedPlan ?? "starter";
  const initialSuite = profile?.productivitySuite ?? "mixed";
  const [state, setState] = useState<SetupWorkspaceState>({
    organization: profile?.organization || "",
    workspaceName: profile?.organization ? buildWorkspaceName(profile.organization) : "Shipment Operations",
    ownerEmail: profile?.ownerEmail || profile?.email || user.email || "",
    plan: initialPlan,
    productivitySuite: initialSuite,
    firstDataSourceMode:
      profile?.firstDataSourceMode ??
      (initialSuite === "microsoft"
        ? "excel-upload"
        : initialSuite === "google"
        ? "google-sheet-export"
        : "csv-upload"),
    firstConnectionTarget: profile?.firstConnectionTarget ?? "not-selected",
    firstOperationalGoal: profile?.firstOperationalGoal ?? "launch-workspace",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceHint, setWorkspaceHint] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchSilWorkspace()
      .then((payload) => {
        if (!mounted || !payload.workspace) return;
        if (!profile?.organization && payload.workspace.organization && payload.workspace.organization !== "Example Organization") {
          setState((current) => ({
            ...current,
            organization: current.organization || payload.workspace.organization,
            workspaceName:
              current.workspaceName === "Shipment Operations"
                ? payload.workspace.workspaceName || buildWorkspaceName(payload.workspace.organization)
                : current.workspaceName,
          }));
        }
      })
      .catch(() => {
        if (mounted) setWorkspaceHint("Using local workspace defaults until the workspace record is saved.");
      });

    return () => {
      mounted = false;
    };
  }, [profile?.organization]);

  const selectedPlan = useMemo(() => getPlanOption(state.plan), [state.plan]);
  const selectedSuite = useMemo(() => getProductivitySuiteOption(state.productivitySuite), [state.productivitySuite]);
  const isDirectConnectionFlow = state.firstDataSourceMode === "database-or-api";
  const suggestedSpendLimit = useMemo(() => {
    if (state.plan === "starter") return 49;
    if (state.plan === "team") return 299;
    return 1500;
  }, [state.plan]);

  const updateField = <K extends keyof SetupWorkspaceState>(key: K, value: SetupWorkspaceState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const handleOrganizationChange = (value: string) => {
    setState((current) => ({
      ...current,
      organization: value,
      workspaceName:
        current.workspaceName === "Shipment Operations" || current.workspaceName.endsWith(" Shipment Operations")
          ? buildWorkspaceName(value)
          : current.workspaceName,
    }));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const organization = state.organization.trim();
      const workspaceName = state.workspaceName.trim() || buildWorkspaceName(organization);
      const ownerEmail = state.ownerEmail.trim() || user.email || "";

      if (!organization) {
        throw new Error("Organization name is required.");
      }

      const workspacePayload = {
        workspaceId: defaultWorkspaceId,
        organization,
        workspaceName,
        ownerEmail,
        status: "TRIAL",
        selectedProductIds: ["sil"],
        governanceMode: "SIGNAL_ONLY",
        monthlyTokenBudget: selectedPlan.tokenGuardrail,
        monthlySpendLimitUsd: suggestedSpendLimit,
        enabledAgentProviders: ["MANUAL"],
        modules: [
          {
            productId: "sil",
            status: "ACTIVE",
            enabled: true,
            governanceRoute: "platform_overview",
          },
          {
            productId: "encompax",
            status: "AVAILABLE",
            enabled: true,
            governanceRoute: "platform_overview",
          },
        ],
        teamMembers: [
          {
            email: ownerEmail,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      };

      await updateSilWorkspace(workspacePayload);

      const completedProfile: SilUserProfile = {
        ...(profile ?? {}),
        organization,
        ownerEmail,
        workspaceId: defaultWorkspaceId,
        workspaceName,
        intendedPlan: state.plan,
        productivitySuite: state.productivitySuite,
        moduleAccess: {
          ...(profile?.moduleAccess ?? {}),
          sil: "active",
        },
        recommendedImportMode: selectedSuite.recommendedImportMode,
        firstDataSourceMode: state.firstDataSourceMode,
        firstConnectionTarget: isDirectConnectionFlow ? state.firstConnectionTarget : "not-selected",
        firstOperationalGoal: state.firstOperationalGoal,
        onboardingStatus: "workspace-ready",
        setupCompleted: true,
        setupCompletedAt: new Date().toISOString(),
        usageGuardrails: {
          monthlyTokenGuardrail: selectedPlan.tokenGuardrail,
          monthlySpendReviewRequired: true,
        },
        adaptiveExperience: {
          uxLearningEnabled: true,
          startingProfile: state.productivitySuite,
          nextStep: "connect-first-datasource",
        },
      };

      await updateSilUserProfile(user.uid, completedProfile);
      onComplete(completedProfile);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : "Workspace setup failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="setup-shell">
      <section className="setup-card">
        <div className="setup-copy">
          <p className="auth-eyebrow">Workspace Setup</p>
          <h1>Prepare the first governed SIL workspace</h1>
          <p>
            Your Encompax identity is active. This step turns that identity into a working SIL workspace with the
            first operational defaults, import bias, and cost guardrails in place.
          </p>
          <div className="setup-summary-grid">
            <div className="auth-route">
              <span>Identity model</span>
              <strong>One Encompax account, module access added over time</strong>
            </div>
            <div className="auth-route">
              <span>Starting plan</span>
              <strong>{selectedPlan.label}</strong>
            </div>
            <div className="auth-route">
              <span>Import profile</span>
              <strong>{selectedSuite.label}</strong>
            </div>
          </div>
        </div>

        <form className="setup-panel" onSubmit={handleSubmit}>
          <div className="setup-section">
            <div>
              <p className="transport-eyebrow">Step 1</p>
              <h2>Workspace identity</h2>
            </div>
            <div className="setup-grid">
              <label>
                Organization
                <input value={state.organization} onChange={(event) => handleOrganizationChange(event.target.value)} required />
              </label>
              <label>
                Workspace name
                <input value={state.workspaceName} onChange={(event) => updateField("workspaceName", event.target.value)} required />
              </label>
              <label>
                Owner email
                <input
                  type="email"
                  value={state.ownerEmail}
                  onChange={(event) => updateField("ownerEmail", event.target.value)}
                  required
                />
              </label>
              <label>
                Initial plan intent
                <select value={state.plan} onChange={(event) => updateField("plan", event.target.value as WorkspacePlan)}>
                  {WORKSPACE_PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="setup-section">
            <div>
              <p className="transport-eyebrow">Step 2</p>
              <h2>Data intake defaults</h2>
            </div>
            <div className="setup-grid">
              <label>
                Spreadsheet ecosystem
                <select
                  value={state.productivitySuite}
                  onChange={(event) => updateField("productivitySuite", event.target.value as ProductivitySuite)}
                >
                  {PRODUCTIVITY_SUITE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                First intake motion
                <select
                  value={state.firstDataSourceMode}
                  onChange={(event) =>
                    updateField(
                      "firstDataSourceMode",
                      event.target.value as SetupWorkspaceState["firstDataSourceMode"]
                    )
                  }
                >
                  <option value="csv-upload">CSV upload</option>
                  <option value="excel-upload">Excel upload</option>
                  <option value="google-sheet-export">Google Sheets export</option>
                  <option value="database-or-api">Database or API connection</option>
                  <option value="api-later">API connection later</option>
                </select>
              </label>
              {isDirectConnectionFlow ? (
                <label>
                  Connection target
                  <select
                    value={state.firstConnectionTarget}
                    onChange={(event) =>
                      updateField(
                        "firstConnectionTarget",
                        event.target.value as SetupWorkspaceState["firstConnectionTarget"]
                      )
                    }
                  >
                    <option value="sql-server">SQL Server</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="erp-or-tms">ERP / TMS / WMS platform</option>
                    <option value="custom-api">Custom API</option>
                    <option value="not-selected">Not decided yet</option>
                  </select>
                </label>
              ) : null}
              <label>
                First operational outcome
                <select
                  value={state.firstOperationalGoal}
                  onChange={(event) =>
                    updateField(
                      "firstOperationalGoal",
                      event.target.value as SetupWorkspaceState["firstOperationalGoal"]
                    )
                  }
                >
                  <option value="launch-workspace">Launch the workspace shell</option>
                  <option value="connect-loads">Connect load and shipment data</option>
                  <option value="tender-freight">Begin tendering and carrier workflow</option>
                  <option value="govern-decisions">Route decisions into Encompax review</option>
                </select>
              </label>
              <div className="setup-readiness-card">
                <span>{isDirectConnectionFlow ? "Integration readiness" : "Recommended parser mode"}</span>
                <strong>{isDirectConnectionFlow ? "Connector-assisted onboarding" : selectedSuite.recommendedImportMode}</strong>
                <p>
                  {isDirectConnectionFlow
                    ? "Start with the customer system they already trust, then map fields into SIL without forcing CSV as the only path."
                    : selectedSuite.description}
                </p>
                {isDirectConnectionFlow ? (
                  <p className="setup-inline-meta">
                    Preferred target:{" "}
                    <strong>{state.firstConnectionTarget === "not-selected" ? "To be determined" : state.firstConnectionTarget}</strong>
                  </p>
                ) : (
                  <a href="/templates/sil-shipment-intake-template.csv" target="_blank" rel="noreferrer">
                    Download SIL CSV template
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="setup-section">
            <div>
              <p className="transport-eyebrow">Step 3</p>
              <h2>Guardrails before pricing is live</h2>
            </div>
            <div className="setup-summary-grid compact">
              <div>
                <span>Token guardrail</span>
                <strong>{selectedPlan.tokenGuardrail.toLocaleString()}</strong>
              </div>
              <div>
                <span>Suggested spend review point</span>
                <strong>${suggestedSpendLimit}/mo</strong>
              </div>
              <div>
                <span>Agent mode</span>
                <strong>Manual only at launch</strong>
              </div>
            </div>
            <p className="setup-note">
              We are storing plan intent and cost ceilings now so future billing, module upgrades, and agent-heavy
              workflows can be introduced without restructuring the account model.
            </p>
          </div>

          {workspaceHint ? <p className="auth-inline-note">{workspaceHint}</p> : null}
          {error ? <p className="auth-error">{error}</p> : null}

          <div className="setup-actions">
            <button type="submit" className="auth-submit" disabled={saving}>
              {saving ? "Preparing workspace..." : "Enter SIL workspace"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default PostSignupSetup;
