import React, { useEffect, useMemo, useState } from "react";
import { addLaneEligibility, createLane, createLaneAward, fetchFacilities, fetchLaneRegistry } from "../api/client";

type LaneType = "LINEHAUL" | "FINAL_MILE" | "INBOUND" | "ADHOC";
type Facility = { facilityId: string; name: string; siteId?: string; city: string; state: string; facilityType: string };
type Partner = { id: string; name: string; scac?: string; partnerType?: string; status?: string };
type Lane = { laneId: string; name: string; laneType: LaneType; originFacilityId: string; destinationFacilityId: string; equipmentType?: string; frequency?: string; transitDays?: number; standardOriginDepartureTime?: string; standardCarrierArrivalStart?: string; standardCarrierArrivalEnd?: string; effectiveFrom?: string; effectiveTo?: string; notes?: string; adhocReason?: string; status: string; createdAt: string };
type Eligibility = { eligibilityId: string; laneId: string; externalPartnerId: string; notes?: string; status: string };
type Award = { awardId: string; laneId: string; externalPartnerId: string; awardType: "PRIMARY" | "BACKUP" | "SPOT"; rate: number; currency: string; rateUnit: string; capacity?: number; effectiveFrom: string; effectiveTo?: string; status: "ACTIVE" | "SUPERSEDED"; createdAt: string };

const laneTypes: Array<{ key: LaneType; label: string }> = [
  { key: "LINEHAUL", label: "Linehaul" }, { key: "FINAL_MILE", label: "Final mile" },
  { key: "INBOUND", label: "Inbound" }, { key: "ADHOC", label: "Adhoc" },
];
const emptyLane = { name: "", originFacilityId: "", destinationFacilityId: "", equipmentType: "", frequency: "", transitDays: "", standardOriginDepartureTime: "", standardCarrierArrivalStart: "", standardCarrierArrivalEnd: "", effectiveFrom: "", effectiveTo: "", notes: "", adhocReason: "CARRIER_COVERAGE" };
const emptyAward = { externalPartnerId: "", awardType: "PRIMARY", rate: "", rateUnit: "PER_LOAD", capacity: "", effectiveFrom: "", effectiveTo: "", notes: "" };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const label = (value?: string) => String(value || "").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase());

export default function PlanningPanel() {
  const [activeType, setActiveType] = useState<LaneType>("LINEHAUL");
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [selectedLaneId, setSelectedLaneId] = useState("");
  const [creating, setCreating] = useState(false);
  const [laneDraft, setLaneDraft] = useState(emptyLane);
  const [eligiblePartnerId, setEligiblePartnerId] = useState("");
  const [awardDraft, setAwardDraft] = useState(emptyAward);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [registry, facilityResult] = await Promise.all([fetchLaneRegistry(), fetchFacilities()]);
    setLanes(registry.lanes ?? []); setEligibility(registry.eligibility ?? []); setAwards(registry.awards ?? []);
    setPartners(registry.partners ?? []); setFacilities(facilityResult.facilities ?? []);
  };
  useEffect(() => { void load().catch((error) => setStatus(error instanceof Error ? error.message : "Lane registry unavailable.")); }, []);

  const visibleLanes = useMemo(() => lanes.filter((lane) => lane.laneType === activeType), [lanes, activeType]);
  const selectedLane = lanes.find((lane) => lane.laneId === selectedLaneId) ?? visibleLanes[0];
  const facilityMap = useMemo(() => new Map(facilities.map((facility) => [facility.facilityId, facility])), [facilities]);
  const partnerMap = useMemo(() => new Map(partners.map((partner) => [partner.id, partner])), [partners]);
  const laneEligibility = selectedLane ? eligibility.filter((item) => item.laneId === selectedLane.laneId) : [];
  const laneAwards = selectedLane ? awards.filter((item) => item.laneId === selectedLane.laneId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const eligiblePartnerIds = new Set(laneEligibility.map((item) => item.externalPartnerId));
  const availablePartners = partners.filter((partner) => !eligiblePartnerIds.has(partner.id));

  const chooseType = (type: LaneType) => { setActiveType(type); setSelectedLaneId(""); setCreating(false); setStatus(""); };
  const saveLane = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setBusy(true); setStatus("Creating lane profile...");
      const result = await createLane({ ...laneDraft, laneType: activeType, transitDays: laneDraft.transitDays === "" ? undefined : Number(laneDraft.transitDays), adhocReason: activeType === "ADHOC" ? laneDraft.adhocReason : undefined });
      await load(); setSelectedLaneId(result.lane.laneId); setLaneDraft(emptyLane); setCreating(false);
      setStatus("Lane profile created. Add eligible carriers before recording an award.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Lane creation failed."); }
    finally { setBusy(false); }
  };
  const addEligibility = async () => {
    if (!selectedLane || !eligiblePartnerId) return;
    try { setBusy(true); await addLaneEligibility(selectedLane.laneId, { externalPartnerId: eligiblePartnerId }); setEligiblePartnerId(""); await load(); setStatus("Carrier added to this lane's eligible network."); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Eligibility update failed."); }
    finally { setBusy(false); }
  };
  const saveAward = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedLane) return;
    try {
      setBusy(true); await createLaneAward(selectedLane.laneId, { ...awardDraft, rate: Number(awardDraft.rate), capacity: awardDraft.capacity === "" ? undefined : Number(awardDraft.capacity) });
      setAwardDraft(emptyAward); await load();
      setStatus("Award recorded. Any prior active award of the same type remains in rate history as superseded.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Award creation failed."); }
    finally { setBusy(false); }
  };

  const origin = selectedLane ? facilityMap.get(selectedLane.originFacilityId) : undefined;
  const destination = selectedLane ? facilityMap.get(selectedLane.destinationFacilityId) : undefined;

  return <div className="lane-registry">
    <section className="transport-hero lane-hero">
      <div><p className="transport-eyebrow">Network planning</p><h2>Loads & lanes</h2><p>Build reusable lanes from facilities, then connect eligible carriers and governed awards.</p></div>
      <div className="lane-metrics"><div><span>Lanes</span><strong>{lanes.length}</strong></div><div><span>Eligible links</span><strong>{eligibility.length}</strong></div><div><span>Active awards</span><strong>{awards.filter((award) => award.status === "ACTIVE").length}</strong></div></div>
    </section>
    <div className="lane-type-tabs" role="tablist" aria-label="Lane types">{laneTypes.map((type) => <button key={type.key} type="button" className={activeType === type.key ? "active" : ""} onClick={() => chooseType(type.key)}>{type.label}<span>{lanes.filter((lane) => lane.laneType === type.key).length}</span></button>)}</div>
    {status ? <div className="ops-inline-alert lane-status">{status}</div> : null}
    {creating ? <form className="transport-panel lane-create-form" onSubmit={saveLane}>
      <div className="transport-panel-header"><div><p className="transport-eyebrow">New {label(activeType)} lane</p><h3>Create lane profile</h3></div><button className="btn btn-secondary" type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      {facilities.length < 2 ? <p className="ops-inline-alert">Add at least two facilities before creating a lane.</p> : null}
      <div className="lane-form-grid">
        <label>Lane name<input required value={laneDraft.name} onChange={(e) => setLaneDraft({ ...laneDraft, name: e.target.value })} placeholder="Example: WK01OriginToDestination" /></label>
        <label>Origin facility<select required value={laneDraft.originFacilityId} onChange={(e) => setLaneDraft({ ...laneDraft, originFacilityId: e.target.value })}><option value="">Select origin</option>{facilities.map((facility) => <option key={facility.facilityId} value={facility.facilityId}>{facility.name} | {facility.city}, {facility.state}</option>)}</select></label>
        <label>Destination facility<select required value={laneDraft.destinationFacilityId} onChange={(e) => setLaneDraft({ ...laneDraft, destinationFacilityId: e.target.value })}><option value="">Select destination</option>{facilities.map((facility) => <option key={facility.facilityId} value={facility.facilityId}>{facility.name} | {facility.city}, {facility.state}</option>)}</select></label>
        <label>Equipment<input value={laneDraft.equipmentType} onChange={(e) => setLaneDraft({ ...laneDraft, equipmentType: e.target.value })} placeholder="53 ft dry van" /></label>
        <label>Operating frequency<input value={laneDraft.frequency} onChange={(e) => setLaneDraft({ ...laneDraft, frequency: e.target.value })} placeholder="Monday-Friday" /></label>
        <label>Transit days<input type="number" min="0" max="60" step="0.5" value={laneDraft.transitDays} onChange={(e) => setLaneDraft({ ...laneDraft, transitDays: e.target.value })} /></label>
        {activeType === "LINEHAUL" ? <>
          <label>Standard origin departure time<input type="time" value={laneDraft.standardOriginDepartureTime} onChange={(e) => setLaneDraft({ ...laneDraft, standardOriginDepartureTime: e.target.value })} /></label>
          <label>Carrier arrival / load start<input type="time" value={laneDraft.standardCarrierArrivalStart} onChange={(e) => setLaneDraft({ ...laneDraft, standardCarrierArrivalStart: e.target.value })} /></label>
          <label>Carrier arrival window end<input type="time" value={laneDraft.standardCarrierArrivalEnd} onChange={(e) => setLaneDraft({ ...laneDraft, standardCarrierArrivalEnd: e.target.value })} /></label>
        </> : null}
        <label>Effective from<input type="date" value={laneDraft.effectiveFrom} onChange={(e) => setLaneDraft({ ...laneDraft, effectiveFrom: e.target.value })} /></label>
        <label>Effective through<input type="date" value={laneDraft.effectiveTo} onChange={(e) => setLaneDraft({ ...laneDraft, effectiveTo: e.target.value })} /></label>
        {activeType === "ADHOC" ? <label>Adhoc purpose<select value={laneDraft.adhocReason} onChange={(e) => setLaneDraft({ ...laneDraft, adhocReason: e.target.value })}><option value="CARRIER_COVERAGE">Carrier coverage</option><option value="SPECIAL_PROJECT">Special project</option><option value="VOLUME_CAPACITY">Volume capacity</option></select></label> : null}
        <label className="lane-form-wide">Operating notes<textarea value={laneDraft.notes} onChange={(e) => setLaneDraft({ ...laneDraft, notes: e.target.value })} placeholder="Appointments, equipment constraints, or service expectations" /></label>
      </div><div className="lane-form-actions"><button className="btn btn-primary" disabled={busy || facilities.length < 2}>Create lane</button></div>
    </form> : <div className="lane-workbench">
      <aside className="lane-list-pane"><div className="lane-pane-heading"><div><span>{label(activeType)}</span><strong>Lane profiles</strong></div><button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>New lane</button></div>
        <div className="lane-list">{visibleLanes.length ? visibleLanes.map((lane) => { const from = facilityMap.get(lane.originFacilityId); const to = facilityMap.get(lane.destinationFacilityId); return <button type="button" key={lane.laneId} className={selectedLane?.laneId === lane.laneId ? "active" : ""} onClick={() => setSelectedLaneId(lane.laneId)}><strong>{lane.name}</strong><span>{from?.siteId || from?.name || "Origin"} to {to?.siteId || to?.name || "Destination"}</span><small>{eligibility.filter((item) => item.laneId === lane.laneId).length} eligible | {awards.filter((item) => item.laneId === lane.laneId && item.status === "ACTIVE").length} active awards</small></button>; }) : <div className="lane-empty"><strong>No {label(activeType)} lanes</strong><p>Create the first lane from locations already on file.</p></div>}</div>
      </aside>
      <section className="lane-detail-pane">{selectedLane ? <>
        <header className="lane-profile-header"><div><p className="transport-eyebrow">{label(selectedLane.laneType)} lane</p><h3>{selectedLane.name}</h3></div><span className="ops-status-pill">{selectedLane.status}</span></header>
        <div className="lane-route-web"><article><span>Origin</span><strong>{origin?.name || "Unknown facility"}</strong><p>{origin?.siteId ? `${origin.siteId} | ` : ""}{origin?.city}, {origin?.state}</p></article><div className="lane-route-connector"><span>{selectedLane.equipmentType || "Any equipment"}</span><strong>→</strong><small>{selectedLane.transitDays !== undefined ? `${selectedLane.transitDays} day transit` : "Transit not set"}</small></div><article><span>Destination</span><strong>{destination?.name || "Unknown facility"}</strong><p>{destination?.siteId ? `${destination.siteId} | ` : ""}{destination?.city}, {destination?.state}</p></article></div>
        <div className="lane-profile-facts"><div><span>Frequency</span><strong>{selectedLane.frequency || "Not set"}</strong></div><div><span>Effective period</span><strong>{selectedLane.effectiveFrom || "Open"} to {selectedLane.effectiveTo || "Open"}</strong></div>{selectedLane.laneType === "LINEHAUL" ? <><div><span>Origin departure</span><strong>{selectedLane.standardOriginDepartureTime || "Not set"}</strong></div><div><span>Carrier arrival / load start</span><strong>{selectedLane.standardCarrierArrivalStart && selectedLane.standardCarrierArrivalEnd ? `${selectedLane.standardCarrierArrivalStart} to ${selectedLane.standardCarrierArrivalEnd}` : "Not set"}</strong></div></> : null}{selectedLane.adhocReason ? <div><span>Adhoc purpose</span><strong>{label(selectedLane.adhocReason)}</strong></div> : null}</div>
        <section className="lane-relationship-section"><div className="lane-section-heading"><div><span>Carrier network</span><h4>Eligible carriers</h4></div><div className="lane-inline-form"><select value={eligiblePartnerId} onChange={(e) => setEligiblePartnerId(e.target.value)}><option value="">Select registered carrier</option>{availablePartners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}{partner.scac ? ` (${partner.scac})` : ""}</option>)}</select><button className="btn btn-secondary" type="button" disabled={!eligiblePartnerId || busy} onClick={addEligibility}>Add eligibility</button></div></div>
          <div className="lane-chip-list">{laneEligibility.length ? laneEligibility.map((item) => { const partner = partnerMap.get(item.externalPartnerId); return <span key={item.eligibilityId}>{partner?.name || "Registered carrier"}{partner?.scac ? ` | ${partner.scac}` : ""}</span>; }) : <p>No carriers are eligible yet. Eligibility controls who may later receive tenders for this lane.</p>}</div>
        </section>
        <section className="lane-relationship-section"><div className="lane-section-heading"><div><span>Commercial relationship</span><h4>Create carrier award</h4></div></div>
          <form className="lane-award-form" onSubmit={saveAward}><label>Eligible carrier<select required value={awardDraft.externalPartnerId} onChange={(e) => setAwardDraft({ ...awardDraft, externalPartnerId: e.target.value })}><option value="">Select carrier</option>{laneEligibility.map((item) => { const partner = partnerMap.get(item.externalPartnerId); return <option key={item.externalPartnerId} value={item.externalPartnerId}>{partner?.name || item.externalPartnerId}</option>; })}</select></label><label>Award position<select value={awardDraft.awardType} onChange={(e) => setAwardDraft({ ...awardDraft, awardType: e.target.value })}><option value="PRIMARY">Primary</option><option value="BACKUP">Backup</option><option value="SPOT">Spot</option></select></label><label>Locked rate<input required type="number" min="0.01" step="0.01" value={awardDraft.rate} onChange={(e) => setAwardDraft({ ...awardDraft, rate: e.target.value })} /></label><label>Rate basis<select value={awardDraft.rateUnit} onChange={(e) => setAwardDraft({ ...awardDraft, rateUnit: e.target.value })}><option value="PER_LOAD">Per load</option><option value="PER_MILE">Per mile</option><option value="FLAT">Flat</option></select></label><label>Capacity / week<input type="number" min="0" step="1" value={awardDraft.capacity} onChange={(e) => setAwardDraft({ ...awardDraft, capacity: e.target.value })} /></label><label>Effective from<input required type="date" value={awardDraft.effectiveFrom} onChange={(e) => setAwardDraft({ ...awardDraft, effectiveFrom: e.target.value })} /></label><label>Effective through<input type="date" value={awardDraft.effectiveTo} onChange={(e) => setAwardDraft({ ...awardDraft, effectiveTo: e.target.value })} /></label><button className="btn btn-primary" disabled={busy || !laneEligibility.length}>Record award</button></form>
          <div className="lane-award-history"><div className="lane-award-row lane-award-head"><span>Carrier</span><span>Position</span><span>Rate</span><span>Effective</span><span>Status</span></div>{laneAwards.length ? laneAwards.map((award) => <div className="lane-award-row" key={award.awardId}><strong>{partnerMap.get(award.externalPartnerId)?.name || "Carrier"}</strong><span>{label(award.awardType)}</span><span>{money(award.rate)} / {label(award.rateUnit)}</span><span>{award.effectiveFrom} to {award.effectiveTo || "Open"}</span><span className="namespace-status">{label(award.status)}</span></div>) : <p className="ops-muted">No awards recorded. Rate history will remain here as awards change.</p>}</div>
        </section>
      </> : <div className="lane-empty lane-detail-empty"><strong>Select or create a lane</strong><p>Each lane becomes a connected profile of facilities, eligible carriers, awards, rates, and future tender activity.</p></div>}</section>
    </div>}
  </div>;
}
