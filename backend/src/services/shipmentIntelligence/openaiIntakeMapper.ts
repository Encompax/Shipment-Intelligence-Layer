import OpenAI from "openai";

export type IntakeMappingDataset = "LOADS" | "CARRIERS" | "LANE_RATES" | "UNSUPPORTED";

export type IntakeMappingProposal = {
  dataset: IntakeMappingDataset;
  mapping: Record<string, string>;
  confidence: number;
  summary: string;
  reviewNotes: string[];
};

const MAPPABLE_FIELDS = {
  LOADS: [
    "customerName", "customerId", "direction", "originFacility", "originAddress", "originCity", "originState",
    "originPostalCode", "destinationFacility", "destinationAddress", "destinationCity", "destinationState",
    "destinationPostalCode", "pickupWindowStart", "pickupWindowEnd", "deliveryWindowStart", "deliveryWindowEnd",
    "mode", "equipmentType", "weightLbs", "weightUnit", "unitCount", "unitType", "handlingUnitCount",
    "handlingUnitType", "commodity", "skuRefs", "poNumber", "bolNumber", "customerReference",
    "handlingRequirements", "specialInstructions", "hazmat", "temperatureControlled", "targetBuyRate",
    "targetSellRate", "marginTarget", "fuelSurcharge", "accessorialEstimate", "lumperEstimate", "detentionRatePerHour",
  ],
  CARRIERS: ["carrierName", "mcNumber", "dotNumber", "insuranceStatus", "safetyStatus", "creditStatus", "serviceScore", "onTimeRate", "falloffRate", "preferred", "blocked"],
  LANE_RATES: ["originRegion", "destinationRegion", "mode", "equipmentType", "lowRate", "medianRate", "highRate", "averageTransitDays", "transitVarianceDays", "onTimeRate", "sampleSize"],
} as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["dataset", "mappings", "confidence", "summary", "reviewNotes"],
  properties: {
    dataset: { type: "string", enum: ["LOADS", "CARRIERS", "LANE_RATES", "UNSUPPORTED"] },
    mappings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "sourceHeader"],
        properties: { field: { type: "string" }, sourceHeader: { type: "string" } },
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string" },
    reviewNotes: { type: "array", items: { type: "string" } },
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

export async function proposeIntakeMapping(input: {
  headers: string[];
  rows: Record<string, string>[];
  safetyIdentifier?: string;
}): Promise<IntakeMappingProposal> {
  const response = await openai().responses.create({
    model: process.env.SIL_OPENAI_MODEL ?? "gpt-5.6-terra",
    reasoning: { effort: "low" },
    store: false,
    max_output_tokens: 900,
    safety_identifier: input.safetyIdentifier,
    instructions: `You map organization-scoped transportation spreadsheet columns into Encompax SIL fields.
Classify the file as LOADS, CARRIERS, LANE_RATES, or UNSUPPORTED. Only map an exact supplied source header.
Never invent data, never infer values, and leave ambiguous fields unmapped. LOADS require customerName, originCity,
originState, destinationCity, and destinationState; call out missing required fields in reviewNotes. This is a governed
proposal only: it cannot import records or alter data. Keep the summary practical for an operator reviewing the intake.`,
    input: JSON.stringify({ headers: input.headers, sampleRows: input.rows.slice(0, 10), mappableFields: MAPPABLE_FIELDS }),
    text: { verbosity: "low", format: { type: "json_schema", name: "sil_intake_mapping", strict: true, schema } },
  });

  const parsed = JSON.parse(response.output_text) as {
    dataset: IntakeMappingDataset;
    mappings: Array<{ field: string; sourceHeader: string }>;
    confidence: number;
    summary: string;
    reviewNotes: string[];
  };
  const allowed = new Set(parsed.dataset === "UNSUPPORTED" ? [] : MAPPABLE_FIELDS[parsed.dataset]);
  const headers = new Set(input.headers);
  const mapping = Object.fromEntries(
    parsed.mappings
      .filter((item) => allowed.has(item.field as never) && headers.has(item.sourceHeader))
      .map((item) => [item.field, item.sourceHeader])
  );

  return {
    dataset: parsed.dataset,
    mapping,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    summary: String(parsed.summary ?? "Review the proposed mapping before approving intake."),
    reviewNotes: Array.isArray(parsed.reviewNotes) ? parsed.reviewNotes.map(String).slice(0, 8) : [],
  };
}
