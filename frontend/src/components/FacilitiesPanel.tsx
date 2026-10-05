import { useEffect, useState } from "react";
import { fetchFacilities, importFacilities } from "../api/client";

type Facility = {
  facilityId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode?: string;
  facilityType: "SUPPLIER" | "CROSSDOCK" | "DC" | "MFC" | "OTHER";
  propertyType: "COMMERCIAL" | "RESIDENTIAL";
};

export default function FacilitiesPanel() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const load = async () => {
    try {
      const result = await fetchFacilities();
      setFacilities(result.facilities ?? []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load facilities.");
    }
  };

  useEffect(() => { void load(); }, []);

  const upload = async () => {
    if (!file) return;
    try {
      setStatus("Adding facility records...");
      const result = await importFacilities(file);
      setStatus(`Added ${result.importedCount} location(s). ${result.rejectedCount} row(s) need review.`);
      setFile(null);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Facility import failed.");
    }
  };

  return (
    <div className="data-intake">
      <section className="transport-hero intake-hero">
        <div>
          <p className="transport-eyebrow">Location master</p>
          <h2>Facilities & locations</h2>
          <p>Maintain the addresses and location types used to plan, tender, and execute freight.</p>
        </div>
      </section>
      <section className="transport-panel">
        <div className="transport-panel-header">
          <div><p className="transport-eyebrow">Bulk import</p><h3>Add facility records</h3></div>
          <span>CSV / Excel</span>
        </div>
        <div className="intake-actions">
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <button className="btn btn-primary" type="button" disabled={!file} onClick={upload}>Import facilities</button>
          <a className="btn btn-secondary" href="/templates/sil-facility-import-template.xlsx" download>Download facility template</a>
        </div>
        <p className="ops-note">The Excel template includes Facility Type and Property Type dropdowns. Facility types: Supplier, Crossdock, DC, MFC, or Other. Property type: Commercial or Residential.</p>
        {status && <p className="ops-note">{status}</p>}
      </section>
      <section className="transport-panel">
        <div className="transport-panel-header"><div><p className="transport-eyebrow">On file</p><h3>{facilities.length} location(s)</h3></div></div>
        <div className="transport-table-wrap">
          <table className="transport-table">
            <thead><tr><th>Facility</th><th>Address</th><th>Type</th><th>Property</th></tr></thead>
            <tbody>{facilities.map((facility) => <tr key={facility.facilityId}><td>{facility.name}</td><td>{[facility.address, facility.city, facility.state, facility.postalCode].filter(Boolean).join(", ")}</td><td>{facility.facilityType}</td><td>{facility.propertyType}</td></tr>)}</tbody>
          </table>
        </div>
        {facilities.length === 0 && <p className="ops-note">No facility records are on file.</p>}
      </section>
    </div>
  );
}
