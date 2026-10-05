import { useEffect, useMemo, useState } from "react";
import { createFacility, fetchFacilities, importReviewedFacilities, reviewFacilities } from "../api/client";

type Facility = {
  facilityId: string;
  name: string;
  siteId?: string;
  address: string;
  city: string;
  state: string;
  postalCode?: string;
  facilityType: "SUPPLIER" | "CROSSDOCK" | "DC" | "MFC" | "OTHER";
  propertyType: "COMMERCIAL" | "RESIDENTIAL";
  primaryContactName?: string;
  primaryContactTitle?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  operatingHours?: string;
  regionalManager?: string;
  supplyChainBusinessPartner?: string;
};

const contactDetails = (facility: Facility) => [
  [facility.primaryContactName, facility.primaryContactTitle].filter(Boolean).join(" - "),
  facility.primaryContactEmail,
  facility.primaryContactPhone,
].filter(Boolean).join(" | ") || "--";

const ownershipDetails = (facility: Facility) => [
  facility.regionalManager ? `Regional: ${facility.regionalManager}` : "",
  facility.supplyChainBusinessPartner ? `SCBP: ${facility.supplyChainBusinessPartner}` : "",
].filter(Boolean).join(" | ") || "--";

type FacilityReview = {
  reviewId: string;
  validCount: number;
  rejectedCount: number;
  councilStatus: "APPROVED" | "APPROVED_WITH_OPERATOR_REVIEW";
  summary: string;
  risks: string[];
  issues: Array<{ row: number; severity: "ERROR" | "REVIEW"; field: string; message: string }>;
  corrections: Array<{ row: number; field: string; value: string; reason: string; confidence: number; councilDecision: "APPROVED" | "OPERATOR_REVIEW" }>;
  rows: Facility[];
};

type ManualFacility = Omit<Facility, "facilityId">;
const emptyManualFacility: ManualFacility = {
  name: "", siteId: "", address: "", city: "", state: "", postalCode: "",
  facilityType: "OTHER", propertyType: "COMMERCIAL", primaryContactName: "",
  primaryContactTitle: "", primaryContactEmail: "", primaryContactPhone: "", operatingHours: "",
  regionalManager: "", supplyChainBusinessPartner: "",
};

export default function FacilitiesPanel() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [review, setReview] = useState<FacilityReview | null>(null);
  const [reviewPage, setReviewPage] = useState(0);
  const [locationSearch, setLocationSearch] = useState("");
  const [manualFacility, setManualFacility] = useState<ManualFacility>(emptyManualFacility);
  const [manualStatus, setManualStatus] = useState<string | null>(null);
  const [savingManual, setSavingManual] = useState(false);

  const filteredFacilities = useMemo(() => {
    const terms = locationSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return facilities;
    return facilities.filter((facility) => {
      const searchable = [
        facility.name,
        facility.siteId,
        facility.address,
        facility.city,
        facility.state,
        facility.postalCode,
        facility.facilityType,
        facility.propertyType,
        facility.primaryContactName,
        facility.primaryContactTitle,
        facility.primaryContactEmail,
        facility.primaryContactPhone,
        facility.operatingHours,
        facility.regionalManager,
        facility.supplyChainBusinessPartner,
      ].filter(Boolean).join(" ").toLocaleLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }, [facilities, locationSearch]);

  const load = async () => {
    try {
      const result = await fetchFacilities();
      setFacilities(result.facilities ?? []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load facilities.");
    }
  };

  useEffect(() => { void load(); }, []);

  const reviewUpload = async () => {
    if (!file) return;
    try {
      setStatus("Uploading the location file...");
      setReview(null);
      setReviewPage(0);
      const result = await reviewFacilities(file);
      setReview(result as FacilityReview);
      setStatus("The file is ready. Confirm the locations below before adding them.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Facility review failed.");
    }
  };

  const importReview = async () => {
    if (!review) return;
    try {
      setStatus("Adding council-reviewed facility records...");
      const result = await importReviewedFacilities(review.reviewId);
      setStatus(`Added ${result.importedCount} location(s). ${result.rejectedCount} incomplete row(s) were not imported.`);
      setFile(null);
      setReview(null);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Reviewed facility import failed.");
    }
  };

  const updateManual = (field: keyof ManualFacility, value: string) => {
    setManualFacility((current) => ({ ...current, [field]: value }));
  };

  const saveManualFacility = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setSavingManual(true);
      setManualStatus("Adding location...");
      await createFacility(manualFacility);
      setManualFacility(emptyManualFacility);
      setManualStatus("Location added successfully.");
      await load();
    } catch (error) {
      setManualStatus(error instanceof Error ? error.message : "Could not add the location.");
    } finally {
      setSavingManual(false);
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
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setReview(null); setReviewPage(0); setStatus(null); }} />
          <button className="btn btn-primary" type="button" disabled={!file} onClick={reviewUpload}>Upload</button>
          <a className="btn btn-secondary" href="/templates/sil-facility-import-template.xlsx" download>Download facility template</a>
        </div>
        <p className="ops-note">Use Site ID when your organization has a stable facility code. Primary contact details and operating hours are optional. The Excel template includes Facility Type and Property Type dropdowns. Encompax reviews the file before anything is added and requires your confirmation to import it.</p>
        {status && <p className="ops-note">{status}</p>}
      </section>
      {review && (
        <section className="transport-panel">
          <div className="transport-panel-header">
            <div><p className="transport-eyebrow">Encompax governance review</p><h3>Facility intake proposal</h3></div>
            <span>{review.councilStatus === "APPROVED" ? "Approved" : "Operator review"}</span>
          </div>
          <p className="ops-note">{review.summary}</p>
          <p className="ops-note">{review.validCount} ready record(s); {review.rejectedCount} incomplete row(s) will not be imported.</p>
          {review.corrections.length > 0 && (
            <div className="intake-governance-result">
              <span>Council correction review</span>
              <ul>
                {review.corrections.map((correction) => (
                  <li key={`${correction.row}-${correction.field}`}>
                    Row {correction.row}: {correction.field} to "{correction.value}" - {correction.reason} ({correction.councilDecision === "APPROVED" ? "included" : "verify manually"})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(review.issues.length > 0 || review.risks.length > 0) && (
            <div className="intake-governance-result">
              <span>Operator attention</span>
              <ul>
                {review.issues.slice(0, 12).map((issue) => <li key={`${issue.row}-${issue.field}`}>Row {issue.row}: {issue.message}</li>)}
                {review.risks.map((risk) => <li key={risk}>{risk}</li>)}
              </ul>
            </div>
          )}
          <div className="transport-table-wrap">
            <table className="transport-table">
              <thead><tr><th>Facility</th><th>Site ID</th><th>Address</th><th>Contact</th><th>Ownership</th><th>Hours</th><th>Type</th><th>Property</th></tr></thead>
              <tbody>{review.rows.slice(reviewPage * 25, reviewPage * 25 + 25).map((facility) => <tr key={facility.facilityId}><td>{facility.name}</td><td>{facility.siteId ?? "--"}</td><td>{[facility.address, facility.city, facility.state, facility.postalCode].filter(Boolean).join(", ")}</td><td>{contactDetails(facility)}</td><td>{ownershipDetails(facility)}</td><td>{facility.operatingHours ?? "--"}</td><td>{facility.facilityType}</td><td>{facility.propertyType}</td></tr>)}</tbody>
            </table>
          </div>
          {review.rows.length > 25 && (
            <div className="intake-actions">
              <button className="btn btn-secondary" type="button" disabled={reviewPage === 0} onClick={() => setReviewPage((page) => page - 1)}>Previous records</button>
              <p className="ops-note">Reviewed records {reviewPage * 25 + 1}-{Math.min((reviewPage + 1) * 25, review.rows.length)} of {review.rows.length}</p>
              <button className="btn btn-secondary" type="button" disabled={(reviewPage + 1) * 25 >= review.rows.length} onClick={() => setReviewPage((page) => page + 1)}>Next records</button>
            </div>
          )}
          <div className="intake-actions">
            <button className="btn btn-primary" type="button" disabled={review.validCount === 0} onClick={importReview}>Import approved facilities</button>
            <button className="btn btn-secondary" type="button" onClick={() => { setReview(null); setReviewPage(0); setStatus("Review discarded. No facility records were added."); }}>Discard review</button>
          </div>
        </section>
      )}
      <details className="transport-panel facility-manual-entry">
        <summary>
          <span><span className="transport-eyebrow">Manual entry</span><strong>Add one location</strong></span>
          <span className="facility-manual-toggle">Open form</span>
        </summary>
        <form onSubmit={saveManualFacility}>
          <div className="transport-form-grid facility-form-grid">
            <label>Facility name<input required value={manualFacility.name} onChange={(event) => updateManual("name", event.target.value)} /></label>
            <label>Site ID<input value={manualFacility.siteId} onChange={(event) => updateManual("siteId", event.target.value)} /></label>
            <label>Facility type<select value={manualFacility.facilityType} onChange={(event) => updateManual("facilityType", event.target.value)}><option value="SUPPLIER">Supplier</option><option value="CROSSDOCK">Cross-dock</option><option value="DC">DC</option><option value="MFC">MFC</option><option value="OTHER">Other</option></select></label>
            <label>Property type<select value={manualFacility.propertyType} onChange={(event) => updateManual("propertyType", event.target.value)}><option value="COMMERCIAL">Commercial</option><option value="RESIDENTIAL">Residential</option></select></label>
            <label className="facility-address-field">Street address<input required value={manualFacility.address} onChange={(event) => updateManual("address", event.target.value)} /></label>
            <label>City<input required value={manualFacility.city} onChange={(event) => updateManual("city", event.target.value)} /></label>
            <label>State / province<input required value={manualFacility.state} onChange={(event) => updateManual("state", event.target.value)} /></label>
            <label>Postal code<input value={manualFacility.postalCode} onChange={(event) => updateManual("postalCode", event.target.value)} /></label>
            <label>Primary contact name<input value={manualFacility.primaryContactName} onChange={(event) => updateManual("primaryContactName", event.target.value)} /></label>
            <label>Contact title<input value={manualFacility.primaryContactTitle} onChange={(event) => updateManual("primaryContactTitle", event.target.value)} /></label>
            <label>Contact email<input type="email" value={manualFacility.primaryContactEmail} onChange={(event) => updateManual("primaryContactEmail", event.target.value)} /></label>
            <label>Contact phone<input type="tel" value={manualFacility.primaryContactPhone} onChange={(event) => updateManual("primaryContactPhone", event.target.value)} /></label>
            <label>Regional manager<input value={manualFacility.regionalManager} onChange={(event) => updateManual("regionalManager", event.target.value)} /></label>
            <label>Supply Chain Business Partner<input value={manualFacility.supplyChainBusinessPartner} onChange={(event) => updateManual("supplyChainBusinessPartner", event.target.value)} /></label>
            <label className="facility-hours-field">Operating hours<input value={manualFacility.operatingHours} onChange={(event) => updateManual("operatingHours", event.target.value)} placeholder="Mon-Fri 08:00-17:00" /></label>
          </div>
          <div className="intake-actions">
            <button className="btn btn-primary" type="submit" disabled={savingManual}>{savingManual ? "Adding location..." : "Add location"}</button>
            {manualStatus && <p className="ops-note" role="status">{manualStatus}</p>}
          </div>
        </form>
      </details>
      <section className="transport-panel">
        <div className="transport-panel-header facility-list-header">
          <div>
            <p className="transport-eyebrow">On file</p>
            <h3>{locationSearch.trim() ? `${filteredFacilities.length} of ${facilities.length}` : facilities.length} location(s)</h3>
          </div>
          <label className="facility-search">
            <span>Search locations</span>
            <input type="search" value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} placeholder="Name, Site ID, address, contact, type..." />
          </label>
        </div>
        <div className="transport-table-wrap">
          <table className="transport-table">
            <thead><tr><th>Facility</th><th>Site ID</th><th>Address</th><th>Contact</th><th>Ownership</th><th>Hours</th><th>Type</th><th>Property</th></tr></thead>
            <tbody>{filteredFacilities.map((facility) => <tr key={facility.facilityId}><td>{facility.name}</td><td>{facility.siteId ?? "--"}</td><td>{[facility.address, facility.city, facility.state, facility.postalCode].filter(Boolean).join(", ")}</td><td>{contactDetails(facility)}</td><td>{ownershipDetails(facility)}</td><td>{facility.operatingHours ?? "--"}</td><td>{facility.facilityType}</td><td>{facility.propertyType}</td></tr>)}</tbody>
          </table>
        </div>
        {facilities.length === 0 && <p className="ops-note">No facility records are on file.</p>}
        {facilities.length > 0 && filteredFacilities.length === 0 && <p className="ops-note">No locations match your search.</p>}
      </section>
    </div>
  );
}
