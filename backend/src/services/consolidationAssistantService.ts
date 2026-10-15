import { createHash, randomUUID } from "crypto";
import OpenAI from "openai";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeCollection } from "./intake/intakeStore";
import type { OrderConsolidationProposal } from "./orderConsolidationService";

export const CONSOLIDATION_ASSISTANT_PROMPT_VERSION = "sil-consolidation-assistant-v1";
type RecommendationType = "APPROVE_READY_GROUPS" | "SPLIT_CAPACITY_GROUP" | "WAIT_FOR_MORE_ORDERS" | "REBUILD_PLANNING_EVIDENCE" | "NO_CHANGE";
export type ConsolidationAssistantResult = {
  response: string;
  evidence: string[];
  recommendations: Array<{ actionType: RecommendationType; groupIds: string[]; title: string; rationale: string; operationalEffect: string; costEffect: string }>;
  suggestedPrompts: string[];
};
type TurnRecord = ConsolidationAssistantResult & {
  schemaVersion: "1.0"; turnId: string; workspaceId: string; consolidationProposalId: string; proposalContentHash: string;
  operatorMessage: string; provider: "OPENAI" | "RULES"; model: string; promptVersion: string; responseId: string | null; createdBy: string; createdAt: string;
};

const localTurns = new Map<string, TurnRecord[]>();
let client: OpenAI | undefined;
const schema = {
  type: "object", additionalProperties: false, required: ["response", "evidence", "recommendations", "suggestedPrompts"],
  properties: {
    response: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, suggestedPrompts: { type: "array", items: { type: "string" } },
    recommendations: { type: "array", items: { type: "object", additionalProperties: false, required: ["actionType", "groupIds", "title", "rationale", "operationalEffect", "costEffect"], properties: {
      actionType: { type: "string", enum: ["APPROVE_READY_GROUPS", "SPLIT_CAPACITY_GROUP", "WAIT_FOR_MORE_ORDERS", "REBUILD_PLANNING_EVIDENCE", "NO_CHANGE"] },
      groupIds: { type: "array", items: { type: "string" } }, title: { type: "string" }, rationale: { type: "string" }, operationalEffect: { type: "string" }, costEffect: { type: "string" },
    } } },
  },
} as const;

const scopedEvidence = (proposal: OrderConsolidationProposal) => ({
  proposalId: proposal.consolidationProposalId, integrity: proposal.integrity, createdAt: proposal.createdAt,
  groups: proposal.groups.map((group) => ({ groupId: group.groupId, role: group.role, laneName: group.laneName, orderCount: group.orderIds.length, orderMeids: group.orderMeids, plannedPickup: group.plannedPickup, plannedDelivery: group.plannedDelivery, equipmentType: group.equipmentType, carrierName: group.carrierName, totalWeightLbs: group.totalWeightLbs, totalPallets: group.totalPallets, maxWeightLbs: group.maxWeightLbs, maxPallets: group.maxPallets, utilization: group.utilization, status: group.status, findings: group.findings })),
  excludedOrders: proposal.excludedOrders,
});

function fallback(proposal: OrderConsolidationProposal): ConsolidationAssistantResult {
  const blocked = proposal.groups.filter((group) => group.status === "CAPACITY_EXCEEDED");
  const ready = proposal.groups.filter((group) => group.status === "READY");
  const single = proposal.groups.filter((group) => group.status === "SINGLE_ORDER");
  return {
    response: blocked.length ? `${blocked.length} group${blocked.length === 1 ? " exceeds" : "s exceed"} equipment capacity. Split those groups or change their equipment plan before approval.` : ready.length ? `${ready.length} multi-order group${ready.length === 1 ? " is" : "s are"} ready. Review the single-order legs and commitment times before approving the complete proposal.` : "No multi-order group is ready yet. The current groups contain one order each.",
    evidence: [`${proposal.groups.length} scheduled groups`, `${ready.length} ready multi-order groups`, `${blocked.length} capacity blockers`, `${single.length} single-order groups`],
    recommendations: blocked.map((group) => ({ actionType: "SPLIT_CAPACITY_GROUP" as const, groupIds: [group.groupId], title: `Split ${group.laneName}`, rationale: group.findings[0]?.message || "The combined group exceeds governed equipment capacity.", operationalEffect: "Prepare multiple capacity-compliant loads while preserving the scheduled lane and source evidence.", costEffect: "Additional loads may multiply per-load charges; awarded rates must be reapplied to each resulting load." })),
    suggestedPrompts: ["Which groups are ready to approve?", "Where are the capacity risks?", "Would waiting improve utilization?"],
  };
}

export async function runConsolidationAssistant(input: { proposal: OrderConsolidationProposal; message: string; actor: string; safetyIdentifier?: string }) {
  const message = input.message.trim();
  if (!message || message.length > 4000) throw new Error("Enter a question up to 4,000 characters.");
  let result = fallback(input.proposal); let provider: TurnRecord["provider"] = "RULES"; let model = "governed-rules"; let responseId: string | null = null;
  if (process.env.OPENAI_API_KEY) {
    try {
      client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: Number(process.env.SIL_OPENAI_TIMEOUT_MS ?? 20_000), maxRetries: Number(process.env.SIL_OPENAI_MAX_RETRIES ?? 1) });
      model = process.env.SIL_OPENAI_MODEL ?? "gpt-5.6-terra";
      const response = await client.responses.create({
        model, reasoning: { effort: "low" }, store: false, max_output_tokens: 1400, safety_identifier: input.safetyIdentifier,
        instructions: `You are the SIL Consolidation Assistant. Answer the operator's question using only the supplied verified consolidation evidence. Explain why orders group or remain separate, capacity and timing consequences, and practical tradeoffs. Do not claim an action executed. Do not change orders, schedules, lanes, awards, or loads. Recommendations are advisory drafts and require explicit user approval through SIL. Never infer another tenant's data, market rates, distances, or costs that are not supplied. Use only listed group IDs. If evidence is insufficient, state exactly what is missing. Be conversational, specific, and clear rather than templated.`,
        input: JSON.stringify({ operatorMessage: message, consolidationEvidence: scopedEvidence(input.proposal) }),
        text: { verbosity: "medium", format: { type: "json_schema", name: "sil_consolidation_assistant", strict: true, schema } },
      });
      const parsed = JSON.parse(response.output_text) as ConsolidationAssistantResult;
      const allowedIds = new Set(input.proposal.groups.map((group) => group.groupId));
      result = { ...parsed, evidence: parsed.evidence.slice(0, 12), suggestedPrompts: parsed.suggestedPrompts.slice(0, 6), recommendations: parsed.recommendations.slice(0, 8).map((item) => ({ ...item, groupIds: item.groupIds.filter((id) => allowedIds.has(id)) })) };
      provider = "OPENAI"; responseId = response.id;
    } catch (error) {
      console.error("SIL consolidation assistant request failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    }
  }
  const turn: TurnRecord = { schemaVersion: "1.0", turnId: randomUUID(), workspaceId: input.proposal.workspaceId, consolidationProposalId: input.proposal.consolidationProposalId, proposalContentHash: input.proposal.contentHash, operatorMessage: message, ...result, provider, model, promptVersion: CONSOLIDATION_ASSISTANT_PROMPT_VERSION, responseId, createdBy: input.actor, createdAt: new Date().toISOString() };
  if (isFirestorePrimaryEnabled()) await intakeCollection(turn.workspaceId, "consolidationAssistantTurns").doc(turn.turnId).create(turn);
  else localTurns.set(turn.workspaceId, [...(localTurns.get(turn.workspaceId) ?? []), turn]);
  return turn;
}

export const safetyIdentifierFor = (uid: string) => createHash("sha256").update(uid).digest("hex").slice(0, 64);
