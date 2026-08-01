import React, { useEffect, useMemo, useState } from "react";
import {
  executeApprovedSilLoadTransition,
  fetchSilGovernanceDecisions,
  fetchSilLoadExplanation,
  proposeSilLoadTransition,
} from "../api/client";

type Props = {
  loadId: string;
  currentState: string;
  allowedTransitions: string[];
  onExecuted: () => Promise<void> | void;
};

type Proposal = { signalId: string; nextState: string };

export default function SilLoadAssistant({ loadId, currentState, allowedTransitions, onExecuted }: Props) {
  const [summary, setSummary] = useState("");
  const [nextState, setNextState] = useState(allowedTransitions[0] || "");
  const [rationale, setRationale] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [disposition, setDisposition] = useState("NOT_SUBMITTED");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setSummary("");
    setProposal(null);
    setDisposition("NOT_SUBMITTED");
    setMessage(null);
    setNextState(allowedTransitions[0] || "");
    setRationale("");
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
    <section className="sil-assistant" aria-label="SIL operations assistant">
      <div className="sil-assistant-heading">
        <div>
          <span>SIL Assistant</span>
          <strong>Load action support</strong>
        </div>
        <span className={`sil-assistant-status status-${disposition.toLowerCase()}`}>{statusLabel}</span>
      </div>

      <p className="sil-assistant-summary">
        {summary || `Review ${loadId} in ${currentState} and prepare a governed next action.`}
      </p>

      <div className="sil-assistant-controls">
        <button type="button" className="btn btn-sm" onClick={explain} disabled={busy}>Explain</button>
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
