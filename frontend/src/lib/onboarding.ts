export type WorkspacePlan = "starter" | "team" | "enterprise";
export type ProductivitySuite = "microsoft" | "google" | "mixed";
export type AuthIntent = "create-account" | "signin";

export type OnboardingContext = {
  source: string;
  module: string;
  intent: AuthIntent;
  plan: WorkspacePlan;
  suite: ProductivitySuite;
};

export const WORKSPACE_PLAN_OPTIONS: Array<{
  value: WorkspacePlan;
  label: string;
  description: string;
  tokenGuardrail: number;
}> = [
  {
    value: "starter",
    label: "Starter rollout",
    description: "Single-team launch path with guided setup and controlled usage guardrails.",
    tokenGuardrail: 250000,
  },
  {
    value: "team",
    label: "Team workspace",
    description: "Operational team access with broader workflow usage and shared data intake.",
    tokenGuardrail: 1500000,
  },
  {
    value: "enterprise",
    label: "Enterprise governed",
    description: "Multi-workspace deployment with formal governance review and custom limits.",
    tokenGuardrail: 10000000,
  },
];

export const PRODUCTIVITY_SUITE_OPTIONS: Array<{
  value: ProductivitySuite;
  label: string;
  description: string;
  recommendedImportMode: string;
}> = [
  {
    value: "microsoft",
    label: "Microsoft 365 / Excel",
    description: "Bias onboarding toward CSV and Excel-shaped column mapping.",
    recommendedImportMode: "excel-csv",
  },
  {
    value: "google",
    label: "Google Workspace / Sheets",
    description: "Bias onboarding toward Google Sheets exports and shared-drive intake.",
    recommendedImportMode: "gsheets-csv",
  },
  {
    value: "mixed",
    label: "Mixed environment",
    description: "Keep the parser neutral until real customer files reveal the preferred shape.",
    recommendedImportMode: "hybrid-csv",
  },
];

const DEFAULT_CONTEXT: OnboardingContext = {
  source: "direct",
  module: "sil",
  intent: "create-account",
  plan: "starter",
  suite: "mixed",
};

function isWorkspacePlan(value: string | null): value is WorkspacePlan {
  return value === "starter" || value === "team" || value === "enterprise";
}

function isProductivitySuite(value: string | null): value is ProductivitySuite {
  return value === "microsoft" || value === "google" || value === "mixed";
}

function isAuthIntent(value: string | null): value is AuthIntent {
  return value === "create-account" || value === "signin";
}

export function readOnboardingContext(search = window.location.search): OnboardingContext {
  const params = new URLSearchParams(search);

  return {
    source: params.get("source")?.trim() || DEFAULT_CONTEXT.source,
    module: params.get("module")?.trim() || DEFAULT_CONTEXT.module,
    intent: isAuthIntent(params.get("intent")) ? params.get("intent")! : DEFAULT_CONTEXT.intent,
    plan: isWorkspacePlan(params.get("plan")) ? params.get("plan")! : DEFAULT_CONTEXT.plan,
    suite: isProductivitySuite(params.get("suite")) ? params.get("suite")! : DEFAULT_CONTEXT.suite,
  };
}

export function getPlanOption(plan: WorkspacePlan) {
  return WORKSPACE_PLAN_OPTIONS.find((option) => option.value === plan) ?? WORKSPACE_PLAN_OPTIONS[0];
}

export function getProductivitySuiteOption(suite: ProductivitySuite) {
  return PRODUCTIVITY_SUITE_OPTIONS.find((option) => option.value === suite) ?? PRODUCTIVITY_SUITE_OPTIONS[2];
}
