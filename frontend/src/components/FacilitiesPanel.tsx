import { useEffect, useState } from "react";
import { fetchFacilities, importReviewedFacilities, reviewFacilities } from "../api/client";

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

export default function FacilitiesPanel() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [review, setReview] = useState<FacilityReview | null>(null);

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
      setStatus("Encompax is reviewing the facility file...");
      setReview(null);
      const result = await reviewFacilities(file);
      setReview(result as FacilityReview);
      setStatus("Council review is ready. No facility records have been added yet.");
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
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setReview(null); setStatus(null); }} />
          <button className="btn btn-primary" type="button" disabled={!file} onClick={reviewUpload}>Review with Encompax</button>
          <a className="btn btn-secondary" href="/templates/sil-facility-import-template.xlsx" download>Download facility template</a>
        </div>
        <p className="ops-note">The Excel template includes Facility Type and Property Type dropdowns. Encompax reviews the file before anything is added and requires your confirmation to import it.</p>
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
              <thead><tr><th>Facility</th><th>Address</th><th>Type</th><th>Property</th></tr></thead>
              <tbody>{review.rows.slice(0, 10).map((facility) => <tr key={facility.facilityId}><td>{facility.name}</td><td>{[facility.address, facility.city, facility.state, facility.postalCode].filter(Boolean).join(", ")}</td><td>{facility.facilityType}</td><td>{facility.propertyType}</td></tr>)}</tbody>
            </table>
          </div>
          {review.rows.length > 10 && <p className="ops-note">Previewing the first 10 reviewed records.</p>}
          <div className="intake-actions">
            <button className="btn btn-primary" type="button" disabled={review.validCount === 0} onClick={importReview}>Import approved facilities</button>
            <button className="btn btn-secondary" type="button" onClick={() => { setReview(null); setStatus("Review discarded. No facility records were added."); }}>Discard review</button>
          </div>
        </section>
      )}
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
