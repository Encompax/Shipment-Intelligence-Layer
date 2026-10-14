import { useEffect, useState } from "react";
import { createEdiConfiguration, fetchEdiConfigurations } from "../api/client";

type Configuration = { configurationId: string; partnerName: string; partnerCode: string; interchangeId: string; interchangeQualifier: string; transport: string; stewardshipModel: string; stewardName?: string | null; stewardEmail?: string | null; version: number; status: string; integrity: string; documentPolicy: Record<string, string | boolean> };
const empty = { partnerName: "", partnerCode: "", interchangeId: "", interchangeQualifier: "ZZ", transport: "SFTP", connectionReference: "", stewardshipModel: "INTERNAL_DATA_STEWARD", stewardName: "", stewardEmail: "" };

export default function EdiConfigurationPanel() {
  const [form, setForm] = useState(empty);
  const [configurations, setConfigurations] = useState<Configuration[]>([]);
  const [message, setMessage] = useState("");
  const load = async () => { try { setConfigurations((await fetchEdiConfigurations()).configurations ?? []); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load EDI configuration."); } };
  useEffect(() => { void load(); }, []);
  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage("Saving configuration...");
    try { await createEdiConfiguration(form); setForm(empty); setMessage("Trading-partner configuration saved for governance review."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save EDI configuration."); }
  };
  const humanSteward = form.stewardshipModel !== "MARENGO";
  return <div className="data-intake">
    <section className="transport-hero intake-hero"><div><p className="transport-eyebrow">Governed data exchange</p><h2>EDI connections</h2><p>Configure tenant-specific trading partners and accountable stewardship before activating document exchange.</p></div></section>
    <section className="transport-panel"><div className="transport-panel-header"><div><p className="transport-eyebrow">Trading partner</p><h3>Connection configuration</h3></div><span>Review required</span></div>
      <form className="lane-form-grid" onSubmit={submit}>
        <label>Partner name<input required value={form.partnerName} onChange={(event) => update("partnerName", event.target.value)} /></label>
        <label>Partner code<input required value={form.partnerCode} onChange={(event) => update("partnerCode", event.target.value)} /></label>
        <label>Interchange ID<input required value={form.interchangeId} onChange={(event) => update("interchangeId", event.target.value)} /></label>
        <label>ISA qualifier<select value={form.interchangeQualifier} onChange={(event) => update("interchangeQualifier", event.target.value)}><option>ZZ</option><option>01</option><option>12</option><option>14</option><option>30</option></select></label>
        <label>Transport<select value={form.transport} onChange={(event) => update("transport", event.target.value)}><option value="SFTP">SFTP</option><option value="AS2">AS2</option><option value="MANAGED_API">Managed API</option></select></label>
        <label>Secret connection reference<input placeholder="Secret Manager reference" value={form.connectionReference} onChange={(event) => update("connectionReference", event.target.value)} /></label>
        <label>Stewardship<select value={form.stewardshipModel} onChange={(event) => update("stewardshipModel", event.target.value)}><option value="INTERNAL_DATA_STEWARD">Internal Data Steward</option><option value="MARENGO">Marengo Data Insights</option><option value="EXTERNAL_PARTY">Outside EDI partner</option></select></label>
        {humanSteward && <><label>Steward name<input required value={form.stewardName} onChange={(event) => update("stewardName", event.target.value)} /></label><label>Steward email<input required type="email" value={form.stewardEmail} onChange={(event) => update("stewardEmail", event.target.value)} /></label></>}
        <div className="intake-actions"><button className="btn btn-primary" type="submit">Save configuration</button></div>
      </form>
      {message && <p className="ops-note" role="status">{message}</p>}
    </section>
    <section className="transport-panel"><div className="transport-panel-header"><div><p className="transport-eyebrow">Document flow</p><h3>Configured scope</h3></div><span>{configurations.length}</span></div>
      <div className="planning-audit-bar"><span>Inbound <strong>204</strong><small>Translate to canonical orders</small></span><span>Governance <strong>Required</strong><small>Validate and review</small></span><span>Outbound <strong>990</strong><small>Accept or reject</small></span><span>Later <strong>214 / 210</strong><small>Tracking and invoicing</small></span></div>
      <p className="ops-note">Raw documents, acknowledgments, and translations are retained as immutable evidence when document processing is activated.</p>
      <div className="planning-candidates">{configurations.map((item) => <article key={item.configurationId}><header><div><strong>{item.partnerName}</strong><span>{item.partnerCode} | {item.transport}</span></div><b>v{item.version}</b></header><div className="planning-findings"><p className="info"><span>{item.integrity}</span>{item.stewardshipModel.replaceAll("_", " ")}{item.stewardName ? ` | ${item.stewardName}` : ""}</p><p className="warning"><span>PENDING</span>Transport activation and transaction certification have not been completed.</p></div></article>)}</div>
      {!configurations.length && <p className="ops-note">No EDI trading partners have been configured.</p>}
    </section>
  </div>;
}
