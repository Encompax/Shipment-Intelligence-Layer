import { useEffect, useMemo, useState } from "react";
import { createOrder, fetchOrders } from "../api/client";

type Order = { orderId: string; primaryReference: string; poNumber?: string; materialTransferOrderNumber?: string; originId?: string; destinationId?: string; businessUnit?: string; earliestPickup?: string; latestDelivery?: string; status: string };
const empty = { primaryReference: "", poNumber: "", materialTransferOrderNumber: "", meid: "", businessUnit: "", originId: "", destinationId: "", earliestPickup: "", latestDelivery: "", quantity: "", quantityUom: "PALLETS", weight: "", weightUom: "LB", equipmentType: "53 FT DRY VAN", scac: "", modeType: "TL", orderType: "TRANSFER" };

export default function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const load = async () => { try { const result = await fetchOrders(); setOrders(result.orders ?? []); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load orders."); } };
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return !query ? orders : orders.filter((order) => Object.values(order).join(" ").toLowerCase().includes(query)); }, [orders, search]);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage("Saving order...");
    try { await createOrder(form); setForm(empty); setMessage("Order saved and validated for planning."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save order."); }
  };
  return <div className="data-intake">
    <section className="transport-hero intake-hero"><div><p className="transport-eyebrow">Order management</p><h2>Orders</h2><p>Create and review demand before it is consolidated into loads, assigned to lanes, or tendered.</p></div></section>
    <details className="transport-panel facility-manual-entry"><summary><span><span className="transport-eyebrow">Manual entry</span><strong>Create an order</strong></span><span className="facility-manual-toggle">Open form</span></summary>
      <form onSubmit={submit} className="lane-form-grid">
        {([['primaryReference','Primary reference'],['poNumber','PO number'],['materialTransferOrderNumber','Transfer order number'],['meid','MEID'],['businessUnit','Business unit'],['originId','Origin site ID'],['destinationId','Destination site ID'],['earliestPickup','Earliest pickup'],['latestDelivery','Latest delivery'],['quantity','Quantity'],['quantityUom','Quantity UOM'],['weight','Weight'],['weightUom','Weight UOM'],['scac','SCAC']] as const).map(([field,label]) => <label key={field}>{label}<input required={['primaryReference','originId','destinationId','earliestPickup','latestDelivery'].includes(field)} type={field.includes('Pickup') || field.includes('Delivery') ? 'datetime-local' : field === 'quantity' || field === 'weight' ? 'number' : 'text'} value={form[field]} onChange={(e) => update(field,e.target.value)} /></label>)}
        <label>Equipment<select value={form.equipmentType} onChange={(e) => update('equipmentType',e.target.value)}><option>53 FT DRY VAN</option><option>26 FT DRY VAN</option><option>BOX TRUCK</option></select></label>
        <label>Mode<select value={form.modeType} onChange={(e) => update('modeType',e.target.value)}><option>TL</option><option>LTL</option></select></label>
        <label>Order type<select value={form.orderType} onChange={(e) => update('orderType',e.target.value)}><option>TRANSFER</option><option>INBOUND</option><option>ADHOC</option></select></label>
        <div className="intake-actions"><button className="btn btn-primary" type="submit">Create order</button></div>
      </form>
    </details>
    <section className="transport-panel"><div className="transport-panel-header"><div><p className="transport-eyebrow">Planning queue</p><h3>Orders on file</h3></div><span>{filtered.length}</span></div>
      <label className="facility-search"><span>Search orders</span><input type="search" placeholder="Reference, site, business unit, SCAC, or status" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      {message && <p className="ops-note">{message}</p>}
      <div className="transport-table-wrap"><table className="transport-table"><thead><tr><th>Reference</th><th>PO / TO</th><th>Route</th><th>Business unit</th><th>Pickup</th><th>Delivery</th><th>Status</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.orderId}><td>{order.primaryReference}</td><td>{order.poNumber || order.materialTransferOrderNumber || '--'}</td><td>{order.originId || '--'} to {order.destinationId || '--'}</td><td>{order.businessUnit || '--'}</td><td>{order.earliestPickup || '--'}</td><td>{order.latestDelivery || '--'}</td><td>{order.status.replaceAll('_',' ')}</td></tr>)}</tbody></table></div>
      {!filtered.length && <p className="ops-note">No matching orders are on file. Use manual entry here or stage a CSV or Excel file in Data intake.</p>}
    </section>
  </div>;
}
