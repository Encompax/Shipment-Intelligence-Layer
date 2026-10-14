import { useEffect, useMemo, useState } from "react";
import {
  createDatasource,
  createOrderIntakeReview,
  approveOrderIntakeReview,
  createOrderIntakeProfile,
  fetchOrderIntakeProfiles,
  fetchDatasources,
  fetchUploadPreview,
  importUploadCarriers,
  importUploadLaneRates,
  importUploadLoads,
  proposeUploadMapping,
  uploadFile,
} from "../api/client";
import { EdiConnectionSetup } from "./EdiConfigurationPanel";

type DataSource = {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  createdAt?: string;
};

type UploadPreview = {
  upload: { id: number; originalName: string };
  format?: string;
  sheetName?: string | null;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
};

type IntakeMode = "edi" | "file" | "pipeline";

type MappingReview = {
  governanceStatus: "READY_FOR_OPERATOR_APPROVAL";
  proposal: {
    dataset: "ORDERS" | "LOADS" | "CARRIERS" | "LANE_RATES" | "UNSUPPORTED";
    mapping: Record<string, string>;
    confidence: number;
    summary: string;
    reviewNotes: string[];
  };
};

type OrderIntakeProfile = { profileId: string; name: string; mapping: Record<string, string> };
type OrderIntakeReview = { reviewId: string; totalRows: number; proposedRows: Record<string, unknown>[]; corrections: Array<{ row: number; field: string; originalValue: unknown; proposedValue: unknown; reason: string }>; comparisons: Array<{ row: number; original: Record<string, unknown>; proposed: Record<string, unknown>; corrections: unknown[]; issues: Array<{ severity: string; message: string }> }>; issues: Array<{ row: number; severity: "ERROR" | "REVIEW"; field: string; code?: string; message: string }> };

const orderMappingFields = [
  ["primaryReference", "Primary reference"], ["poNumber", "PO number"], ["materialTransferOrderNumber", "Transfer order number"], ["meid", "MEID"],
  ["businessUnit", "Business unit"], ["earliestPickup", "Earliest pickup"], ["latestPickup", "Latest pickup"], ["earliestDelivery", "Earliest delivery"], ["latestDelivery", "Latest delivery"],
  ["originId", "Origin site ID"], ["destinationId", "Destination site ID"], ["quantity", "Quantity"], ["quantityUom", "Quantity UOM"], ["lines", "Lines"], ["weight", "Weight"], ["weightUom", "Weight UOM"],
  ["waterWeight", "Water weight"], ["equipmentType", "Equipment"], ["scac", "SCAC"], ["modeType", "Mode"], ["orderType", "Order type"], ["handlingUnits", "Handling units"], ["handlingUnitsUom", "Handling units UOM"], ["waterPallets", "Water pallets"], ["eachQuantity", "Each quantity"], ["caseQuantity", "Case quantity"], ["palletQuantity", "Pallet quantity"],
] as const;

const sourceTypeOptions = [
  { value: "edi_x12", label: "EDI / X12", route: "Governed EDI" },
  { value: "csv_excel", label: "CSV / Excel", route: "Data Mapping" },
  { value: "sql_pipeline", label: "SQL Pipeline", route: "Live Sync" },
  { value: "tms_connection", label: "TMS Connection", route: "Shipment Execution" },
  { value: "carrier_network", label: "Carrier Network", route: "Bid Scoring" },
];

const loadMappingFields = [
  ["customerName", "Customer"],
  ["customerId", "Customer ID"],
  ["direction", "Direction"],
  ["originFacility", "Origin Facility"],
  ["originAddress", "Origin Address"],
  ["originCity", "Origin City"],
  ["originState", "Origin State"],
  ["originPostalCode", "Origin Postal"],
  ["destinationFacility", "Destination Facility"],
  ["destinationAddress", "Destination Address"],
  ["destinationCity", "Destination City"],
  ["destinationState", "Destination State"],
  ["destinationPostalCode", "Destination Postal"],
  ["pickupWindowStart", "Pickup Start"],
  ["pickupWindowEnd", "Pickup End"],
  ["deliveryWindowStart", "Delivery Start"],
  ["deliveryWindowEnd", "Delivery End"],
  ["mode", "Mode"],
  ["equipmentType", "Equipment"],
  ["weightLbs", "Weight"],
  ["weightUnit", "Weight Unit"],
  ["unitCount", "Units"],
  ["unitType", "Unit Type"],
  ["handlingUnitCount", "Handling Units"],
  ["handlingUnitType", "Handling Unit Type"],
  ["commodity", "Commodity"],
  ["skuRefs", "SKUs"],
  ["poNumber", "PO Number"],
  ["bolNumber", "BOL Number"],
  ["customerReference", "Customer Ref"],
  ["handlingRequirements", "Handling Requirements"],
  ["specialInstructions", "Special Instructions"],
  ["targetBuyRate", "Target Buy"],
  ["targetSellRate", "Target Sell"],
  ["marginTarget", "Margin Target"],
  ["fuelSurcharge", "Fuel"],
  ["accessorialEstimate", "Accessorials"],
  ["lumperEstimate", "Lumper"],
  ["detentionRatePerHour", "Detention / Hr"],
  ["hazmat", "Hazmat"],
  ["temperatureControlled", "Temp Controlled"],
];

const parseNumberInput = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const autoMap = (headers: string[], patterns: RegExp[]) =>
  headers.find((header) => patterns.some((pattern) => pattern.test(header))) ?? "";

export default function DataSourcesPanel() {
  const [items, setItems] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<IntakeMode>("edi");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingReview, setMappingReview] = useState<MappingReview | null>(null);
  const [orderReview, setOrderReview] = useState<OrderIntakeReview | null>(null);
  const [orderProfiles, setOrderProfiles] = useState<OrderIntakeProfile[]>([]);
  const [selectedOrderProfileId, setSelectedOrderProfileId] = useState("");
  const [orderProfileName, setOrderProfileName] = useState("");
  const [orderMapping, setOrderMapping] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "Gopuff shipment workbook",
    type: "csv_excel",
    description: "Shipment planning, carrier bid, and lane-rate data staged for SIL.",
    owner: "Transportation",
    cadence: "Weekly",
  });

  async function load() {
    try {
      setLoading(true);
      const data = await fetchDatasources();
      const nextItems = Array.isArray(data) ? data : [];
      setItems(nextItems);
      setSelectedSourceId((current) => current ?? nextItems[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data sources");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetchOrderIntakeProfiles().then((result) => setOrderProfiles(result.profiles ?? [])).catch(() => undefined);
  }, []);

  const selectedSource = useMemo(
    () => items.find((source) => source.id === selectedSourceId) ?? null,
    [items, selectedSourceId]
  );

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name || !form.type) return;

    try {
      setStatus("Creating data source...");
      const created = await createDatasource({
        name: form.name,
        type: form.type,
        description: `${form.description} Owner: ${form.owner}. Cadence: ${form.cadence}.`,
      });
      await load();
      setSelectedSourceId(created.id);
      setStatus("Data source created.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Data source creation failed");
    }
  }

  async function handleUpload() {
    if (!selectedSourceId || !file) return;

    try {
      setStatus("Uploading file and creating ingest job...");
      const uploadResult = await uploadFile(selectedSourceId, file);
      const uploadId = uploadResult.uploads?.[0]?.id;
      if (uploadId) {
        const previewResult = await fetchUploadPreview(uploadId);
        setPreview(previewResult);
        const headers = previewResult.headers ?? [];
        setMapping({
          customerName: autoMap(headers, [/customer|account|shipper/i]) || headers[0] || "",
          customerId: autoMap(headers, [/customer.*id|account.*id/i]),
          direction: autoMap(headers, [/direction|inbound|outbound/i]),
          originFacility: autoMap(headers, [/origin.*facility|pickup.*facility|shipper.*name/i]),
          originAddress: autoMap(headers, [/origin.*address|pickup.*address|shipper.*address/i]),
          originCity: autoMap(headers, [/origin.*city|pickup.*city|from.*city/i]),
          originState: autoMap(headers, [/origin.*state|pickup.*state|from.*state/i]),
          originPostalCode: autoMap(headers, [/origin.*postal|origin.*zip|pickup.*zip/i]),
          destinationFacility: autoMap(headers, [/dest.*facility|delivery.*facility|consignee.*name/i]),
          destinationAddress: autoMap(headers, [/dest.*address|delivery.*address|consignee.*address/i]),
          destinationCity: autoMap(headers, [/dest.*city|delivery.*city|to.*city/i]),
          destinationState: autoMap(headers, [/dest.*state|delivery.*state|to.*state/i]),
          destinationPostalCode: autoMap(headers, [/dest.*postal|dest.*zip|delivery.*zip/i]),
          pickupWindowStart: autoMap(headers, [/pickup.*start|pickup.*window|ready.*time/i]),
          pickupWindowEnd: autoMap(headers, [/pickup.*end|pickup.*close/i]),
          deliveryWindowStart: autoMap(headers, [/delivery.*start|delivery.*window/i]),
          deliveryWindowEnd: autoMap(headers, [/delivery.*end|delivery.*close/i]),
          mode: autoMap(headers, [/^mode$|transport.*mode|service.*level/i]),
          equipmentType: autoMap(headers, [/equipment|trailer/i]),
          weightLbs: autoMap(headers, [/weight|gross/i]),
          weightUnit: autoMap(headers, [/weight.*unit/i]),
          unitCount: autoMap(headers, [/unit.*count|quantity|qty/i]),
          unitType: autoMap(headers, [/unit.*type|package.*type/i]),
          handlingUnitCount: autoMap(headers, [/handling.*unit|pallet.*count|skid.*count/i]),
          handlingUnitType: autoMap(headers, [/handling.*type|pallet|skid/i]),
          commodity: autoMap(headers, [/commodity|description|material/i]),
          skuRefs: autoMap(headers, [/sku|item/i]),
          poNumber: autoMap(headers, [/po|purchase.*order/i]),
          bolNumber: autoMap(headers, [/bol|bill.*lading/i]),
          customerReference: autoMap(headers, [/customer.*ref|reference/i]),
          handlingRequirements: autoMap(headers, [/handling.*requirement|requirement/i]),
          specialInstructions: autoMap(headers, [/instruction|notes/i]),
          hazmat: autoMap(headers, [/hazmat|hazard/i]),
          temperatureControlled: autoMap(headers, [/temp|temperature|reefer/i]),
          targetBuyRate: autoMap(headers, [/buy|cost|carrier.*rate/i]),
          targetSellRate: autoMap(headers, [/sell|revenue|customer.*rate/i]),
          marginTarget: autoMap(headers, [/margin/i]),
          fuelSurcharge: autoMap(headers, [/fuel/i]),
          accessorialEstimate: autoMap(headers, [/accessorial/i]),
          lumperEstimate: autoMap(headers, [/lumper/i]),
          detentionRatePerHour: autoMap(headers, [/detention/i]),
          carrierName: autoMap(headers, [/carrier|vendor|provider/i]),
          mcNumber: autoMap(headers, [/^mc|mc.*number/i]),
          dotNumber: autoMap(headers, [/^dot|dot.*number/i]),
          insuranceStatus: autoMap(headers, [/insurance/i]),
          safetyStatus: autoMap(headers, [/safety/i]),
          creditStatus: autoMap(headers, [/credit/i]),
          serviceScore: autoMap(headers, [/service.*score|score/i]),
          onTimeRate: autoMap(headers, [/on.*time|ontime|otp/i]),
          falloffRate: autoMap(headers, [/falloff|fall.*off|cancel/i]),
          preferred: autoMap(headers, [/preferred|primary/i]),
          blocked: autoMap(headers, [/blocked|do.*not.*use|dnu/i]),
          originRegion: autoMap(headers, [/origin.*region|origin.*state|from.*state|lane.*origin/i]),
          destinationRegion: autoMap(headers, [/dest.*region|dest.*state|to.*state|lane.*dest/i]),
          lowRate: autoMap(headers, [/low.*rate|min.*rate/i]),
          medianRate: autoMap(headers, [/median.*rate|market.*rate|avg.*rate|average.*rate/i]),
          highRate: autoMap(headers, [/high.*rate|max.*rate/i]),
          averageTransitDays: autoMap(headers, [/transit.*day|avg.*day/i]),
          transitVarianceDays: autoMap(headers, [/variance.*day|transit.*variance/i]),
          sampleSize: autoMap(headers, [/sample|volume|count/i]),
        });
        setMappingReview(null);
        setOrderReview(null);
        setOrderMapping({});
      }
      setFile(null);
      setStatus(uploadId ? "Upload complete. Preview is ready for mapping." : "Upload complete. Ingest job recorded for review.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleMappingProposal() {
    if (!preview) return;
    try {
      setStatus("Encompax is reviewing the file structure and sample records...");
      const result = await proposeUploadMapping(preview.upload.id) as MappingReview;
      setMapping((current) => ({ ...current, ...result.proposal.mapping }));
      if (result.proposal.dataset === "ORDERS") setOrderMapping((current) => ({ ...current, ...result.proposal.mapping }));
      setMappingReview(result);
      setStatus("Governed mapping proposal ready. Confirm the fields below before importing any records.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Mapping proposal failed");
    }
  }

  function updateMapping(field: string, value: string) {
    setMapping((current) => ({ ...current, [field]: value }));
    setMappingReview(null);
  }

  async function handleImportLoads() {
    if (!preview) return;
    if (!mappingReview) {
      setStatus("Request and review an Encompax mapping proposal before approving load intake.");
      return;
    }

    try {
      setStatus("Importing mapped rows into SIL loads...");
      const result = await importUploadLoads(preview.upload.id, { mapping });
      setStatus(
        `Imported ${result.importedCount} load(s). Skipped ${result.skippedCount ?? 0} duplicate row(s). ${result.rejectedCount} row(s) need review.`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Load import failed");
    }
  }

  async function handleImportCarriers() {
    if (!preview) return;
    if (!mappingReview) {
      setStatus("Request and review an Encompax mapping proposal before approving carrier intake.");
      return;
    }

    try {
      setStatus("Importing mapped rows into SIL carrier profiles...");
      const result = await importUploadCarriers(preview.upload.id, { mapping });
      setStatus(
        `Imported ${result.importedCount} carrier profile(s). Skipped ${result.skippedCount ?? 0} duplicate row(s). ${result.rejectedCount} row(s) need review.`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Carrier import failed");
    }
  }

  async function handleImportLaneRates() {
    if (!preview) return;
    if (!mappingReview) {
      setStatus("Request and review an Encompax mapping proposal before approving lane-rate intake.");
      return;
    }

    try {
      setStatus("Importing mapped rows into SIL lane and market-rate intelligence...");
      const result = await importUploadLaneRates(preview.upload.id, { mapping });
      setStatus(
        `Imported ${result.importedCount} lane-rate record(s). Skipped ${result.skippedCount ?? 0} duplicate row(s). ${result.rejectedCount} row(s) need review.`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Lane-rate import failed");
    }
  }

  async function handleReviewOrders() {
    if (!preview) return;
    try {
      setStatus("Preparing a governed canonical order preview...");
      const result = await createOrderIntakeReview({ uploadId: preview.upload.id, sourceName: preview.upload.originalName, profileName: selectedSource?.name || "Order intake", profileId: selectedOrderProfileId || undefined, mapping: orderMapping });
      setOrderReview(result.review);
      setStatus("Order proposal ready. Rows with required-field errors will remain excluded until corrected.");
    } catch (err) { setStatus(err instanceof Error ? err.message : "Order review failed"); }
  }

  async function handleSaveOrderProfile() {
    if (!preview || !orderProfileName.trim()) { setStatus("Enter a profile name before saving the mapping."); return; }
    try {
      const result = await createOrderIntakeProfile({ name: orderProfileName.trim(), headers: preview.headers, mapping: orderMapping });
      setOrderProfiles((current) => [...current, result.profile]);
      setSelectedOrderProfileId(result.profile.profileId);
      setOrderProfileName("");
      setStatus("Reusable order intake profile saved.");
    } catch (err) { setStatus(err instanceof Error ? err.message : "Could not save order profile"); }
  }

  async function handleApproveOrders() {
    if (!orderReview) return;
    try {
      setStatus("Importing approved canonical orders...");
      const result = await approveOrderIntakeReview(orderReview.reviewId);
      setStatus(`Imported ${result.importedCount} order(s). ${result.rejectedCount} row(s) remain excluded for correction.`);
      setOrderReview(null);
    } catch (err) { setStatus(err instanceof Error ? err.message : "Order approval failed"); }
  }

  if (loading) return <div className="empty-state">Loading intake controls...</div>;

  return (
    <div className="data-intake">
      <section className="transport-hero intake-hero">
        <div>
          <p className="transport-eyebrow">Organization Data Intake</p>
          <h2>Connect the Work as It Exists Today</h2>
          <p>
            Start with EDI, import spreadsheets, or stage a live database connection. SIL keeps the raw
            operating source scoped to the workspace and sends governed signals into Encompax when decisions need review.
          </p>
        </div>
        <div className="transport-flow">
          <span>EDI</span>
          <span>CSV</span>
          <span>Excel</span>
          <span>SQL</span>
          <span>TMS</span>
          <span>Govern</span>
        </div>
      </section>

      {error && <div className="intake-alert">{error}</div>}

      <section className="intake-mode-grid">
        {[
          { key: "edi" as const, title: "EDI Connection", body: "Configure a trading partner, transport, and accountable steward." },
          { key: "file" as const, title: "CSV / Excel Upload", body: "Best for spreadsheets, exports, and recurring workbooks." },
          { key: "pipeline" as const, title: "Database Pipeline", body: "Best for SQL, TMS, ERP, or governed live sync." },
        ].map((mode) => (
          <button
            key={mode.key}
            className={`intake-mode-card${activeMode === mode.key ? " active" : ""}`}
            type="button"
            onClick={() => setActiveMode(mode.key)}
          >
            <span>{mode.title}</span>
            <p>{mode.body}</p>
          </button>
        ))}
      </section>

      <section className="transport-layout">
        <article className="transport-panel">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">Source Setup</p>
              <h3>Intake Profile</h3>
            </div>
            <span>{items.length} source(s)</span>
          </div>
          <form className="intake-form" onSubmit={handleCreate}>
            <label>
              Source Name
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              Source Type
              <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}>
                {sourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Owner / Team
              <input value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} />
            </label>
            <label>
              Refresh Cadence
              <select value={form.cadence} onChange={(event) => setForm((current) => ({ ...current, cadence: event.target.value }))}>
                <option>Manual</option>
                <option>Daily</option>
                <option>Weekly</option>
                <option>Live</option>
              </select>
            </label>
            <label className="intake-wide-field">
              Description
              <textarea
                rows={3}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Create Source
            </button>
          </form>
        </article>

        <article className="transport-panel primary">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">Input Controls</p>
              <h3>{activeMode === "edi" ? "EDI Connection Setup" : activeMode === "file" ? "File Upload" : "Pipeline Staging"}</h3>
            </div>
            <span>{selectedSource?.name ?? "No source selected"}</span>
          </div>

          {activeMode === "edi" && <EdiConnectionSetup embedded />}
          {activeMode === "file" && (
            <div className="file-upload-panel">
              <label>
                Target Source
                <select
                  value={selectedSourceId ?? ""}
                  onChange={(event) => setSelectedSourceId(event.target.value)}
                >
                  {items.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Upload CSV or Excel
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setStatus(null);
                  }}
                />
              </label>
              <button className="btn btn-primary" type="button" disabled={!file || !selectedSourceId} onClick={handleUpload}>
                Upload File
              </button>
              <div className="intake-template-row">
                <p className="ops-note">CSV and Excel files can be previewed, mapped, and imported into SIL loads.</p>
                <a href="/templates/sil-shipment-intake-template.csv" download>
                  Download SIL intake template
                </a>
              </div>
              {preview && (
                <div className="mapping-workbench">
                  <div className="transport-panel-header compact">
                    <div>
                      <p className="transport-eyebrow">Mapping Preview</p>
                      <h4>{preview.upload.originalName}</h4>
                      {preview.sheetName && <span>Sheet: {preview.sheetName}</span>}
                    </div>
                    <span>
                      {preview.format ?? "TABLE"} / {preview.totalRows} row(s)
                    </span>
                  </div>
                  <div className="intake-governance-review">
                    <div>
                      <p className="transport-eyebrow">Encompax governed review</p>
                      <strong>{mappingReview ? "Mapping proposal ready for your approval" : "Review the file before it enters SIL"}</strong>
                      <p>
                        {mappingReview
                          ? mappingReview.proposal.summary
                          : "Encompax can inspect the headers and sample rows, classify the file, and propose a mapping. Nothing is imported during review."}
                      </p>
                    </div>
                    <button className="btn btn-secondary" type="button" onClick={handleMappingProposal}>
                      {mappingReview ? "Refresh mapping review" : "Ask Encompax to map file"}
                    </button>
                  </div>
                  {mappingReview && (
                    <div className="intake-governance-result">
                      <span>Ready for operator approval</span>
                      <strong>{mappingReview.proposal.dataset.replace("_", " ")} / {Math.round(mappingReview.proposal.confidence * 100)}% confidence</strong>
                      {mappingReview.proposal.reviewNotes.length > 0 && (
                        <ul>
                          {mappingReview.proposal.reviewNotes.map((note) => <li key={note}>{note}</li>)}
                        </ul>
                      )}
                    </div>
                  )}
                  <div className="manual-field-grid">
                    {loadMappingFields.map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <select
                          value={mapping[field] ?? ""}
                          onChange={(event) => updateMapping(field, event.target.value)}
                        >
                          <option value="">Not mapped</option>
                          {preview.headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="transport-panel-header compact">
                    <div>
                      <p className="transport-eyebrow">Carrier Profile Mapping</p>
                      <h4>Bid Scoring Inputs</h4>
                    </div>
                    <span>Optional</span>
                  </div>
                  <div className="manual-field-grid compact">
                    {[
                      ["carrierName", "Carrier"],
                      ["mcNumber", "MC Number"],
                      ["dotNumber", "DOT Number"],
                      ["insuranceStatus", "Insurance"],
                      ["safetyStatus", "Safety"],
                      ["creditStatus", "Credit"],
                      ["serviceScore", "Service Score"],
                      ["onTimeRate", "On-Time Rate"],
                      ["falloffRate", "Falloff Rate"],
                      ["preferred", "Preferred"],
                      ["blocked", "Blocked"],
                    ].map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <select
                          value={mapping[field] ?? ""}
                          onChange={(event) => updateMapping(field, event.target.value)}
                        >
                          <option value="">Not mapped</option>
                          {preview.headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="transport-panel-header compact">
                    <div>
                      <p className="transport-eyebrow">Lane Rate Mapping</p>
                      <h4>Market Intelligence Inputs</h4>
                    </div>
                    <span>Optional</span>
                  </div>
                  <div className="manual-field-grid compact">
                    {[
                      ["originRegion", "Origin Region"],
                      ["destinationRegion", "Destination Region"],
                      ["mode", "Mode"],
                      ["equipmentType", "Equipment"],
                      ["lowRate", "Low Rate"],
                      ["medianRate", "Median Rate"],
                      ["highRate", "High Rate"],
                      ["averageTransitDays", "Transit Days"],
                      ["transitVarianceDays", "Transit Variance"],
                      ["onTimeRate", "On-Time Rate"],
                      ["sampleSize", "Sample Size"],
                    ].map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <select
                          value={mapping[field] ?? ""}
                          onChange={(event) => updateMapping(field, event.target.value)}
                        >
                          <option value="">Not mapped</option>
                          {preview.headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="transport-table-wrap">
                    <table className="transport-table">
                      <thead>
                        <tr>
                          {preview.headers.slice(0, 8).map((header) => (
                            <th key={header}>{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 5).map((row, index) => (
                          <tr key={`${preview.upload.id}-${index}`}>
                            {preview.headers.slice(0, 8).map((header) => (
                              <td key={header}>{row[header]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn btn-primary" type="button" onClick={handleImportLoads} disabled={!mappingReview}>
                    Approve Mapping and Import Loads
                  </button>
                  <div className="intake-governance-review">
                    <div><p className="transport-eyebrow">Canonical order intake</p><strong>Stage orders before load planning</strong><p>Map this source once, resolve facility references, and review duplicates or corrections before approval.</p></div>
                    <button className="btn btn-secondary" type="button" onClick={handleReviewOrders}>Review as orders</button>
                  </div>
                  <div className="manual-field-grid compact">
                    <label>Saved profile<select value={selectedOrderProfileId} onChange={(event) => { const id = event.target.value; setSelectedOrderProfileId(id); const profile = orderProfiles.find((item) => item.profileId === id); if (profile) setOrderMapping(profile.mapping); }}><option value="">Automatic mapping</option>{orderProfiles.map((profile) => <option key={profile.profileId} value={profile.profileId}>{profile.name}</option>)}</select></label>
                    <label>New profile name<input value={orderProfileName} placeholder="Example: DC1 transfers" onChange={(event) => setOrderProfileName(event.target.value)} /></label>
                    <button className="btn btn-secondary" type="button" onClick={handleSaveOrderProfile}>Save this mapping</button>
                  </div>
                  <div className="manual-field-grid compact">
                    {orderMappingFields.map(([field, label]) => <label key={field}>{label}<select value={orderMapping[field] ?? ""} onChange={(event) => { setOrderMapping((current) => ({ ...current, [field]: event.target.value })); setOrderReview(null); }}><option value="">Auto-detect / not mapped</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}
                  </div>
                  {orderReview && <div className="intake-governance-result">
                    <span>Order proposal ready</span><strong>{orderReview.totalRows} proposed / {orderReview.issues.filter((issue) => issue.severity === "ERROR").length} blocking issue(s) / {orderReview.corrections.length} facility correction(s)</strong>
                    <ul>{orderReview.issues.slice(0, 10).map((issue) => <li key={`${issue.row}-${issue.field}-${issue.code}`}>Row {issue.row}: {issue.message}</li>)}</ul>
                    <div className="transport-table-wrap"><table className="transport-table"><thead><tr><th>Row</th><th>Original references</th><th>Proposed order</th><th>Review</th></tr></thead><tbody>{orderReview.comparisons.slice(0, 25).map((comparison) => <tr key={comparison.row}><td>{comparison.row}</td><td>{Object.entries(comparison.original).slice(0, 5).map(([key,value]) => `${key}: ${String(value)}`).join(" | ")}</td><td>{String(comparison.proposed.primaryReference || '--')} | {String(comparison.proposed.originId || '--')} to {String(comparison.proposed.destinationId || '--')}</td><td>{comparison.issues.map((issue) => issue.message).join(" | ") || (comparison.corrections.length ? "Facility IDs resolved" : "Ready")}</td></tr>)}</tbody></table></div>
                    <button className="btn btn-primary" type="button" onClick={handleApproveOrders}>Approve valid orders</button>
                  </div>}
                  <button className="btn btn-secondary" type="button" onClick={handleImportCarriers} disabled={!mappingReview}>
                    Approve Mapping and Import Carriers
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={handleImportLaneRates} disabled={!mappingReview}>
                    Approve Mapping and Import Lane Rates
                  </button>
                </div>
              )}
            </div>
          )}

          {activeMode === "pipeline" && (
            <div className="pipeline-grid">
              {["SQL Server", "PostgreSQL", "TMS API", "ERP Export"].map((item) => (
                <div key={item} className="pipeline-card">
                  <strong>{item}</strong>
                  <span>Staged connector</span>
                  <p>Define connection details, sync cadence, schema ownership, and Encompax routing before live activation.</p>
                </div>
              ))}
            </div>
          )}

          {status && <p className="ops-note">{status}</p>}
        </article>
      </section>

      <section className="transport-panel">
        <div className="transport-panel-header">
          <div>
            <p className="transport-eyebrow">Source Registry</p>
            <h3>Connected Organization Inputs</h3>
          </div>
        </div>
        <div className="intake-source-list">
          {items.map((source) => (
            <button
              key={source.id}
              type="button"
              className={`intake-source-row${selectedSourceId === source.id ? " active" : ""}`}
              onClick={() => setSelectedSourceId(source.id)}
            >
              <strong>{source.name}</strong>
              <span>{source.type}</span>
              <p>{source.description ?? "No description"}</p>
              <small>{source.createdAt ? new Date(source.createdAt).toLocaleString() : "New source"}</small>
            </button>
          ))}
          {items.length === 0 && <p className="ops-note">No data sources yet. Create one above to begin intake.</p>}
        </div>
      </section>
    </div>
  );
}
