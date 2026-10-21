import { useMemo, useState } from "react";
import { approveCargoNestingProposal, createCargoNestingProposal } from "../api/client";

type Order = Record<string, any> & { orderId: string; primaryReference: string; status: string };
type Facility = { facilityId: string; name: string; siteId?: string };
type Props = { orders: Order[]; facilities: Facility[]; onReleased?: () => void | Promise<void> };
const fields = ["reference", "destination", "weight", "pallets", "cases", "eaches", "lane", "custody"];

export default function CargoNestingPanel({ orders, facilities, onReleased }: Props) {
  const [stage, setStage] = useState("source");
  const [parentOrderId, setParentOrderId] = useState("");
  const [childIds, setChildIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [visibleFields, setVisibleFields] = useState(fields);
  const [overrides, setOverrides] = useState<Record<string, { weightLbs: string; pallets: string; cases: string; eaches: string; attributes: Record<string,string> }>>({});
  const [proposal, setProposal] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<any>(null);
  const [message, setMessage] = useState("");
  const label = (id: string) => { const f = facilities.find((item) => item.facilityId === id); return f ? `${f.name}${f.siteId ? ` (${f.siteId})` : ""}` : id; };
  const createdLabel = (value: unknown) => {
    const date = new Date(String(value ?? ""));
    return Number.isNaN(date.getTime()) ? "Created date unavailable" : `Created ${date.toLocaleDateString("en-US")}`;
  };
  const ready = orders.filter((order) => order.status === "READY_TO_PLAN");
  const parentOptions = ready.filter((order) => String(order.modeType).toUpperCase() === "TL" || String(order.orderType).toUpperCase() === "LINEHAUL");
  const parent = ready.find((order) => order.orderId === parentOrderId);
  const childOptions = useMemo(() => ready.filter((order) => order.orderId !== parentOrderId && (!parent || order.originId === parent.destinationId) && [order.primaryReference, order.meid, label(order.destinationId)].join(" ").toLowerCase().includes(query.toLowerCase())), [ready, parentOrderId, parent, query]);
  const value = (order: Order) => overrides[order.orderId] ?? { weightLbs: String(order.weight ?? ""), pallets: String(order.palletQuantity ?? ""), cases: String(order.caseQuantity ?? ""), eaches: String(order.eachQuantity ?? ""), attributes: {} };
  const update = (order: Order, field: string, next: string) => setOverrides((current) => ({ ...current, [order.orderId]: { ...value(order), [field]: next } }));
  const build = async () => {
    if (!parentOrderId || !childIds.length) return;
    try {
      setBusy(true); setMessage("Building governed cargo nesting evidence...");
      const allocations = childIds.map((id) => { const order = ready.find((item) => item.orderId === id)!; const v = value(order); return { orderId: id, weightLbs: Number(v.weightLbs || 0), pallets: Number(v.pallets || 0), cases: Number(v.cases || 0), eaches: Number(v.eaches || 0), attributes: v.attributes }; });
      const result = await createCargoNestingProposal({ parentOrderId, allocations, filters: query ? [query] : [], visibleFields });
      setProposal(result.proposal); setStage("custody"); setMessage("Cargo nesting proposal created. Original orders were not changed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not build cargo nesting proposal."); }
    finally { setBusy(false); }
  };
  const approve = async () => { if (!proposal) return; try { setBusy(true); const result = await approveCargoNestingProposal(proposal.cargoNestingId); setDecision(result.decision); setMessage(`${result.loads.length} linked planned loads created. Tendering remains a separate governed action.`); await onReleased?.(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not release cargo nesting plan."); } finally { setBusy(false); } };
  const stages = [["source","1","Source orders"],["layout","2","Fields & filters"],["allocation","3","Cargo allocation"],["custody","4","Cross-dock custody"],["execution","5","Execution review"]];
  return <div className="cargo-nesting-workbench">
    <aside className="cargo-nesting-sidebar"><p className="transport-eyebrow">Cargo nesting</p>{stages.map(([id,n,name]) => <button type="button" key={id} className={stage === id ? "active" : ""} onClick={() => setStage(id)}><span>{n}</span><strong>{name}</strong></button>)}</aside>
    <div className="cargo-nesting-canvas">
      <div className="transport-panel-header"><div><p className="transport-eyebrow">Cross-segment load builder</p><h3>{stages.find(([id]) => id === stage)?.[2]}</h3></div><button className="btn btn-primary" type="button" disabled={busy || !parentOrderId || !childIds.length} onClick={() => void build()}>{busy ? "Building..." : "Build cargo nesting proposal"}</button></div>
      {message && <p className="ops-note" role="status">{message}</p>}
      {stage === "source" && <div className="cargo-source-grid"><section><h4>Parent Linehaul manifest</h4><label>Linehaul order<select value={parentOrderId} onChange={(event) => { setParentOrderId(event.target.value); setChildIds([]); setProposal(null); }}><option value="">Select parent Linehaul</option>{parentOptions.map((order) => <option key={order.orderId} value={order.orderId}>{order.meid} · {order.primaryReference} · {label(order.originId)} to {label(order.destinationId)}</option>)}</select></label>{parent && <p className="ops-note">Manifest total: {parent.weight || 0} {parent.weightUom || "LBS"} · {parent.palletQuantity || 0} pallets. Child allocations are contained within, not added to, this total.</p>}</section><section><h4>Downstream cargo orders</h4><label>Filter available orders<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reference, MEID, destination" /></label><div className="cargo-order-picker">{childOptions.map((order) => <label key={order.orderId}><input type="checkbox" checked={childIds.includes(order.orderId)} onChange={() => setChildIds((current) => current.includes(order.orderId) ? current.filter((id) => id !== order.orderId) : [...current, order.orderId])} /><span><strong>{order.primaryReference}</strong><small>{order.meid} · {label(order.destinationId)} · {order.palletQuantity || 0} pallets</small></span><time dateTime={String(order.createdAt ?? "")}>{createdLabel(order.createdAt)}</time></label>)}</div></section></div>}
      {stage === "layout" && <><p className="ops-note">Choose the fields displayed in the allocation canvas. Organization-specific attributes can be added without changing the canonical order.</p><div className="cargo-field-picker">{fields.map((field) => <label key={field}><input type="checkbox" checked={visibleFields.includes(field)} onChange={() => setVisibleFields((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field])} />{field.replaceAll("_", " ")}</label>)}</div><label>Saved-view filter<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter reference, destination, or MEID" /></label></>}
      {stage === "allocation" && <div className="transport-table-wrap"><table className="transport-table"><thead><tr><th>Order</th><th>Destination</th><th>Weight LBS</th><th>Pallets</th><th>Cases</th><th>Eaches</th><th>Special requirements</th></tr></thead><tbody>{childIds.map((id) => ready.find((item) => item.orderId === id)).filter(Boolean).map((order: any) => { const v=value(order); return <tr key={order.orderId}><td>{order.primaryReference}</td><td>{label(order.destinationId)}</td><td><input type="number" min="0" value={v.weightLbs} onChange={(e)=>update(order,"weightLbs",e.target.value)} /></td><td><input type="number" min="0" value={v.pallets} onChange={(e)=>update(order,"pallets",e.target.value)} /></td><td><input type="number" min="0" value={v.cases} onChange={(e)=>update(order,"cases",e.target.value)} /></td><td><input type="number" min="0" value={v.eaches} onChange={(e)=>update(order,"eaches",e.target.value)} /></td><td><input placeholder="Temperature, dangerous goods, handling" value={v.attributes.requirements || ""} onChange={(e)=>setOverrides((current)=>({...current,[order.orderId]:{...v,attributes:{...v.attributes,requirements:e.target.value}}}))} /></td></tr>; })}</tbody></table></div>}
      {stage === "custody" && proposal && <><div className="planning-audit-bar"><span>Proposal <strong>{proposal.cargoNestingId}</strong></span><span>Manifest <strong>{proposal.capacity.manifestPallets} pallets</strong></span><span>Nested <strong>{proposal.capacity.allocatedPallets} pallets</strong></span><span>Utilization <strong>{proposal.capacity.palletPercent ?? "--"}%</strong></span></div>{proposal.allocations.map((allocation:any)=><article className="cargo-custody-card" key={allocation.allocationId}><h4>{allocation.reference} → {label(allocation.destinationFacilityId)}</h4><p>{allocation.finalMileLaneName} · {allocation.weightLbs} LBS · {allocation.pallets} pallets</p><ol>{allocation.custody.map((event:any)=><li key={event.sequence}><strong>{event.event.replaceAll("_"," ")}</strong><span>{label(event.facilityId)} · {event.status}</span><small>{event.expectedAt ? new Date(event.expectedAt).toLocaleString() : "Schedule required"}</small></li>)}</ol></article>)}</>}
      {stage === "execution" && proposal && <><div className="planning-findings">{proposal.findings.map((finding:any)=><p key={finding.code+finding.message} className={finding.severity.toLowerCase()}><span>{finding.severity}</span>{finding.message}</p>)}</div><div className="planning-decision-panel"><div><span>Execution boundary</span><strong>{decision ? "Released to planned execution" : proposal.findings.some((f:any)=>f.severity==="BLOCKER") ? "Blocked" : "Ready for governed approval"}</strong><small>Approval creates the parent Linehaul load, downstream Final Mile loads, cargo-allocation links, and custody records before tendering.</small></div><button className="btn btn-primary" type="button" disabled={busy || Boolean(decision) || proposal.findings.some((f:any)=>f.severity==="BLOCKER")} onClick={() => void approve()}>{decision ? "Linked loads created" : "Approve and create linked loads"}</button></div></>}
      {!proposal && ["custody","execution"].includes(stage) && <p className="ops-note">Choose a parent Linehaul and downstream orders, then build the cargo nesting proposal.</p>}
    </div>
  </div>;
}
