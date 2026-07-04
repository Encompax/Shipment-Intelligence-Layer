import { SilWorkspacePayload } from "./silPersistenceService";

type SilAgentProvider = "MANUAL" | "OPENAI" | "ANTHROPIC" | "HUGGINGFACE" | "GEMINI";

type SilProviderReadiness = {
  provider: SilAgentProvider;
  configured: boolean;
  enabledForWorkspace: boolean;
  role: "DRY_RUN_BASELINE" | "ACTIVE_CANDIDATE" | "STAGED" | "NOT_CONFIGURED";
  modelRef: string | null;
  recommendedUse: string;
  costControl: string;
};

type SilEvidencePacket = {
  packetType:
    | "LOAD_BOARD_BID_REVIEW"
    | "DISPATCH_READINESS"
    | "SHIPMENT_EXCEPTION"
    | "DOCUMENT_PACKET"
    | "INBOUND_RECEIVING"
    | "MARKET_RATE_REVIEW";
  ready: boolean;
  routedTo: string;
  requiredInputs: string[];
};

const providerConfig: Record<
  Exclude<SilAgentProvider, "MANUAL">,
  {
    keyNames: string[];
    modelEnv: string;
    fallbackModel: string;
    recommendedUse: string;
  }
> = {
  OPENAI: {
    keyNames: ["OPENAI_API_KEY"],
    modelEnv: "OPENAI_MODEL",
    fallbackModel: "gpt-4.1-mini",
    recommendedUse: "Fast operational summaries, structured extraction, and routine evidence normalization.",
  },
  ANTHROPIC: {
    keyNames: ["ANTHROPIC_API_KEY"],
    modelEnv: "ANTHROPIC_MODEL",
    fallbackModel: "claude-3-5-haiku-latest",
    recommendedUse: "Careful exception review, policy narration, and operator-facing reasoning summaries.",
  },
  HUGGINGFACE: {
    keyNames: ["HUGGINGFACE_API_KEY", "HF_TOKEN"],
    modelEnv: "HUGGINGFACE_MODEL",
    fallbackModel: "provider-selected-open-model",
    recommendedUse: "Low-cost or self-directed open-model reviews for shadow seats and private experiments.",
  },
  GEMINI: {
    keyNames: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    modelEnv: "GEMINI_MODEL",
    fallbackModel: "gemini-1.5-flash",
    recommendedUse: "Firebase-aligned agent experiments, multimodal document assistance, and cost-aware review.",
  },
};

const hasAnyEnv = (keys: string[]) => keys.some((key) => Boolean(process.env[key]?.trim()));

const numericEnv = (key: string, fallback: number) => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildProviderReadiness = (
  provider: SilAgentProvider,
  enabledProviders: SilAgentProvider[]
): SilProviderReadiness => {
  if (provider === "MANUAL") {
    return {
      provider,
      configured: true,
      enabledForWorkspace: enabledProviders.includes(provider),
      role: "DRY_RUN_BASELINE",
      modelRef: null,
      recommendedUse: "Deterministic dry-run decisions and human-authored seat review placeholders.",
      costControl: "No token cost; useful as the permanent fallback when provider budgets are exhausted.",
    };
  }

  const config = providerConfig[provider];
  const configured = hasAnyEnv(config.keyNames);
  const enabledForWorkspace = enabledProviders.includes(provider);

  return {
    provider,
    configured,
    enabledForWorkspace,
    role: configured && enabledForWorkspace ? "ACTIVE_CANDIDATE" : configured ? "STAGED" : "NOT_CONFIGURED",
    modelRef: process.env[config.modelEnv]?.trim() || config.fallbackModel,
    recommendedUse: config.recommendedUse,
    costControl:
      configured && enabledForWorkspace
        ? "Eligible only after Encompax seat contracts, per-review ceilings, and audit capture are active."
        : "Kept out of live execution until both backend credentials and workspace enablement are present.",
  };
};

export function buildSilAgentActivityReadiness(workspace: SilWorkspacePayload) {
  const enabledProviders = (workspace.enabledAgentProviders?.length
    ? workspace.enabledAgentProviders
    : ["MANUAL"]) as SilAgentProvider[];

  const providers: SilAgentProvider[] = ["MANUAL", "OPENAI", "ANTHROPIC", "HUGGINGFACE", "GEMINI"];
  const providerReadiness = providers.map((provider) => buildProviderReadiness(provider, enabledProviders));
  const activeCandidates = providerReadiness.filter((provider) => provider.role === "ACTIVE_CANDIDATE");
  const executionMode = process.env.SIL_AGENT_EXECUTION_MODE?.trim() || "DRY_RUN";

  const evidencePackets: SilEvidencePacket[] = [
    {
      packetType: "LOAD_BOARD_BID_REVIEW",
      ready: true,
      routedTo: "Encompax seat contract",
      requiredInputs: ["load", "posting", "bid", "carrier profile", "lane rate", "score evidence"],
    },
    {
      packetType: "DISPATCH_READINESS",
      ready: true,
      routedTo: "Encompax platform overview",
      requiredInputs: ["shipment state", "document packet", "appointment windows", "override evidence"],
    },
    {
      packetType: "SHIPMENT_EXCEPTION",
      ready: true,
      routedTo: "Encompax governance queue",
      requiredInputs: ["exception reason", "customer impact", "cost impact", "timeline risk"],
    },
    {
      packetType: "DOCUMENT_PACKET",
      ready: true,
      routedTo: "Document evidence review",
      requiredInputs: ["BOL", "POD", "rate confirmation", "detention/customer approval when required"],
    },
    {
      packetType: "INBOUND_RECEIVING",
      ready: true,
      routedTo: "Inventory and receiving controls",
      requiredInputs: ["direction", "SKU refs", "PO refs", "quantity", "handling units", "dock appointment"],
    },
    {
      packetType: "MARKET_RATE_REVIEW",
      ready: true,
      routedTo: "Meridian commercial pressure test",
      requiredInputs: ["lane", "mode", "equipment", "target buy", "target sell", "market rate"],
    },
  ];

  return {
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    generatedAt: new Date().toISOString(),
    authorityBoundary:
      "SIL prepares operational evidence and candidate provider readiness. Encompax Core owns final governance seat authority, council routing, and audit decisions.",
    executionMode,
    providers: providerReadiness,
    budgetPolicy: {
      monthlyTokenBudget: workspace.monthlyTokenBudget ?? 0,
      monthlySpendLimitUsd: workspace.monthlySpendLimitUsd ?? 0,
      maxEstimatedTokensPerReview: numericEnv("SIL_AGENT_MAX_TOKENS_PER_REVIEW", 2500),
      maxEstimatedCostUsdPerReview: numericEnv("SIL_AGENT_MAX_COST_USD_PER_REVIEW", 0.15),
      liveProviderCandidates: activeCandidates.map((provider) => provider.provider),
      fallbackProvider: "MANUAL",
    },
    evidencePackets,
    nextSteps: [
      "Keep provider keys in backend or secret manager only.",
      "Enable one provider at a time for shadow review before active seat use.",
      "Send SIL evidence packets to Encompax Core before any governed action is executed.",
      "Capture token estimates, model reference, confidence, evidence, and override reason in the audit record.",
    ],
  };
}
