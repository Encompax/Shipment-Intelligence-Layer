import React, { useEffect, useMemo, useRef, useState } from "react";
import { addLaneEligibility, createLane, createLaneAward, fetchFacilities, fetchLaneRegistry } from "../api/client";

type LaneType = "LINEHAUL" | "FINAL_MILE" | "INBOUND" | "ADHOC";
type Facility = { facilityId: string; name: string; siteId?: string; city: string; state: string; facilityType: string };
type Partner = { id: string; name: string; scac?: string; partnerType?: string; status?: string };
type BusinessUnit = { id: string; name: string; status?: string };
type Lane = { laneId: string; name: string; laneType: LaneType; originFacilityId: string; destinationFacilityId: string; businessUnitId?: string; businessUnitName?: string; equipmentType?: string; loadAssumption?: "TL" | "LTL"; frequency?: string; dispatchDays?: string[]; transitDays?: number; terminalArrivalDays?: string[]; terminalArrivalStart?: string; terminalArrivalEnd?: string; downlineCarrierTerminalFacilityId?: string; storeDeliveryDays?: string[]; standardOriginDepartureTime?: string; standardCarrierArrivalStart?: string; standardCarrierArrivalEnd?: string; effectiveFrom?: string; effectiveTo?: string; notes?: string; adhocReason?: string; adhocMode?: string; parentLaneId?: string; maxUsesPerWeek?: number; responseDeadlineHours?: number; rateCap?: number; status: string; createdAt: string };
type Eligibility = { eligibilityId: string; laneId: string; externalPartnerId: string; notes?: string; status: string };
type Award = { awardId: string; laneId: string; externalPartnerId: string; awardType: "PRIMARY" | "BACKUP" | "SPOT"; rate: number; currency: string; rateUnit: string; capacity?: number; effectiveFrom: string; effectiveTo?: string; status: "ACTIVE" | "SUPERSEDED"; createdAt: string };

const laneTypes: Array<{ key: LaneType; label: string }> = [
  { key: "LINEHAUL", label: "Linehaul" }, { key: "FINAL_MILE", label: "Final mile" },
  { key: "INBOUND", label: "Inbound" }, { key: "ADHOC", label: "Adhoc" },
];
const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const emptyLane = { name: "", originFacilityId: "", destinationFacilityId: "", businessUnitId: "", equipmentType: "", frequency: "1WEEKLY", dispatchDays: [] as string[], terminalArrivalDays: [] as string[], terminalArrivalStart: "", terminalArrivalEnd: "", downlineCarrierTerminalFacilityId: "", storeDeliveryDays: [] as string[], standardOriginDepartureTime: "", standardCarrierArrivalStart: "", standardCarrierArrivalEnd: "", effectiveFrom: "", effectiveTo: "", notes: "", adhocReason: "CARRIER_COVERAGE", adhocMode: "ONE_TIME", parentLaneId: "", maxUsesPerWeek: "", responseDeadlineHours: "", rateCap: "" };
const emptyAward = { externalPartnerId: "", awardType: "PRIMARY", rate: "", rateUnit: "PER_LOAD", capacity: "", effectiveFrom: "", effectiveTo: "", notes: "" };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const label = (value?: string) => String(value || "").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\w/g, (c) => c.toUpperCase());

function FacilitySearchSelect({ fieldKey, labelText, value, facilities, onChange }: { fieldKey: string; labelText: string; value: string; facilities: Facility[]; onChange: (value: string) => void }) {
  const selected = facilities.find((facility) => facility.facilityId === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const normalized = query.trim().toLowerCase();
  const matches = facilities.filter((facility) => !normalized || [facility.name, facility.siteId, facility.city, facility.state, facility.facilityType].some((part) => String(part || "").toLowerCase().includes(normalized)));
  const display = selected && !open ? `${selected.name} | ${selected.city}, ${selected.state}` : query;
  return <label className="lane-facility-field">{labelText}
    <div className="lane-facility-combobox">
      <input role="combobox" aria-expanded={open} aria-controls={`lane-${fieldKey}-options`} autoComplete="off" required value={display} placeholder="Search" onFocus={() => { setQuery(""); setOpen(true); }} onChange={(event) => { setQuery(event.target.value); onChange(""); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 120)} />
      {open ? <div className="lane-facility-options" id={`lane-${fieldKey}-options`} role="listbox">
        {matches.length ? matches.slice(0, 30).map((facility) => <button key={facility.facilityId} type="button" role="option" aria-selected={facility.facilityId === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(facility.facilityId); setQuery(""); setOpen(false); }}><strong>{facility.name}</strong><span>{facility.siteId ? `${facility.siteId} | ` : ""}{facility.city}, {facility.state}</span></button>) : <span className="lane-facility-empty">No matching locations</span>}
      </div> : null}
    </div>
  </label>;
}

function WeekdayPicker({ legend, value, onChange, guidance = "Select one or more days." }: { legend: string; value: string[]; onChange: (value: string[]) => void; guidance?: string }) {
  return <fieldset className="lane-dispatch-days lane-form-wide"><legend>{legend}</legend>{weekdays.map((day) => { const checked = value.includes(day); return <label key={day}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked ? [...value, day] : value.filter((item) => item !== day))} /><span>{label(day).slice(0, 3)}</span></label>; })}<small>{guidance}</small></fieldset>;
}

function TimePicker({ labelText, value, onChange }: { labelText: string; value: string; onChange: (value: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const parsedHour = value ? Number(value.slice(0, 2)) : 8;
  const hour = parsedHour % 12 || 12;
  const minute = value ? value.slice(3, 5) : "00";
  const period = parsedHour >= 12 ? "PM" : "AM";
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const update = (nextHour = hour, nextMinute = minute, nextPeriod = period) => {
    const hour24 = nextPeriod === "PM" ? (nextHour % 12) + 12 : nextHour % 12;
    onChange(`${String(hour24).padStart(2, "0")}:${nextMinute}`);
  };
  return <div className="lane-time-field"><span>{labelText}</span><div className="lane-time-picker" ref={root}>
    <input readOnly value={value} placeholder="HH:MM" onClick={() => setOpen(true)} />
    <button className="lane-time-trigger" type="button" aria-label={`Choose ${labelText.toLowerCase()}`} aria-expanded={open} title="Choose time" onClick={() => setOpen((current) => !current)} />
    {open ? <div className="lane-time-menu" role="group" aria-label={`${labelText} time`}>
      <div><span>Hour</span><select size={6} value={String(hour)} onChange={(event) => update(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{String(item).padStart(2, "0")}</option>)}</select></div>
      <div><span>Minute</span><select size={6} value={minute} onChange={(event) => update(hour, event.target.value)}>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <div><span>Period</span><select size={2} value={period} onChange={(event) => update(hour, minute, event.target.value)}><option>AM</option><option>PM</option></select></div>
      <button type="button" className="lane-time-done" onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (!value) update(); setOpen(false); }}>Done</button>
    </div> : null}
  </div></div>;
}

export default function PlanningPanel() {
  const [activeType, setActiveType] = useState<LaneType>("LINEHAUL");
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
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
    setPartners(registry.partners ?? []); setBusinessUnits(registry.businessUnits ?? []); setFacilities(facilityResult.facilities ?? []);
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
  const requiredDispatchDayCount = laneDraft.frequency === "DAILY" ? 7 : /^([1-4])WEEKLY$/.test(laneDraft.frequency) ? Number(laneDraft.frequency[0]) : 0;
  const dispatchScheduleValid = laneDraft.dispatchDays.length > 0 && (!requiredDispatchDayCount || laneDraft.dispatchDays.length === requiredDispatchDayCount);
  const terminalScheduleValid = laneDraft.terminalArrivalDays.length > 0 && (activeType === "FINAL_MILE" || (laneDraft.terminalArrivalStart !== "" && laneDraft.terminalArrivalEnd !== "" && laneDraft.terminalArrivalEnd > laneDraft.terminalArrivalStart && laneDraft.downlineCarrierTerminalFacilityId !== ""));
  const storeDeliveryScheduleValid = activeType !== "FINAL_MILE" || laneDraft.storeDeliveryDays.length > 0;

  const chooseType = (type: LaneType) => { setActiveType(type); setSelectedLaneId(""); setLaneDraft({ ...emptyLane, dispatchDays: [] }); setCreating(false); setStatus(""); };
  const startCreating = () => { setLaneDraft({ ...emptyLane, dispatchDays: [] }); setCreating(true); setStatus(""); };
  const saveLane = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setBusy(true); setStatus("Creating lane profile...");
      const result = await createLane({ ...laneDraft, laneType: activeType, adhocReason: activeType === "ADHOC" ? laneDraft.adhocReason : undefined, adhocMode: activeType === "ADHOC" ? laneDraft.adhocMode : undefined, parentLaneId: activeType === "ADHOC" ? laneDraft.parentLaneId || undefined : undefined, maxUsesPerWeek: activeType === "ADHOC" && laneDraft.maxUsesPerWeek !== "" ? Number(laneDraft.maxUsesPerWeek) : undefined, responseDeadlineHours: activeType === "ADHOC" && laneDraft.responseDeadlineHours !== "" ? Number(laneDraft.responseDeadlineHours) : undefined, rateCap: activeType === "ADHOC" && laneDraft.rateCap !== "" ? Number(laneDraft.rateCap) : undefined });
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
  const downlineTerminal = selectedLane?.downlineCarrierTerminalFacilityId ? facilityMap.get(selectedLane.downlineCarrierTerminalFacilityId) : undefined;
  const parentLane = selectedLane?.parentLaneId ? lanes.find((lane) => lane.laneId === selectedLane.parentLaneId) : undefined;

  return <div className="lane-registry">
    <section className="transport-hero lane-hero">
      <div><p className="transport-eyebrow">Network planning</p><h2>Loads & lanes</h2><p>Build reusable lanes from facilities, then connect eligible carriers and governed awards.</p></div>
      <div className="lane-metrics"><div><span>Lanes</span><strong>{lanes.length}</strong></div><div title="Lane-to-carrier approvals that control future tender access"><span>Carrier eligibility</span><strong>{eligibility.length}</strong></div><div><span>Active awards</span><strong>{awards.filter((award) => award.status === "ACTIVE").length}</strong></div></div>
    </section>
    <div className="lane-type-tabs" role="tablist" aria-label="Lane types">{laneTypes.map((type) => <button key={type.key} type="button" className={activeType === type.key ? "active" : ""} onClick={() => chooseType(type.key)}>{type.label}<span>{lanes.filter((lane) => lane.laneType === type.key).length}</span></button>)}</div>
    {status ? <div className="ops-inline-alert lane-status">{status}</div> : null}
    {creating ? <form className="transport-panel lane-create-form" onSubmit={saveLane}>
      <div className="transport-panel-header"><div><p className="transport-eyebrow">New {label(activeType)} lane</p><h3>Create lane profile</h3></div><button className="btn btn-secondary" type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      {facilities.length < 2 ? <p className="ops-inline-alert">Add at least two facilities before creating a lane.</p> : null}
      <div className="lane-form-grid">
        <label>Lane name<input required value={laneDraft.name} onChange={(e) => setLaneDraft({ ...laneDraft, name: e.target.value })} placeholder="Example: WK01OriginToDestination" /></label>
        <FacilitySearchSelect fieldKey="origin" labelText="Origin facility" value={laneDraft.originFacilityId} facilities={facilities} onChange={(originFacilityId) => setLaneDraft((draft) => ({ ...draft, originFacilityId }))} />
        <FacilitySearchSelect fieldKey="destination" labelText="Destination facility" value={laneDraft.destinationFacilityId} facilities={facilities} onChange={(destinationFacilityId) => setLaneDraft((draft) => ({ ...draft, destinationFacilityId }))} />
        <label>Business unit<select required value={laneDraft.businessUnitId} onChange={(e) => setLaneDraft({ ...laneDraft, businessUnitId: e.target.value })}><option value="">Select business unit</option>{businessUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label>Equipment<select required value={laneDraft.equipmentType} onChange={(e) => setLaneDraft({ ...laneDraft, equipmentType: e.target.value })}><option value="">Select equipment</option><option value="53 FT DRY VAN">53 FT Dry Van</option><option value="26 FT DRY VAN">26 FT Dry Van</option><option value="BOX TRUCK">Box Truck</option></select></label>
        <label>Operating frequency<select required value={laneDraft.frequency} onChange={(e) => setLaneDraft({ ...laneDraft, frequency: e.target.value, dispatchDays: e.target.value === "DAILY" ? [...weekdays] : [] })}><option value="DAILY">Daily</option><option value="1WEEKLY">1 weekly</option><option value="2WEEKLY">2 weekly</option><option value="3WEEKLY">3 weekly</option><option value="4WEEKLY">4 weekly</option><option value="OTHER">Other</option></select></label>
        {activeType === "LINEHAUL" ? <>
          <TimePicker labelText="Carrier arrival / load start" value={laneDraft.standardCarrierArrivalStart} onChange={(standardCarrierArrivalStart) => setLaneDraft({ ...laneDraft, standardCarrierArrivalStart })} />
          <TimePicker labelText="Carrier arrival window end" value={laneDraft.standardCarrierArrivalEnd} onChange={(standardCarrierArrivalEnd) => setLaneDraft({ ...laneDraft, standardCarrierArrivalEnd })} />
          <TimePicker labelText="Standard origin departure time" value={laneDraft.standardOriginDepartureTime} onChange={(standardOriginDepartureTime) => setLaneDraft({ ...laneDraft, standardOriginDepartureTime })} />
        </> : null}
        {activeType !== "FINAL_MILE" ? <>
          <TimePicker labelText="Destination terminal arrival window from" value={laneDraft.terminalArrivalStart} onChange={(terminalArrivalStart) => setLaneDraft({ ...laneDraft, terminalArrivalStart })} />
          <TimePicker labelText="Destination terminal arrival window to" value={laneDraft.terminalArrivalEnd} onChange={(terminalArrivalEnd) => setLaneDraft({ ...laneDraft, terminalArrivalEnd })} />
          <FacilitySearchSelect fieldKey="downline-terminal" labelText="Downline carrier terminal" value={laneDraft.downlineCarrierTerminalFacilityId} facilities={facilities} onChange={(downlineCarrierTerminalFacilityId) => setLaneDraft((draft) => ({ ...draft, downlineCarrierTerminalFacilityId }))} />
        </> : null}
        <label>Effective from<input type="date" value={laneDraft.effectiveFrom} onChange={(e) => setLaneDraft({ ...laneDraft, effectiveFrom: e.target.value })} /></label>
        <label>Effective through<input type="date" value={laneDraft.effectiveTo} onChange={(e) => setLaneDraft({ ...laneDraft, effectiveTo: e.target.value })} /></label>
        <fieldset className="lane-dispatch-days lane-form-wide"><legend>{activeType === "FINAL_MILE" ? "Route departure days" : "Dispatch days"}</legend>{weekdays.map((day) => { const checked = laneDraft.dispatchDays.includes(day); const atLimit = Boolean(requiredDispatchDayCount && laneDraft.dispatchDays.length >= requiredDispatchDayCount); return <label key={day}><input type="checkbox" checked={checked} disabled={laneDraft.frequency === "DAILY" || (!checked && atLimit)} onChange={(event) => setLaneDraft({ ...laneDraft, dispatchDays: event.target.checked ? [...laneDraft.dispatchDays, day] : laneDraft.dispatchDays.filter((item) => item !== day) })} /><span>{label(day).slice(0, 3)}</span></label>; })}<small>{activeType === "FINAL_MILE" ? "Select when vehicles leave the local terminal, DC, or MFC for store deliveries." : requiredDispatchDayCount ? `Select ${requiredDispatchDayCount} day${requiredDispatchDayCount === 1 ? "" : "s"}.` : "Select the days this lane may dispatch."}</small></fieldset>
        <WeekdayPicker legend={activeType === "FINAL_MILE" ? "Freight available days" : "Terminal arrival days"} value={laneDraft.terminalArrivalDays} onChange={(terminalArrivalDays) => setLaneDraft({ ...laneDraft, terminalArrivalDays })} guidance={activeType === "FINAL_MILE" ? "Select when freight is processed and available for last-mile dispatch." : undefined} />
        {activeType === "FINAL_MILE" ? <WeekdayPicker legend="Store delivery days" value={laneDraft.storeDeliveryDays} onChange={(storeDeliveryDays) => setLaneDraft({ ...laneDraft, storeDeliveryDays })} guidance="Select when the destination sites receive deliveries." /> : null}
        {activeType === "ADHOC" ? <>
          <label>Operating mode<select value={laneDraft.adhocMode} onChange={(e) => setLaneDraft({ ...laneDraft, adhocMode: e.target.value, parentLaneId: e.target.value === "ONE_TIME" ? "" : laneDraft.parentLaneId })}><option value="ONE_TIME">One-time</option><option value="ROLLING_CONTINGENCY">Rolling contingency</option><option value="TEMPORARY_RECURRING">Temporary recurring</option></select></label>
          <label>Adhoc purpose<select value={laneDraft.adhocReason} onChange={(e) => setLaneDraft({ ...laneDraft, adhocReason: e.target.value })}><option value="CARRIER_COVERAGE">Carrier coverage</option><option value="SPECIAL_PROJECT">Special project</option><option value="VOLUME_CAPACITY">Volume capacity</option></select></label>
          {laneDraft.adhocMode !== "ONE_TIME" ? <label>Parent standard lane<select required={laneDraft.adhocMode === "ROLLING_CONTINGENCY"} value={laneDraft.parentLaneId} onChange={(e) => setLaneDraft({ ...laneDraft, parentLaneId: e.target.value })}><option value="">Select lane</option>{lanes.filter((lane) => lane.laneType !== "ADHOC").map((lane) => <option key={lane.laneId} value={lane.laneId}>{lane.name}</option>)}</select></label> : null}
          {laneDraft.adhocMode !== "ONE_TIME" ? <label>Maximum uses / week<input type="number" min="1" max="999" step="1" value={laneDraft.maxUsesPerWeek} onChange={(e) => setLaneDraft({ ...laneDraft, maxUsesPerWeek: e.target.value })} /></label> : null}
          <label>Carrier response deadline (hours)<input type="number" min="0.25" max="168" step="0.25" value={laneDraft.responseDeadlineHours} onChange={(e) => setLaneDraft({ ...laneDraft, responseDeadlineHours: e.target.value })} /></label>
          <label>Rate cap (USD)<input type="number" min="0.01" step="0.01" value={laneDraft.rateCap} onChange={(e) => setLaneDraft({ ...laneDraft, rateCap: e.target.value })} /></label>
        </> : null}
        <label className="lane-form-wide">Operating notes<textarea value={laneDraft.notes} onChange={(e) => setLaneDraft({ ...laneDraft, notes: e.target.value })} placeholder="Appointments, equipment constraints, or service expectations" /></label>
      </div><div className="lane-form-actions"><button className="btn btn-primary" disabled={busy || facilities.length < 2 || !dispatchScheduleValid || !terminalScheduleValid || !storeDeliveryScheduleValid}>Create lane</button></div>
    </form> : <div className="lane-workbench">
      <aside className="lane-list-pane"><div className="lane-pane-heading"><div><span>{label(activeType)}</span><strong>Lane profiles</strong></div><button className="btn btn-primary" type="button" onClick={startCreating}>New lane</button></div>
        <div className="lane-list">{visibleLanes.length ? visibleLanes.map((lane) => { const from = facilityMap.get(lane.originFacilityId); const to = facilityMap.get(lane.destinationFacilityId); return <button type="button" key={lane.laneId} className={selectedLane?.laneId === lane.laneId ? "active" : ""} onClick={() => setSelectedLaneId(lane.laneId)}><strong>{lane.name}</strong><span>{from?.siteId || from?.name || "Origin"} to {to?.siteId || to?.name || "Destination"}</span><small>{eligibility.filter((item) => item.laneId === lane.laneId).length} eligible | {awards.filter((item) => item.laneId === lane.laneId && item.status === "ACTIVE").length} active awards</small></button>; }) : <div className="lane-empty"><strong>No {label(activeType)} lanes</strong><p>Create the first lane from locations already on file.</p></div>}</div>
      </aside>
      <section className="lane-detail-pane">{selectedLane ? <>
        <header className="lane-profile-header"><div><p className="transport-eyebrow">{label(selectedLane.laneType)} lane</p><h3>{selectedLane.name}</h3></div><span className="ops-status-pill">{selectedLane.status}</span></header>
        <div className="lane-route-web"><article><span>Origin</span><strong>{origin?.name || "Unknown facility"}</strong><p>{origin?.siteId ? `${origin.siteId} | ` : ""}{origin?.city}, {origin?.state}</p></article><div className="lane-route-connector"><span>{selectedLane.equipmentType || "Any equipment"}</span><strong>→</strong><small>{selectedLane.laneType === "FINAL_MILE" ? "Store delivery route" : selectedLane.terminalArrivalStart && selectedLane.terminalArrivalEnd ? `Terminal arrival ${selectedLane.terminalArrivalStart}–${selectedLane.terminalArrivalEnd}` : selectedLane.transitDays !== undefined ? `${selectedLane.transitDays} day transit` : "Terminal window not set"}</small></div><article><span>Destination</span><strong>{destination?.name || "Unknown facility"}</strong><p>{destination?.siteId ? `${destination.siteId} | ` : ""}{destination?.city}, {destination?.state}</p></article></div>
        <div className="lane-profile-facts"><div><span>Business unit</span><strong>{selectedLane.businessUnitName || "Not assigned"}</strong></div><div><span>Equipment plan</span><strong>{selectedLane.equipmentType ? `${label(selectedLane.equipmentType)} | ${selectedLane.loadAssumption || "Planning"}` : "Not set"}</strong></div><div><span>Frequency</span><strong>{label(selectedLane.frequency) || "Not set"}</strong></div><div><span>{selectedLane.laneType === "FINAL_MILE" ? "Route departure days" : "Dispatch days"}</span><strong>{selectedLane.dispatchDays?.map((day) => label(day).slice(0, 3)).join(", ") || "Not set"}</strong></div><div><span>{selectedLane.laneType === "FINAL_MILE" ? "Freight available days" : "Terminal arrival"}</span><strong>{selectedLane.terminalArrivalDays?.map((day) => label(day).slice(0, 3)).join(", ") || "Not set"}{selectedLane.laneType !== "FINAL_MILE" ? ` | ${selectedLane.terminalArrivalStart && selectedLane.terminalArrivalEnd ? `${selectedLane.terminalArrivalStart} to ${selectedLane.terminalArrivalEnd}` : "No window"}` : ""}</strong></div>{selectedLane.laneType !== "FINAL_MILE" ? <div><span>Downline terminal</span><strong>{downlineTerminal?.name || "Not set"}</strong></div> : null}{selectedLane.laneType === "FINAL_MILE" ? <div><span>Store delivery days</span><strong>{selectedLane.storeDeliveryDays?.map((day) => label(day).slice(0, 3)).join(", ") || "Not set"}</strong></div> : null}<div><span>Effective period</span><strong>{selectedLane.effectiveFrom || "Open"} to {selectedLane.effectiveTo || "Open"}</strong></div>{selectedLane.laneType === "LINEHAUL" ? <><div><span>Carrier arrival / load start</span><strong>{selectedLane.standardCarrierArrivalStart && selectedLane.standardCarrierArrivalEnd ? `${selectedLane.standardCarrierArrivalStart} to ${selectedLane.standardCarrierArrivalEnd}` : "Not set"}</strong></div><div><span>Origin departure</span><strong>{selectedLane.standardOriginDepartureTime || "Not set"}</strong></div></> : null}{selectedLane.adhocReason ? <><div><span>Adhoc mode</span><strong>{label(selectedLane.adhocMode)}</strong></div><div><span>Adhoc purpose</span><strong>{label(selectedLane.adhocReason)}</strong></div>{selectedLane.parentLaneId ? <div><span>Parent standard lane</span><strong>{parentLane?.name || "Referenced lane"}</strong></div> : null}<div><span>Weekly use limit</span><strong>{selectedLane.maxUsesPerWeek || "Not capped"}</strong></div><div><span>Response deadline</span><strong>{selectedLane.responseDeadlineHours ? `${selectedLane.responseDeadlineHours} hours` : "Not set"}</strong></div><div><span>Rate cap</span><strong>{selectedLane.rateCap ? money(selectedLane.rateCap) : "Not set"}</strong></div></> : null}</div>
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
