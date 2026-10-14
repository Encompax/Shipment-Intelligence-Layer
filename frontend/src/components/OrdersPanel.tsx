import { useEffect, useMemo, useState } from "react";
import { createOrder, createPlanningResolutionDraft, decideOrderPlanningProposal, decidePlanningResolutionDraft, fetchFacilities, fetchLaneRegistry, fetchOrderPlanningDecisions, fetchOrderPlanningHistory, fetchOrders, fetchPlanningResolution, generateOrderTestMeid, matchOrderToLane } from "../api/client";

type Order = { orderId: string; primaryReference: string; meid?: string; externalMeid?: string; poNumber?: string; materialTransferOrderNumber?: string; originId?: string; destinationId?: string; businessUnit?: string; earliestPickup?: string; latestDelivery?: string; status: string };
type Facility = { facilityId: string; siteId?: string; name: string; city?: string; state?: string };
type BusinessUnit = { id: string; name: string; status?: string };
type Partner = { id: string; name: string; scac?: string; partnerType?: string; status?: string };
type PlanningFinding = { category: string; severity: "BLOCKER" | "WARNING" | "INFO"; code: string; message: string };
type PlanningAward = { awardId: string; awardType: string; rate: number; currency: string; rateUnit: string; carrier: { name: string; scac?: string } };
type LaneCandidate = { laneId: string; laneName: string; laneType: string; score: number; disposition: "MATCH" | "REVIEW" | "INELIGIBLE"; findings: PlanningFinding[]; eligibleCarriers: { externalPartnerId: string; name: string; scac?: string }[]; activeAwards: PlanningAward[]; capacityRule?: { equipmentType: string; maxWeightLbs: number; maxPallets: number } };
type PlanningProposal = { proposalId: string; orderId: string; orderMeid?: string; outcome: "MATCHED" | "REVIEW_REQUIRED" | "NO_MATCH"; recommendedLaneId?: string; candidates: LaneCandidate[]; createdAt: string; schemaVersion?: string; matchingPolicyVersion?: string; contentHash?: string; integrity?: "VERIFIED" | "FAILED" | "LEGACY_UNVERIFIED"; supersedesProposalId?: string | null };
type PlanningDecision = { decisionId: string; proposalId: string; decision: "APPROVED" | "REJECTED"; reason?: string | null; plannedLoadId?: string | null; decidedAt: string };
type ResolutionOption = { optionId: string; actionType: string; title: string; explanation: string; operationalEffect: string; costEffect: string; executable: boolean; evidenceCodes: string[] };
type ResolutionAnalysis = { response: string; findings: Array<PlanningFinding & { laneId: string; laneName: string }>; options: ResolutionOption[] };
type ResolutionDraft = { draftId: string; option: ResolutionOption; integrity: string };
const empty = { primaryReference: "", poNumber: "", materialTransferOrderNumber: "", businessUnit: "", originId: "", destinationId: "", earliestPickup: "", latestDelivery: "", eachQuantity: "", caseQuantity: "", palletQuantity: "", weight: "", weightUom: "LBS", equipmentType: "53 FT DRY VAN", scac: "", modeType: "TL", orderType: "TRANSFER" };

export default function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [planningProposal, setPlanningProposal] = useState<PlanningProposal | null>(null);
  const [planningHistory, setPlanningHistory] = useState<PlanningProposal[]>([]);
  const [planningOrderId, setPlanningOrderId] = useState<string | null>(null);
  const [planningDecisions, setPlanningDecisions] = useState<PlanningDecision[]>([]);
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionPending, setDecisionPending] = useState(false);
  const [plannedLoadDisplayId, setPlannedLoadDisplayId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionAnalysis | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState<ResolutionDraft | null>(null);
  const [resolutionBusy, setResolutionBusy] = useState(false);
  const load = async () => { try { const [orderResult, facilityResult, registry] = await Promise.all([fetchOrders(), fetchFacilities(), fetchLaneRegistry()]); setOrders(orderResult.orders ?? []); setFacilities(facilityResult.facilities ?? []); setBusinessUnits(registry.businessUnits ?? []); setPartners((registry.partners ?? []).filter((partner: Partner) => partner.scac && partner.status !== "archived")); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load order setup data."); } };
  useEffect(() => { void load(); }, []);
  const facilityLookup = useMemo(() => {
    const lookup = new Map<string, Facility>();
    facilities.forEach((facility) => {
      lookup.set(facility.facilityId.toLowerCase(), facility);
      if (facility.siteId) lookup.set(facility.siteId.toLowerCase(), facility);
    });
    return lookup;
  }, [facilities]);
  const facilityLabel = (identifier?: string) => {
    if (!identifier) return "--";
    const facility = facilityLookup.get(identifier.toLowerCase());
    if (!facility) return identifier;
    return facility.siteId ? `${facility.name} (${facility.siteId})` : facility.name;
  };
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return !query ? orders : orders.filter((order) => [
      ...Object.values(order),
      facilityLabel(order.originId),
      facilityLabel(order.destinationId),
    ].join(" ").toLowerCase().includes(query));
  }, [orders, search, facilityLookup]);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const orderTimingError = form.earliestPickup && form.latestDelivery && Date.parse(form.latestDelivery) < Date.parse(form.earliestPickup)
    ? "Latest delivery must be at or after earliest pickup."
    : null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (orderTimingError) { setMessage(orderTimingError); return; }
    setMessage("Saving order...");
    try { await createOrder(form); setForm(empty); setMessage("Order saved and validated for planning."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save order."); }
  };
  const generateMeid = async (orderId: string) => { try { setMessage("Generating SIL test MEID..."); await generateOrderTestMeid(orderId); setMessage("SIL test MEID assigned."); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate test MEID."); } };
  const matchLane = async (orderId: string) => { try { setPlanningOrderId(orderId); setMessage("Scoring lane matches..."); const result = await matchOrderToLane(orderId); setPlanningProposal(result.proposal); setPlanningHistory((current) => [result.proposal, ...current.filter((proposal) => proposal.proposalId !== result.proposal.proposalId)]); setMessage("Lane match is ready for review."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not match this order to a lane."); } finally { setPlanningOrderId(null); } };
  const reviewPlan = async (orderId: string) => { try { setPlanningOrderId(orderId); setMessage("Loading planning review..."); const [result, decisionResult] = await Promise.all([fetchOrderPlanningHistory(orderId), fetchOrderPlanningDecisions(orderId)]); const proposals = result.proposals ?? []; setPlanningHistory(proposals); setPlanningProposal(proposals[0] ?? null); setPlanningDecisions(decisionResult.decisions ?? []); setPlannedLoadDisplayId(null); setDecisionReason(""); setMessage(proposals.length ? "Planning review loaded." : "No planning review is available for this order."); } catch (error) { setMessage(error instanceof Error ? error.message : "No planning review is available for this order."); } finally { setPlanningOrderId(null); } };
  const decidePlan = async (decision: "APPROVED" | "REJECTED") => {
    if (!planningProposal) return;
    try {
      setDecisionPending(true); setMessage(decision === "APPROVED" ? "Creating planned load..." : "Recording rejection...");
      const result = await decideOrderPlanningProposal(planningProposal.orderId, { proposalId: planningProposal.proposalId, decision, reason: decisionReason });
      setPlanningDecisions((current) => [result.decision, ...current.filter((item) => item.decisionId !== result.decision.decisionId)]);
      setPlannedLoadDisplayId(result.load?.displayId ?? null);
      setDecisionReason("");
      setMessage(result.load ? `Planned load ${result.load.displayId} created. It has not been tendered.` : "Planning rejection recorded. The order remains ready to plan.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not record the planning decision."); }
    finally { setDecisionPending(false); }
  };
  const openResolutionAssistant = async () => {
    if (!planningProposal) return;
    try { setResolutionBusy(true); setMessage("Reviewing planning evidence..."); setResolution(await fetchPlanningResolution(planningProposal.orderId)); setResolutionDraft(null); setMessage("SIL prepared resolution options from the current proposal."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Planning assistance is unavailable."); }
    finally { setResolutionBusy(false); }
  };
  const prepareResolution = async (optionId: string) => {
    if (!planningProposal) return;
    try { setResolutionBusy(true); const result = await createPlanningResolutionDraft(planningProposal.orderId, optionId); setResolutionDraft(result.draft); setMessage("Governed action draft prepared. Review it before approval."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not prepare the resolution."); }
    finally { setResolutionBusy(false); }
  };
  const decideResolution = async (decision: "APPROVED" | "REJECTED") => {
    if (!planningProposal || !resolutionDraft) return;
    try {
      setResolutionBusy(true);
      const result = await decidePlanningResolutionDraft(planningProposal.orderId, resolutionDraft.draftId, decision);
      if (result.proposal) { setPlanningProposal(result.proposal); setPlanningHistory((current) => [result.proposal, ...current]); setMessage("Approved correction applied and lane matching rerun. Review the new proposal."); }
      else setMessage("Resolution draft rejected. No planning data changed.");
      setResolution(null); setResolutionDraft(null); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not decide the resolution."); }
    finally { setResolutionBusy(false); }
  };
  const recommendedCandidate = planningProposal?.candidates.find((candidate) => candidate.laneId === planningProposal.recommendedLaneId);
  const proposalDecision = planningProposal ? planningDecisions.find((decision) => decision.proposalId === planningProposal.proposalId) : undefined;
  const isLatestProposal = planningProposal?.proposalId === planningHistory[0]?.proposalId;
  return <div className="data-intake">
    <section className="transport-hero intake-hero"><div><p className="transport-eyebrow">Order management</p><h2>Orders</h2><p>Create and review demand before it is consolidated into loads, assigned to lanes, or tendered.</p></div></section>
    <details className="transport-panel facility-manual-entry"><summary><span><span className="transport-eyebrow">Manual entry</span><strong>Create an order</strong></span><span className="facility-manual-toggle">Open form</span></summary>
      <form onSubmit={submit} className="lane-form-grid">
        {([['primaryReference','Primary reference'],['poNumber','PO number'],['materialTransferOrderNumber','Transfer order number']] as const).map(([field,label]) => <label key={field}>{label}<input required={field === 'primaryReference'} value={form[field]} onChange={(e) => update(field,e.target.value)} /></label>)}
        <label>Business unit<select required value={form.businessUnit} onChange={(e) => update('businessUnit',e.target.value)}><option value="">Select business unit</option>{businessUnits.map((unit) => <option key={unit.id} value={unit.name}>{unit.name}</option>)}</select></label>
        <label>Origin<input required list="order-origin-facilities" placeholder="Search facilities" value={form.originId} onChange={(e) => update('originId',e.target.value)} /><datalist id="order-origin-facilities">{facilities.map((facility) => <option key={facility.facilityId} value={facility.siteId || facility.facilityId}>{facility.name}{facility.city ? ` - ${facility.city}, ${facility.state}` : ''}</option>)}</datalist></label>
        <label>Destination<input required list="order-destination-facilities" placeholder="Search facilities" value={form.destinationId} onChange={(e) => update('destinationId',e.target.value)} /><datalist id="order-destination-facilities">{facilities.map((facility) => <option key={facility.facilityId} value={facility.siteId || facility.facilityId}>{facility.name}{facility.city ? ` - ${facility.city}, ${facility.state}` : ''}</option>)}</datalist></label>
        <label>Earliest pickup (Req Ship Date)<input className="order-datetime-input" required type="datetime-local" value={form.earliestPickup} onChange={(e) => update('earliestPickup',e.target.value)} /></label>
        <label>Latest delivery<input aria-invalid={Boolean(orderTimingError)} className="order-datetime-input" required min={form.earliestPickup || undefined} type="datetime-local" value={form.latestDelivery} onChange={(e) => update('latestDelivery',e.target.value)} />{orderTimingError && <small role="alert">{orderTimingError}</small>}</label>
        <label>Each quantity<input min="0" step="1" type="number" value={form.eachQuantity} onChange={(e) => update('eachQuantity',e.target.value)} /></label>
        <label>Case quantity<input min="0" step="1" type="number" value={form.caseQuantity} onChange={(e) => update('caseQuantity',e.target.value)} /></label>
        <label>Pallet quantity<input min="0" step="1" type="number" value={form.palletQuantity} onChange={(e) => update('palletQuantity',e.target.value)} /></label>
        <label>Weight<input min="0" step="any" type="number" value={form.weight} onChange={(e) => update('weight',e.target.value)} /></label>
        <label>Weight UOM<select value={form.weightUom} onChange={(e) => update('weightUom',e.target.value)}><option value="LBS">LBS</option><option value="KG">Kg</option></select></label>
        <label>SCAC<select value={form.scac} onChange={(e) => update('scac',e.target.value)}><option value="">Select registered carrier</option>{partners.map((partner) => <option key={partner.id} value={partner.scac}>{partner.scac} - {partner.name}</option>)}</select></label>
        <label>Equipment<select value={form.equipmentType} onChange={(e) => update('equipmentType',e.target.value)}><option>53 FT DRY VAN</option><option>26 FT DRY VAN</option><option>BOX TRUCK</option></select></label>
        <label>Mode<select value={form.modeType} onChange={(e) => update('modeType',e.target.value)}><option>TL</option><option>LTL</option></select></label>
        <label>Order type<select value={form.orderType} onChange={(e) => update('orderType',e.target.value)}><option>TRANSFER</option><option>INBOUND</option><option>ADHOC</option></select></label>
        <div className="intake-actions"><button className="btn btn-primary" type="submit">Create order</button></div>
      </form>
    </details>
    <section className="transport-panel"><div className="transport-panel-header"><div><p className="transport-eyebrow">Planning queue</p><h3>Orders on file</h3></div><span>{filtered.length}</span></div>
      <label className="facility-search"><span>Search orders</span><input type="search" placeholder="Reference, site, business unit, SCAC, or status" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      {message && <p className="ops-note">{message}</p>}
      <div className="transport-table-wrap"><table className="transport-table"><thead><tr><th>SIL test MEID</th><th>Reference</th><th>PO / TO</th><th>Route</th><th>Business unit</th><th>Pickup</th><th>Delivery</th><th>Status</th><th>Planning</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.orderId}><td>{order.meid || <button className="btn btn-secondary" type="button" onClick={() => void generateMeid(order.orderId)}>Generate</button>}</td><td>{order.primaryReference}</td><td>{order.poNumber || order.materialTransferOrderNumber || '--'}</td><td>{facilityLabel(order.originId)} to {facilityLabel(order.destinationId)}</td><td>{order.businessUnit || '--'}</td><td>{order.earliestPickup || '--'}</td><td>{order.latestDelivery || '--'}</td><td>{order.status.replaceAll('_',' ')}</td><td><div className="order-planning-actions"><button className="btn btn-primary" disabled={order.status !== "READY_TO_PLAN" || planningOrderId === order.orderId} type="button" onClick={() => void matchLane(order.orderId)}>{planningOrderId === order.orderId ? "Matching..." : "Match lane"}</button><button className="btn btn-secondary" disabled={planningOrderId === order.orderId} type="button" onClick={() => void reviewPlan(order.orderId)}>Review plan</button></div></td></tr>)}</tbody></table></div>
      {!filtered.length && <p className="ops-note">No matching orders are on file. Use manual entry here or stage a CSV or Excel file in Data intake.</p>}
    </section>
    {planningProposal && <section className="transport-panel order-planning-review"><div className="transport-panel-header"><div><p className="transport-eyebrow">Governed planning review</p><h3>Order {planningProposal.orderMeid || planningProposal.orderId}</h3></div><span className={`planning-outcome ${planningProposal.outcome.toLowerCase()}`}>{planningProposal.outcome.replaceAll('_', ' ')}</span></div>
      <div className="planning-audit-bar"><span>Proposal <strong>{planningProposal.proposalId}</strong></span><span>Policy <strong>{planningProposal.matchingPolicyVersion || 'Legacy'}</strong></span><span>Integrity <strong className={(planningProposal.integrity || 'verified').toLowerCase()}>{planningProposal.integrity || 'VERIFIED'}</strong></span><span>Created <strong>{new Date(planningProposal.createdAt).toLocaleString()}</strong></span><span>History <strong>{planningHistory.length || 1}</strong></span></div>
      {recommendedCandidate ? <div className="planning-recommendation"><div><span>Recommended lane</span><strong>{recommendedCandidate.laneName}</strong><small>{recommendedCandidate.laneType.replaceAll('_', ' ')}</small></div><div><span>Match score</span><strong>{recommendedCandidate.score}</strong><small>{recommendedCandidate.disposition}</small></div><div><span>Equipment capacity</span><strong>{recommendedCandidate.capacityRule?.equipmentType || 'Not configured'}</strong><small>{recommendedCandidate.capacityRule ? `${recommendedCandidate.capacityRule.maxWeightLbs.toLocaleString()} LBS / ${recommendedCandidate.capacityRule.maxPallets} pallets` : 'Review required'}</small></div><div><span>Eligible carriers</span><strong>{recommendedCandidate.eligibleCarriers.length}</strong><small>{recommendedCandidate.eligibleCarriers.map((carrier) => carrier.scac || carrier.name).join(', ') || 'None assigned'}</small></div><div><span>Active awards</span><strong>{recommendedCandidate.activeAwards.length}</strong><small>{recommendedCandidate.activeAwards.map((award) => `${award.carrier.scac || award.carrier.name} ${award.currency} ${award.rate} ${award.rateUnit.replaceAll('_', ' ').toLowerCase()}`).join(' | ') || 'No active award'}</small></div></div> : <p className="ops-note">No lane passed the required route, business-unit, service, mode, equipment, and effective-date checks.</p>}
      <div className="planning-candidates">{planningProposal.candidates.map((candidate) => <article key={candidate.laneId} className={candidate.laneId === planningProposal.recommendedLaneId ? 'recommended' : ''}><header><div><strong>{candidate.laneName}</strong><span>{candidate.laneType.replaceAll('_', ' ')}</span></div><b>{candidate.score}</b></header><div className="planning-findings">{candidate.findings.length ? candidate.findings.map((finding) => <p key={`${finding.code}-${finding.message}`} className={finding.severity.toLowerCase()}><span>{finding.severity}</span>{finding.message}</p>) : <p className="info"><span>MATCH</span>All current lane requirements matched.</p>}</div></article>)}</div>
      <div className="planning-decision-panel"><div><span>Planning Resolution Assistant</span><strong>Resolve blockers without changing evidence</strong><small>The assistant reads this verified proposal and prepares corrections for explicit approval.</small></div><button className="btn btn-secondary" type="button" disabled={resolutionBusy || planningProposal.integrity !== "VERIFIED"} onClick={() => void openResolutionAssistant()}>{resolutionBusy ? "Reviewing..." : "Ask SIL Agent"}</button></div>
      {resolution && <div className="planning-resolution-assistant"><p className="ops-note">{resolution.response}</p><div className="planning-candidates">{resolution.options.map((option) => <article key={option.optionId}><header><div><strong>{option.title}</strong><span>{option.actionType.replaceAll('_', ' ')}</span></div><b>{option.executable ? 'READY' : 'REVIEW'}</b></header><div className="planning-findings"><p className="info"><span>OPERATIONS</span>{option.operationalEffect}</p><p className="warning"><span>COST</span>{option.costEffect}</p></div><p>{option.explanation}</p><button className="btn btn-secondary" type="button" disabled={resolutionBusy} onClick={() => void prepareResolution(option.optionId)}>Prepare this resolution</button></article>)}</div></div>}
      {resolutionDraft && <div className="planning-decision-panel"><div><span>Governed action draft</span><strong>{resolutionDraft.option.title}</strong><small>{resolutionDraft.option.executable ? "Approval will apply the correction and create a new linked proposal." : "This option needs an additional workflow before SIL can execute it."}</small></div><div className="planning-decision-actions"><button className="btn btn-secondary" type="button" disabled={resolutionBusy} onClick={() => void decideResolution("REJECTED")}>Reject</button><button className="btn btn-primary" type="button" disabled={resolutionBusy || !resolutionDraft.option.executable || resolutionDraft.integrity !== "VERIFIED"} onClick={() => void decideResolution("APPROVED")}>Approve and rerun match</button></div></div>}
      <div className="planning-decision-panel">
        <div><span>Planning decision</span><strong>{proposalDecision ? proposalDecision.decision : "Awaiting review"}</strong><small>{proposalDecision ? `${new Date(proposalDecision.decidedAt).toLocaleString()}${proposalDecision.reason ? ` | ${proposalDecision.reason}` : ""}` : "Approval creates a planned load only. Tendering remains a separate step."}</small>{plannedLoadDisplayId && <small>Created load: {plannedLoadDisplayId}</small>}</div>
        {!proposalDecision && isLatestProposal && <><label>Decision note<textarea rows={2} placeholder="Required for rejection; optional for approval" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} /></label><div className="planning-decision-actions"><button className="btn btn-secondary" type="button" disabled={decisionPending || !decisionReason.trim()} onClick={() => void decidePlan("REJECTED")}>Reject proposal</button><button className="btn btn-primary" type="button" disabled={decisionPending || planningProposal.integrity !== "VERIFIED" || !recommendedCandidate || !recommendedCandidate.activeAwards.length} onClick={() => void decidePlan("APPROVED")}>{decisionPending ? "Recording..." : "Approve and create load"}</button></div></>}
        {!proposalDecision && !isLatestProposal && <small>Historical proposals remain available for audit but cannot be decided.</small>}
      </div>
      {planningHistory.length > 1 && <div className="planning-history"><span>Proposal history</span>{planningHistory.map((proposal) => <button className={proposal.proposalId === planningProposal.proposalId ? 'active' : ''} key={proposal.proposalId} type="button" onClick={() => setPlanningProposal(proposal)}><strong>{new Date(proposal.createdAt).toLocaleString()}</strong><small>{proposal.outcome.replaceAll('_', ' ')} | {proposal.integrity || 'LEGACY UNVERIFIED'}</small></button>)}</div>}
    </section>}
  </div>;
}
