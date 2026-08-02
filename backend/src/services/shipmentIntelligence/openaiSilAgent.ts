import OpenAI from "openai";

/**
 * OpenAI provider adapter for the SIL assistant.
 *
 * Keep this file server-side. The API key must be injected into OPENAI_API_KEY
 * by Cloud Run from Secret Manager and must never be sent to the browser.
 */

export type SilAssistantScopedContext = {
  // Populate these values only from the verified Firebase identity/profile.
  orgScope: string;
  workspaceId: string;
  operatorRole: string;
  loadId?: string;
  loadState?: string;
  loadSummary?: Record<string, unknown>;
  availableTransitions: string[];
  governanceStatus?: Record<string, unknown> | null;
};

export type SilAssistantActionDraft = {
  transition: string;
  rationale: string;
};

export type SilAssistantModelResult = {
  response: string;
  evidence: string[];
  suggestedPrompts: string[];
  actionDraft: SilAssistantActionDraft | null;
};

export type SilAssistantProviderResult =
  | {
      ok: true;
      result: SilAssistantModelResult;
      provider: "openai";
      model: string;
      promptVersion: string;
      responseId: string;
    }
  | {
      ok: false;
      fallbackRequired: true;
      errorCode: "not_configured" | "provider_error" | "invalid_response";
    };

export type RunSilAssistantInput = {
  context: SilAssistantScopedContext;
  operatorMessage: string;
  // Supply a stable, privacy-preserving hash. Do not supply an email address.
  safetyIdentifier?: string;
};

export const SIL_ASSISTANT_PROMPT_VERSION = "sil-assistant-v1";

// TODO: Adjust terminology and operating policies as the SIL assistant evolves.
export const SIL_ASSISTANT_INSTRUCTIONS = `
You are the Shipment Intelligence Layer (SIL) assistant inside Encompax.

Support the operator by explaining the supplied load context, identifying
evidence, and proposing a permitted next transition when appropriate.
When no load context is supplied, support module-level questions about SIL
workflows, operating concepts, risks, and navigation without drafting an action.

Governance boundaries:
- Treat the supplied organization-scoped context as authoritative.
- Never infer or request data from another organization.
- Do not claim that an action has executed.
- Do not bypass approval, governance, or role requirements.
- Only propose transitions listed in availableTransitions.
- When evidence is insufficient, say so and leave actionDraft null.
- Keep recommendations concise and operationally specific.
`.trim();

const SIL_ASSISTANT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["response", "evidence", "suggestedPrompts", "actionDraft"],
  properties: {
    response: { type: "string" },
    evidence: {
      type: "array",
      items: { type: "string" },
    },
    suggestedPrompts: {
      type: "array",
      items: { type: "string" },
    },
    actionDraft: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["transition", "rationale"],
          properties: {
            transition: { type: "string" },
            rationale: { type: "string" },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;

let openaiClient: OpenAI | undefined;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  openaiClient ??= new OpenAI({
    apiKey,
    timeout: Number(process.env.SIL_OPENAI_TIMEOUT_MS ?? 20_000),
    maxRetries: Number(process.env.SIL_OPENAI_MAX_RETRIES ?? 1),
  });

  return openaiClient;
}

function isModelResult(value: unknown): value is SilAssistantModelResult {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<SilAssistantModelResult>;
  const actionIsValid =
    candidate.actionDraft === null ||
    (typeof candidate.actionDraft === "object" &&
      typeof candidate.actionDraft?.transition === "string" &&
      typeof candidate.actionDraft?.rationale === "string");

  return (
    typeof candidate.response === "string" &&
    Array.isArray(candidate.evidence) &&
    candidate.evidence.every((item) => typeof item === "string") &&
    Array.isArray(candidate.suggestedPrompts) &&
    candidate.suggestedPrompts.every((item) => typeof item === "string") &&
    actionIsValid
  );
}

function parseModelResult(outputText: string): SilAssistantModelResult | null {
  try {
    const parsed: unknown = JSON.parse(outputText);
    return isModelResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function runOpenAiSilAssistant(
  input: RunSilAssistantInput,
): Promise<SilAssistantProviderResult> {
  const operatorMessage = input.operatorMessage.trim();

  if (!process.env.OPENAI_API_KEY) {
    return { ok: false, fallbackRequired: true, errorCode: "not_configured" };
  }

  if (!operatorMessage || operatorMessage.length > 4_000) {
    return { ok: false, fallbackRequired: true, errorCode: "invalid_response" };
  }

  const model = process.env.SIL_OPENAI_MODEL ?? "gpt-5.6-terra";

  try {
    const response = await getOpenAIClient().responses.create({
      model,
      reasoning: { effort: "low" },
      store: false,
      max_output_tokens: Number(process.env.SIL_OPENAI_MAX_OUTPUT_TOKENS ?? 900),
      safety_identifier: input.safetyIdentifier,
      instructions: SIL_ASSISTANT_INSTRUCTIONS,
      input: JSON.stringify({
        operatorMessage,
        scopedLoadContext: input.context,
      }),
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "sil_assistant_response",
          description: "A governed SIL operator-support response and optional action draft.",
          strict: true,
          schema: SIL_ASSISTANT_RESPONSE_SCHEMA,
        },
      },
    });

    const result = parseModelResult(response.output_text);
    if (!result) {
      return { ok: false, fallbackRequired: true, errorCode: "invalid_response" };
    }

    // Defense in depth: reject any transition that was not server-authorized.
    if (
      result.actionDraft &&
      (!input.context.loadId ||
        !input.context.availableTransitions.includes(result.actionDraft.transition))
    ) {
      result.actionDraft = null;
    }

    return {
      ok: true,
      result,
      provider: "openai",
      model,
      promptVersion: SIL_ASSISTANT_PROMPT_VERSION,
      responseId: response.id,
    };
  } catch (error) {
    // TODO: Send sanitized error metadata to server-side observability here.
    console.error("SIL OpenAI assistant request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });

    return { ok: false, fallbackRequired: true, errorCode: "provider_error" };
  }
}
