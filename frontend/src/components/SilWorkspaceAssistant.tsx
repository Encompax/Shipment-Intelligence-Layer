import React, { useEffect, useState } from "react";
import { fetchTransportationLoads, sendSilWorkspaceAssistantMessage } from "../api/client";

type LoadOption = {
  loadId: string;
  customerName?: string;
  customerId?: string;
  status: string;
};

type ConversationMessage = {
  id: string;
  role: "operator" | "assistant";
  text: string;
  evidence?: string[];
};

type ActionDraft = { nextState: string; rationale: string };

const starterPrompts = [
  "What should I review today?",
  "Explain the SIL transportation workflow",
  "Help me organize an operations improvement idea",
];

export default function SilWorkspaceAssistant({ onOpenTransportation }: { onOpenTransportation: () => void }) {
  const [loads, setLoads] = useState<LoadOption[]>([]);
  const [selectedLoadId, setSelectedLoadId] = useState("");
  const [operatorInput, setOperatorInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState("Assistant ready");
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([{
    id: "workspace-welcome",
    role: "assistant",
    text: "Ask about SIL operations, risks, workflows, or improvement ideas. Select a load only when you want shipment-specific context.",
  }]);

  useEffect(() => {
    fetchTransportationLoads()
      .then((result) => setLoads(result.loads || []))
      .catch((error) => setStatus(error instanceof Error ? error.message : "Load context is unavailable"));
  }, []);

  async function sendMessage(text = operatorInput) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setConversation((current) => [...current, { id: `operator-${Date.now()}`, role: "operator", text: trimmed }]);
    setOperatorInput("");
    setBusy(true);
    setStatus(null);
    setActionDraft(null);
    try {
      const result = await sendSilWorkspaceAssistantMessage(trimmed, selectedLoadId || undefined);
      setProviderLabel(result.agent?.provider === "OPENAI" ? (result.agent.modelRef || "OpenAI") : "Manual fallback");
      setConversation((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: result.response || "No advisory response is available.",
        evidence: result.evidence || [],
      }]);
      if (result.actionDraft) {
        setActionDraft(result.actionDraft);
        setStatus("A load-specific action draft is available. Continue in Transportation Command to review and submit it.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Assistant response unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sil-assistant sil-workspace-assistant" aria-label="SIL workspace assistant">
      <div className="sil-assistant-heading">
        <div>
          <span>SIL Assistant</span>
          <strong>Workspace support</strong>
        </div>
        <div className="sil-assistant-badges">
          <span className="sil-assistant-provider">{providerLabel}</span>
          <span className="sil-assistant-status">Advisory</span>
        </div>
      </div>

      <div className="sil-workspace-context">
        <label htmlFor="silAssistantLoadContext">
          <span>Active context</span>
          <select
            id="silAssistantLoadContext"
            value={selectedLoadId}
            onChange={(event) => setSelectedLoadId(event.target.value)}
            disabled={busy}
          >
            <option value="">SIL workspace</option>
            {loads.map((load) => (
              <option key={load.loadId} value={load.loadId}>
                {load.customerName || load.customerId || "Load"} · {load.status.replaceAll("_", " ")} · {load.loadId}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-sm" onClick={onOpenTransportation}>Transportation Command</button>
      </div>

      <div className="sil-assistant-conversation" aria-live="polite">
        {conversation.map((entry) => (
          <article key={entry.id} className={`sil-assistant-message-row ${entry.role}`}>
            <span>{entry.role === "operator" ? "You" : "SIL Assistant"}</span>
            <p>{entry.text}</p>
            {entry.evidence?.length ? <small>{entry.evidence.join(" | ")}</small> : null}
          </article>
        ))}
      </div>

      <div className="sil-assistant-prompts">
        {starterPrompts.map((prompt) => (
          <button type="button" key={prompt} onClick={() => void sendMessage(prompt)} disabled={busy}>{prompt}</button>
        ))}
      </div>

      <div className="sil-assistant-editor">
        <textarea
          value={operatorInput}
          onChange={(event) => setOperatorInput(event.target.value)}
          placeholder={selectedLoadId ? "Ask about the selected load or request a draft action..." : "Ask about SIL, share an idea, or request operational guidance..."}
          maxLength={2000}
          disabled={busy}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void sendMessage()} disabled={busy || !operatorInput.trim()}>
          {busy ? "Working" : "Send"}
        </button>
      </div>
      {actionDraft ? (
        <div className="sil-workspace-draft">
          <div>
            <span>Governed action draft</span>
            <strong>{actionDraft.nextState.replaceAll("_", " ")}</strong>
            <p>{actionDraft.rationale}</p>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenTransportation}>
            Review in Transportation Command
          </button>
        </div>
      ) : null}
      {status ? <small className="sil-assistant-message" role="status">{status}</small> : null}
    </section>
  );
}
