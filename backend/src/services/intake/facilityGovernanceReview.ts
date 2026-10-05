import OpenAI from "openai";

export type FacilityReviewRow = {
  row: number;
  name: string;
  siteId?: string;
  address: string;
  city: string;
  state: string;
  postalCode?: string;
  facilityType: "SUPPLIER" | "CROSSDOCK" | "DC" | "MFC" | "OTHER";
  propertyType: "COMMERCIAL" | "RESIDENTIAL";
};

export type FacilityReviewIssue = {
  row: number;
  severity: "ERROR" | "REVIEW";
  field: string;
  message: string;
};

export type FacilityCorrection = {
  row: number;
  field: "name" | "address" | "city" | "state" | "postalCode" | "facilityType" | "propertyType";
  value: string;
  reason: string;
  confidence: number;
};

export type FacilityGovernanceReview = {
  summary: string;
  risks: string[];
  corrections: FacilityCorrection[];
};

const CORRECTABLE_FIELDS = new Set<FacilityCorrection["field"]>([
  "name", "address", "city", "state", "postalCode", "facilityType", "propertyType",
]);

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "risks", "corrections"],
  properties: {
    summary: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    corrections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["row", "field", "value", "reason", "confidence"],
        properties: {
          row: { type: "integer", minimum: 2 },
          field: { type: "string", enum: ["name", "address", "city", "state", "postalCode", "facilityType", "propertyType"] },
          value: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

let client: OpenAI | undefined;

function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: Number(process.env.SIL_OPENAI_TIMEOUT_MS ?? 20_000),
    maxRetries: Number(process.env.SIL_OPENAI_MAX_RETRIES ?? 1),
  });
  return client;
}

export async function reviewFacilityIntake(input: {
  headers: string[];
  rows: FacilityReviewRow[];
  issues: FacilityReviewIssue[];
  safetyIdentifier?: string;
}): Promise<FacilityGovernanceReview> {
  const response = await openai().responses.create({
    model: process.env.SIL_OPENAI_MODEL ?? "gpt-5.6-terra",
    reasoning: { effort: "low" },
    store: false,
    max_output_tokens: 1_800,
    safety_identifier: input.safetyIdentifier,
    instructions: `You are the SIL facility-intake agent. Review organization-scoped location records before import.
Identify mechanical formatting problems, invalid categorical values, missing values, and likely column/content mismatches.
You may propose a correction only when the corrected value is directly supported by the supplied row. Never invent an
address, geographic fact, postal code, facility identity, or missing value. Do not claim that an address was verified
against an external source. A potentially incorrect street, city, state, or postal code must be listed in risks for
operator verification, not changed. Keep corrections limited to clear whitespace, capitalization, punctuation, or
provided enum normalization. This is a governed proposal: it cannot import records or alter data.`,
    input: JSON.stringify({ headers: input.headers, rows: input.rows.slice(0, 100), knownIssues: input.issues.slice(0, 100) }),
    text: { verbosity: "low", format: { type: "json_schema", name: "sil_facility_review", strict: true, schema } },
  });
  const parsed = JSON.parse(response.output_text) as Partial<FacilityGovernanceReview>;
  const rowNumbers = new Set(input.rows.map((row) => row.row));
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "Review the proposed facility corrections before import.",
    risks: Array.isArray(parsed.risks) ? parsed.risks.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    corrections: Array.isArray(parsed.corrections)
      ? parsed.corrections.filter((correction): correction is FacilityCorrection =>
        Boolean(correction) && typeof correction.row === "number" && rowNumbers.has(correction.row) &&
        CORRECTABLE_FIELDS.has(correction.field as FacilityCorrection["field"]) && typeof correction.value === "string" &&
        typeof correction.reason === "string" && typeof correction.confidence === "number"
      ).slice(0, 100).map((correction) => ({ ...correction, confidence: Math.max(0, Math.min(1, correction.confidence)) }))
      : [],
  };
}
