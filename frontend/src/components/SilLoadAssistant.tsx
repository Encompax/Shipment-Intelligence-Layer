import React, { useEffect, useMemo, useState } from "react";
import {
  executeApprovedSilLoadTransition,
  fetchSilGovernanceDecisions,
  fetchSilLoadExplanation,
  proposeSilLoadTransition,
  sendSilAssistantMessage,
} from "../api/client";

type Props = {
  loadId: string;
  currentState: string;
  allowedTransitions: string[];
  onExecuted: () => Promise<void> | void;
};

type Proposal = { signalId: string; nextState: string };
type ConversationMessage = { id: string; role: "operator" | "assistant"; text: string; evidence?: string[] };

const starterPrompts = [
  "What risks should I review?",
  "Explain the valid next action",
  "Suggest an operational improvement",
];

export default function SilLoadAssistant({ loadId, currentState, allowedTransitions, onExecuted }: Props) {
  const [summary, setSummary] = useState("");
  const [nextState, setNextState] = useState(allowedTransitions[0] || "");
  const [rationale, setRationale] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [disposition, setDisposition] = useState("NOT_SUBMITTED");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [operatorInput, setOperatorInput] = useState("");
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);

  useEffect(() => {
    setSummary("");
    setProposal(null);
    setDisposition("NOT_SUBMITTED");
    setMessage(null);
    setNextState(allowedTransitions[0] || "");
    setRationale("");
    setOperatorInput("");
    setConversation([{
      id: `welcome-${loadId}`,
      role: "assistant",
      text: `I am ready to help review ${loadId}. Ask about operational risk, lifecycle options, or improvement ideas.`,
    }]);
  }, [loadId]);

  useEffect(() => {
    if (!allowedTransitions.includes(nextState)) setNextState(allowedTransitions[0] || "");
  }, [allowedTransitions, nextState]);

  const approved = disposition === "EXECUTE_ALLOWED";
  const statusLabel = useMemo(() => disposition.replaceAll("_", " "), [disposition]);

  async function explain() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fetchSilLoadExplanation(loadId);
      setSummary(result.summary || "No explanation is available.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Explanation unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(text = operatorInput) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const operatorEntry: ConversationMessage = { id: `operator-${Date.now()}`, role: "operator", text: trimmed };
    setConversation((current) => [...current, operatorEntry]);
    setOperatorInput("");
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendSilAssistantMessage(loadId, trimmed);
      setConversation((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: result.response || "No advisory response is available.",
        evidence: result.evidence || [],
      }]);
      if (result.actionDraft && allowedTransitions.includes(result.actionDraft.nextState)) {
        setNextState(result.actionDraft.nextState);
        setRationale(result.actionDraft.rationale || "");
        setMessage("A transition draft was prepared below. Review it before submitting.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assistant response unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDecision() {
    if (!proposal) return;
    try {
      const result = await fetchSilGovernanceDecisions();
      const decision = (result.decisions || []).find((item: any) => item.event?.signalId === proposal.signalId);
      setDisposition(decision?.disposition || "HOLD");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Governance status unavailable");
    }
  }

  useEffect(() => {
    if (!proposal || approved) return;
    void refreshDecision();
    const timer = window.setInterval(() => void refreshDecision(), 10000);
    return () => window.clearInterval(timer);
  }, [proposal?.signalId, approved]);

  async function propose() {
    if (!nextState || rationale.trim().length < 12) {
      setMessage("Add a rationale of at least 12 characters.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await proposeSilLoadTransition(loadId, nextState, rationale.trim());
      setProposal({ signalId: result.signalId, nextState });
      setDisposition("HOLD");
      setMessage("Proposal sent to Encompax governance.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Proposal failed");
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!proposal || !approved) return;
    setBusy(true);
    setMessage(null);
    try {
      await executeApprovedSilLoadTransition(loadId, proposal.signalId, proposal.nextState, [
        "operator confirmed approved SIL assistant action",
      ]);
      setMessage(`Load moved to ${proposal.nextState}.`);
      setProposal(null);
      setDisposition("EXECUTED");
      await onExecuted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approved action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sil-assistant" id="sil-load-assistant" aria-label="SIL operations assistant">
      <div className="sil-assistant-heading">
        <div>
          <span>SIL Assistant</span>
          <strong>Operator support workspace</strong>
        </div>
        <div className="sil-assistant-badges">
          <span className="sil-assistant-provider">Manual advisory</span>
          <span className={`sil-assistant-status status-${disposition.toLowerCase()}`}>{statusLabel}</span>
        </div>
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
          placeholder={`Ask about ${loadId}, share an idea, or request a draft action...`}
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
          Send
        </button>
      </div>

      <div className="sil-assistant-action-heading">
        <div>
          <span>Governed action draft</span>
          <strong>{summary || `Review ${loadId} in ${currentState} before proposing a transition.`}</strong>
        </div>
        <button type="button" className="btn btn-sm" onClick={explain} disabled={busy}>Refresh evidence</button>
      </div>

      <div className="sil-assistant-controls">
        <select value={nextState} onChange={(event) => setNextState(event.target.value)} disabled={busy || !allowedTransitions.length}>
          {!allowedTransitions.length && <option value="">No transition available</option>}
          {allowedTransitions.map((state) => <option key={state} value={state}>{state.replaceAll("_", " ")}</option>)}
        </select>
        <input
          value={rationale}
          onChange={(event) => setRationale(event.target.value)}
          placeholder="Reason for this action"
          disabled={busy || Boolean(proposal)}
        />
        {!proposal && (
          <button type="button" className="btn btn-primary btn-sm" onClick={propose} disabled={busy || !nextState}>Propose</button>
        )}
        {proposal && !approved && (
          <button type="button" className="btn btn-sm" onClick={refreshDecision} disabled={busy}>Check status</button>
        )}
        {proposal && approved && (
          <button type="button" className="btn btn-primary btn-sm" onClick={execute} disabled={busy}>Execute approved</button>
        )}
      </div>
      {message && <small className="sil-assistant-message" role="status">{message}</small>}
    </section>
  );
}
