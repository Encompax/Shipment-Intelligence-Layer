import { useEffect, useMemo, useState } from "react";
import { expireTender, fetchTenderQueue, issuePlannedLoadTender, retenderPlannedLoad } from "../api/client";

type QueueItem = {
  load: { loadId: string; displayId: string; laneName: string; laneType: string; orderMeids: string[]; equipmentType?: string; plannedPickup?: string; plannedDelivery?: string; carrier: { name: string; scac?: string }; award: { rate: number; currency: string; rateUnit: string }; sourceProposalId: string; sourceProposalContentHash: string };
  state: { status: "READY_TO_TENDER" | "AWAITING_RESPONSE" | "ACCEPTED" | "REJECTED" | "EXPIRED"; activeTenderId?: string | null; lastTenderId?: string | null; attemptCount: number; updatedAt: string };
  tenders: { tenderId: string; issuedAt: string; responseDueAt?: string | null; integrity?: string }[];
};

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : "Not set";

export default function TenderQueuePanel() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [responseDueAt, setResponseDueAt] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadQueue = async () => { try { const result = await fetchTenderQueue(); setQueue(result.queue ?? []); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load the tender queue."); } };
  useEffect(() => { void loadQueue(); }, []);
  const selected = useMemo(() => queue.find((item) => item.load.loadId === selectedLoadId) ?? queue[0] ?? null, [queue, selectedLoadId]);
  useEffect(() => { if (!selectedLoadId && queue[0]) setSelectedLoadId(queue[0].load.loadId); }, [queue, selectedLoadId]);
  const issue = async () => {
    if (!selected) return;
    try {
      setBusy(true); setMessage("Recording tender issuance...");
      const result = await issuePlannedLoadTender(selected.load.loadId, { responseDueAt: responseDueAt || undefined, note: note || undefined });
      setMessage(result.idempotent ? "This tender was already issued; the existing record was returned." : `Tender ${result.tender.tenderId} issued to ${result.tender.carrier.scac || result.tender.carrier.name}.`);
      setResponseDueAt(""); setNote(""); await loadQueue();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not issue the tender."); }
    finally { setBusy(false); }
  };
  const expire = async () => { if (!selected?.state.activeTenderId) return; try { setBusy(true); await expireTender(selected.state.activeTenderId, note || undefined); setMessage("Tender expired. The load is eligible for governed retendering."); setNote(""); await loadQueue(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not expire the tender."); } finally { setBusy(false); } };
  const retender = async () => { if (!selected || !note.trim()) return; try { setBusy(true); const result = await retenderPlannedLoad(selected.load.loadId, { reason: note, responseDueAt: responseDueAt || undefined }); setMessage(`Tender attempt ${result.tender.attemptNumber} issued to ${result.tender.carrier.scac || result.tender.carrier.name}.`); setNote(""); setResponseDueAt(""); await loadQueue(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not retender the load."); } finally { setBusy(false); } };
  const ready = queue.filter((item) => item.state.status === "READY_TO_TENDER").length;
  const awaiting = queue.filter((item) => item.state.status === "AWAITING_RESPONSE").length;

  return <div className="data-intake tender-queue">
    <section className="transport-hero intake-hero"><div><p className="transport-eyebrow">Tender and execute</p><h2>Tender Queue</h2><p>Release approved planned loads to their awarded carriers while preserving the planning record.</p></div></section>
    <section className="tender-summary"><div><span>Ready to tender</span><strong>{ready}</strong></div><div><span>Awaiting response</span><strong>{awaiting}</strong></div><div><span>Planned loads</span><strong>{queue.length}</strong></div></section>
    {message && <p className="ops-note">{message}</p>}
    <div className="tender-workbench">
      <section className="transport-panel tender-list"><div className="transport-panel-header"><div><p className="transport-eyebrow">Queue</p><h3>Approved loads</h3></div><span>{queue.length}</span></div>{queue.map((item) => <button type="button" key={item.load.loadId} className={selected?.load.loadId === item.load.loadId ? "active" : ""} onClick={() => setSelectedLoadId(item.load.loadId)}><span><strong>{item.load.displayId}</strong><small>{item.load.laneName}</small></span><b>{item.state.status.replaceAll("_", " ")}</b></button>)}{!queue.length && <p className="ops-note">Approved planned loads will appear here before carrier tendering.</p>}</section>
      <section className="transport-panel tender-detail">{selected ? <><div className="transport-panel-header"><div><p className="transport-eyebrow">Tender review</p><h3>{selected.load.displayId}</h3></div><span>{selected.state.status.replaceAll("_", " ")}</span></div><div className="tender-detail-grid"><div><span>Lane</span><strong>{selected.load.laneName}</strong><small>{selected.load.laneType.replaceAll("_", " ")}</small></div><div><span>Awarded carrier</span><strong>{selected.load.carrier.name}</strong><small>{selected.load.carrier.scac || "No SCAC"}</small></div><div><span>Awarded rate</span><strong>{selected.load.award.currency} {selected.load.award.rate}</strong><small>{selected.load.award.rateUnit.replaceAll("_", " ")}</small></div><div><span>Equipment</span><strong>{selected.load.equipmentType || "Not set"}</strong><small>{selected.load.orderMeids.join(", ")}</small></div><div><span>Pickup</span><strong>{formatDate(selected.load.plannedPickup)}</strong></div><div><span>Delivery</span><strong>{formatDate(selected.load.plannedDelivery)}</strong></div></div><div className="tender-evidence"><span>Planning evidence</span><code>{selected.load.sourceProposalId}</code><small>SHA-256 {selected.load.sourceProposalContentHash}</small></div>{selected.state.status === "READY_TO_TENDER" ? <div className="tender-release"><label>Response due<input type="datetime-local" value={responseDueAt} onChange={(event) => setResponseDueAt(event.target.value)} /></label><label>Tender note<textarea rows={2} placeholder="Optional operating note for the carrier" value={note} onChange={(event) => setNote(event.target.value)} /></label><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void issue()}>{busy ? "Issuing..." : "Issue tender"}</button></div> : selected.state.status === "AWAITING_RESPONSE" ? <div className="tender-issued"><strong>Awaiting carrier response</strong><span>Tender {selected.state.activeTenderId}</span><small>Issued {formatDate(selected.tenders[0]?.issuedAt)} | Due {formatDate(selected.tenders[0]?.responseDueAt)} | Integrity {selected.tenders[0]?.integrity || "VERIFIED"}</small><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void expire()}>Expire tender</button></div> : ["REJECTED", "EXPIRED"].includes(selected.state.status) ? <div className="tender-release"><label>New response due<input type="datetime-local" value={responseDueAt} onChange={(event) => setResponseDueAt(event.target.value)} /></label><label>Retender reason<textarea rows={2} required placeholder="Explain why this load is being retendered" value={note} onChange={(event) => setNote(event.target.value)} /></label><button className="btn btn-primary" type="button" disabled={busy || !note.trim()} onClick={() => void retender()}>{busy ? "Retendering..." : "Retender awarded carrier"}</button></div> : <div className="tender-issued"><strong>Carrier accepted</strong><span>This load is ready for execution setup.</span><small>Tender history: {selected.state.attemptCount} attempt(s)</small></div>}</> : <div className="lane-empty"><strong>No planned loads</strong><p>Approve an order planning proposal to create the first load.</p></div>}</section>
    </div>
  </div>;
}
