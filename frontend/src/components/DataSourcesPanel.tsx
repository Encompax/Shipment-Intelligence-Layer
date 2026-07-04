import { useEffect, useMemo, useState } from "react";
import {
  createDatasource,
  createTransportationLoad,
  fetchDatasources,
  fetchUploadPreview,
  importUploadCarriers,
  importUploadLaneRates,
  importUploadLoads,
  uploadFile,
} from "../api/client";

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

type IntakeMode = "manual" | "file" | "pipeline";

const sourceTypeOptions = [
  { value: "manual_loads", label: "Manual Loads", route: "Transportation Command" },
  { value: "csv_excel", label: "CSV / Excel", route: "Data Mapping" },
  { value: "sql_pipeline", label: "SQL Pipeline", route: "Live Sync" },
  { value: "tms_connection", label: "TMS Connection", route: "Shipment Execution" },
  { value: "carrier_network", label: "Carrier Network", route: "Bid Scoring" },
];

type ManualLoadForm = {
  customerName: string;
  customerId: string;
  direction: "OUTBOUND" | "INBOUND" | "TRANSFER";
  originFacility: string;
  originAddress: string;
  originCity: string;
  originState: string;
  originPostalCode: string;
  destinationFacility: string;
  destinationAddress: string;
  destinationCity: string;
  destinationState: string;
  destinationPostalCode: string;
  pickupWindowStart: string;
  pickupWindowEnd: string;
  deliveryWindowStart: string;
  deliveryWindowEnd: string;
  mode: "PARCEL" | "LTL" | "FTL" | "INTERMODAL" | "AIR" | "OCEAN";
  equipmentType: "DRY_VAN" | "REEFER" | "FLATBED" | "BOX_TRUCK" | "SPRINTER" | "CONTAINER" | "PARCEL";
  weightLbs: string;
  weightUnit: "LB" | "KG";
  unitCount: string;
  unitType: "EA" | "CASE" | "CARTON" | "PALLET" | "TOTE";
  handlingUnitCount: string;
  handlingUnitType: "PALLET" | "SKID" | "CARTON" | "TOTE" | "ROLL" | "DRUM";
  commodity: string;
  skuRefs: string;
  poNumber: string;
  bolNumber: string;
  customerReference: string;
  handlingRequirements: string;
  specialInstructions: string;
  targetBuyRate: string;
  targetSellRate: string;
  marginTarget: string;
  fuelSurcharge: string;
  accessorialEstimate: string;
  lumperEstimate: string;
  detentionRatePerHour: string;
  hazmat: boolean;
  temperatureControlled: boolean;
};

const initialManualLoadForm: ManualLoadForm = {
  customerName: "",
  customerId: "",
  direction: "OUTBOUND",
  originFacility: "",
  originAddress: "",
  originCity: "",
  originState: "",
  originPostalCode: "",
  destinationFacility: "",
  destinationAddress: "",
  destinationCity: "",
  destinationState: "",
  destinationPostalCode: "",
  pickupWindowStart: "",
  pickupWindowEnd: "",
  deliveryWindowStart: "",
  deliveryWindowEnd: "",
  mode: "LTL",
  equipmentType: "DRY_VAN",
  weightLbs: "",
  weightUnit: "LB",
  unitCount: "",
  unitType: "CASE",
  handlingUnitCount: "",
  handlingUnitType: "PALLET",
  commodity: "",
  skuRefs: "",
  poNumber: "",
  bolNumber: "",
  customerReference: "",
  handlingRequirements: "",
  specialInstructions: "",
  targetBuyRate: "",
  targetSellRate: "",
  marginTarget: "",
  fuelSurcharge: "",
  accessorialEstimate: "",
  lumperEstimate: "",
  detentionRatePerHour: "",
  hazmat: false,
  temperatureControlled: false,
};

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

const parseListInput = (value: string) =>
  value
    .split(/[;,|]/)
    .map((item) => item.trim())
    .filter(Boolean);

const autoMap = (headers: string[], patterns: RegExp[]) =>
  headers.find((header) => patterns.some((pattern) => pattern.test(header))) ?? "";

export default function DataSourcesPanel() {
  const [items, setItems] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<IntakeMode>("manual");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "Gopuff shipment workbook",
    type: "csv_excel",
    description: "Shipment planning, carrier bid, and lane-rate data staged for SIL.",
    owner: "Transportation",
    cadence: "Weekly",
  });
  const [manualLoad, setManualLoad] = useState<ManualLoadForm>(initialManualLoadForm);
  const [manualStatus, setManualStatus] = useState<string | null>(null);

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

  function updateManualLoad<K extends keyof ManualLoadForm>(key: K, value: ManualLoadForm[K]) {
    setManualLoad((current) => ({ ...current, [key]: value }));
    setManualStatus(null);
  }

  const manualQualityChecks = useMemo(() => {
    const checks: string[] = [];
    if (!manualLoad.customerName.trim()) checks.push("Customer name is required before a governed load can be created.");
    if (!manualLoad.originCity.trim() || !manualLoad.originState.trim()) checks.push("Origin city and state are required.");
    if (!manualLoad.destinationCity.trim() || !manualLoad.destinationState.trim()) checks.push("Destination city and state are required.");
    if (!manualLoad.pickupWindowStart || !manualLoad.deliveryWindowStart) {
      checks.push("Pickup and delivery windows are recommended for appointment and service-risk visibility.");
    }
    if (!manualLoad.weightLbs || !manualLoad.handlingUnitCount) {
      checks.push("Weight and handling units are recommended for BOL, manifest, and carrier fit checks.");
    }
    if (!manualLoad.targetBuyRate || !manualLoad.targetSellRate) {
      checks.push("Buy and sell targets are recommended for broker margin governance.");
    }
    if (manualLoad.direction === "INBOUND") {
      checks.push("Inbound loads can feed receiving and inventory once product/SKU details are confirmed.");
    }
    return checks;
  }, [manualLoad]);

  async function handleCreateManualLoad(event: React.FormEvent) {
    event.preventDefault();
    const customerName = manualLoad.customerName.trim();
    const originCity = manualLoad.originCity.trim();
    const originState = manualLoad.originState.trim();
    const destinationCity = manualLoad.destinationCity.trim();
    const destinationState = manualLoad.destinationState.trim();

    if (!customerName || !originCity || !originState || !destinationCity || !destinationState) {
      setManualStatus("Customer, origin, and destination are required before creating a load.");
      return;
    }

    const payload = {
      customerName,
      customerId:
        manualLoad.customerId.trim() ||
        customerName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      direction: manualLoad.direction,
      origin: {
        facilityName: manualLoad.originFacility.trim() || undefined,
        address: manualLoad.originAddress.trim() || undefined,
        city: originCity,
        state: originState.toUpperCase(),
        postalCode: manualLoad.originPostalCode.trim() || undefined,
      },
      destination: {
        facilityName: manualLoad.destinationFacility.trim() || undefined,
        address: manualLoad.destinationAddress.trim() || undefined,
        city: destinationCity,
        state: destinationState.toUpperCase(),
        postalCode: manualLoad.destinationPostalCode.trim() || undefined,
      },
      pickupWindowStart: manualLoad.pickupWindowStart || undefined,
      pickupWindowEnd: manualLoad.pickupWindowEnd || undefined,
      deliveryWindowStart: manualLoad.deliveryWindowStart || undefined,
      deliveryWindowEnd: manualLoad.deliveryWindowEnd || undefined,
      mode: manualLoad.mode,
      equipmentType: manualLoad.equipmentType,
      weightLbs: parseNumberInput(manualLoad.weightLbs),
      weightUnit: manualLoad.weightUnit,
      unitCount: parseNumberInput(manualLoad.unitCount),
      unitType: manualLoad.unitType,
      handlingUnitCount: parseNumberInput(manualLoad.handlingUnitCount),
      handlingUnitType: manualLoad.handlingUnitType,
      commodity: manualLoad.commodity.trim() || undefined,
      skuRefs: parseListInput(manualLoad.skuRefs),
      poNumber: manualLoad.poNumber.trim() || undefined,
      bolNumber: manualLoad.bolNumber.trim() || undefined,
      customerReference: manualLoad.customerReference.trim() || undefined,
      handlingRequirements: parseListInput(manualLoad.handlingRequirements),
      specialInstructions: manualLoad.specialInstructions.trim() || undefined,
      hazmat: manualLoad.hazmat,
      temperatureControlled: manualLoad.temperatureControlled,
      targetBuyRate: parseNumberInput(manualLoad.targetBuyRate),
      targetSellRate: parseNumberInput(manualLoad.targetSellRate),
      marginTarget: parseNumberInput(manualLoad.marginTarget),
      fuelSurcharge: parseNumberInput(manualLoad.fuelSurcharge),
      accessorialEstimate: parseNumberInput(manualLoad.accessorialEstimate),
      lumperEstimate: parseNumberInput(manualLoad.lumperEstimate),
      detentionRatePerHour: parseNumberInput(manualLoad.detentionRatePerHour),
      source: "manual",
    };

    try {
      setManualStatus("Creating SIL load...");
      const result = await createTransportationLoad(payload);
      setManualStatus(`Created load ${result.load?.loadId ?? "record"} and recorded workflow evidence.`);
      setManualLoad(initialManualLoadForm);
    } catch (err) {
      setManualStatus(err instanceof Error ? err.message : "Manual load creation failed");
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
      }
      setFile(null);
      setStatus(uploadId ? "Upload complete. Preview is ready for mapping." : "Upload complete. Ingest job recorded for review.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function handleImportLoads() {
    if (!preview) return;

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

  if (loading) return <div className="empty-state">Loading intake controls...</div>;

  return (
    <div className="data-intake">
      <section className="transport-hero intake-hero">
        <div>
          <p className="transport-eyebrow">Organization Data Intake</p>
          <h2>Connect the Work as It Exists Today</h2>
          <p>
            Start with manual entry, import spreadsheets, or stage a live database connection. SIL keeps the raw
            operating source scoped to the workspace and sends governed signals into Encompax when decisions need review.
          </p>
        </div>
        <div className="transport-flow">
          <span>Manual</span>
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
          { key: "manual" as const, title: "Manual Entry", body: "Best for solo operators and early workflow capture." },
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
              <h3>{activeMode === "manual" ? "Manual Entry Map" : activeMode === "file" ? "File Upload" : "Pipeline Staging"}</h3>
            </div>
            <span>{selectedSource?.name ?? "No source selected"}</span>
          </div>

          {activeMode === "manual" && (
            <form className="manual-load-builder" onSubmit={handleCreateManualLoad}>
              <div className="manual-section">
                <div>
                  <p className="transport-eyebrow">Load Identity</p>
                  <h4>Shipment Record</h4>
                </div>
                <div className="manual-field-grid">
                  <label>
                    Customer Name
                    <input value={manualLoad.customerName} onChange={(event) => updateManualLoad("customerName", event.target.value)} />
                  </label>
                  <label>
                    Customer ID
                    <input value={manualLoad.customerId} onChange={(event) => updateManualLoad("customerId", event.target.value)} />
                  </label>
                  <label>
                    Direction
                    <select value={manualLoad.direction} onChange={(event) => updateManualLoad("direction", event.target.value as ManualLoadForm["direction"])}>
                      <option value="OUTBOUND">Outbound</option>
                      <option value="INBOUND">Inbound</option>
                      <option value="TRANSFER">Transfer</option>
                    </select>
                  </label>
                  <label>
                    Mode
                    <select value={manualLoad.mode} onChange={(event) => updateManualLoad("mode", event.target.value as ManualLoadForm["mode"])}>
                      <option value="PARCEL">Small Parcel</option>
                      <option value="LTL">LTL</option>
                      <option value="FTL">Truckload</option>
                      <option value="INTERMODAL">Intermodal</option>
                      <option value="AIR">Air</option>
                      <option value="OCEAN">Ocean</option>
                    </select>
                  </label>
                  <label>
                    Equipment
                    <select
                      value={manualLoad.equipmentType}
                      onChange={(event) => updateManualLoad("equipmentType", event.target.value as ManualLoadForm["equipmentType"])}
                    >
                      <option value="DRY_VAN">Dry Van</option>
                      <option value="REEFER">Reefer</option>
                      <option value="FLATBED">Flatbed</option>
                      <option value="BOX_TRUCK">Box Truck</option>
                      <option value="SPRINTER">Sprinter</option>
                      <option value="CONTAINER">Container</option>
                      <option value="PARCEL">Parcel</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="manual-section two-column">
                <div>
                  <p className="transport-eyebrow">Origin</p>
                  <div className="manual-field-grid compact">
                    <label>
                      Facility
                      <input value={manualLoad.originFacility} onChange={(event) => updateManualLoad("originFacility", event.target.value)} />
                    </label>
                    <label>
                      Address
                      <input value={manualLoad.originAddress} onChange={(event) => updateManualLoad("originAddress", event.target.value)} />
                    </label>
                    <label>
                      City
                      <input value={manualLoad.originCity} onChange={(event) => updateManualLoad("originCity", event.target.value)} />
                    </label>
                    <label>
                      State
                      <input value={manualLoad.originState} onChange={(event) => updateManualLoad("originState", event.target.value)} />
                    </label>
                    <label>
                      Postal
                      <input value={manualLoad.originPostalCode} onChange={(event) => updateManualLoad("originPostalCode", event.target.value)} />
                    </label>
                  </div>
                </div>
                <div>
                  <p className="transport-eyebrow">Destination</p>
                  <div className="manual-field-grid compact">
                    <label>
                      Facility
                      <input value={manualLoad.destinationFacility} onChange={(event) => updateManualLoad("destinationFacility", event.target.value)} />
                    </label>
                    <label>
                      Address
                      <input value={manualLoad.destinationAddress} onChange={(event) => updateManualLoad("destinationAddress", event.target.value)} />
                    </label>
                    <label>
                      City
                      <input value={manualLoad.destinationCity} onChange={(event) => updateManualLoad("destinationCity", event.target.value)} />
                    </label>
                    <label>
                      State
                      <input value={manualLoad.destinationState} onChange={(event) => updateManualLoad("destinationState", event.target.value)} />
                    </label>
                    <label>
                      Postal
                      <input value={manualLoad.destinationPostalCode} onChange={(event) => updateManualLoad("destinationPostalCode", event.target.value)} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="manual-section">
                <p className="transport-eyebrow">Freight Detail</p>
                <div className="manual-field-grid">
                  <label>
                    Pickup Start
                    <input type="datetime-local" value={manualLoad.pickupWindowStart} onChange={(event) => updateManualLoad("pickupWindowStart", event.target.value)} />
                  </label>
                  <label>
                    Pickup End
                    <input type="datetime-local" value={manualLoad.pickupWindowEnd} onChange={(event) => updateManualLoad("pickupWindowEnd", event.target.value)} />
                  </label>
                  <label>
                    Delivery Start
                    <input type="datetime-local" value={manualLoad.deliveryWindowStart} onChange={(event) => updateManualLoad("deliveryWindowStart", event.target.value)} />
                  </label>
                  <label>
                    Delivery End
                    <input type="datetime-local" value={manualLoad.deliveryWindowEnd} onChange={(event) => updateManualLoad("deliveryWindowEnd", event.target.value)} />
                  </label>
                  <label>
                    Weight
                    <input type="number" min="0" value={manualLoad.weightLbs} onChange={(event) => updateManualLoad("weightLbs", event.target.value)} />
                  </label>
                  <label>
                    Weight Unit
                    <select value={manualLoad.weightUnit} onChange={(event) => updateManualLoad("weightUnit", event.target.value as ManualLoadForm["weightUnit"])}>
                      <option value="LB">LB</option>
                      <option value="KG">KG</option>
                    </select>
                  </label>
                  <label>
                    Units
                    <input type="number" min="0" value={manualLoad.unitCount} onChange={(event) => updateManualLoad("unitCount", event.target.value)} />
                  </label>
                  <label>
                    Unit Type
                    <select value={manualLoad.unitType} onChange={(event) => updateManualLoad("unitType", event.target.value as ManualLoadForm["unitType"])}>
                      <option value="EA">Each</option>
                      <option value="CASE">Case</option>
                      <option value="CARTON">Carton</option>
                      <option value="PALLET">Pallet</option>
                      <option value="TOTE">Tote</option>
                    </select>
                  </label>
                  <label>
                    Handling Units
                    <input
                      type="number"
                      min="0"
                      value={manualLoad.handlingUnitCount}
                      onChange={(event) => updateManualLoad("handlingUnitCount", event.target.value)}
                    />
                  </label>
                  <label>
                    Handling Unit Type
                    <select
                      value={manualLoad.handlingUnitType}
                      onChange={(event) => updateManualLoad("handlingUnitType", event.target.value as ManualLoadForm["handlingUnitType"])}
                    >
                      <option value="PALLET">Pallet</option>
                      <option value="SKID">Skid</option>
                      <option value="CARTON">Carton</option>
                      <option value="TOTE">Tote</option>
                      <option value="ROLL">Roll</option>
                      <option value="DRUM">Drum</option>
                    </select>
                  </label>
                  <label>
                    Commodity
                    <input value={manualLoad.commodity} onChange={(event) => updateManualLoad("commodity", event.target.value)} />
                  </label>
                  <label>
                    SKUs
                    <input value={manualLoad.skuRefs} onChange={(event) => updateManualLoad("skuRefs", event.target.value)} placeholder="SKU-1001, SKU-1002" />
                  </label>
                </div>
              </div>

              <div className="manual-section">
                <p className="transport-eyebrow">Commercial and Documents</p>
                <div className="manual-field-grid">
                  <label>
                    PO Number
                    <input value={manualLoad.poNumber} onChange={(event) => updateManualLoad("poNumber", event.target.value)} />
                  </label>
                  <label>
                    BOL Number
                    <input value={manualLoad.bolNumber} onChange={(event) => updateManualLoad("bolNumber", event.target.value)} />
                  </label>
                  <label>
                    Customer Reference
                    <input value={manualLoad.customerReference} onChange={(event) => updateManualLoad("customerReference", event.target.value)} />
                  </label>
                  <label>
                    Target Buy
                    <input type="number" min="0" value={manualLoad.targetBuyRate} onChange={(event) => updateManualLoad("targetBuyRate", event.target.value)} />
                  </label>
                  <label>
                    Target Sell
                    <input type="number" min="0" value={manualLoad.targetSellRate} onChange={(event) => updateManualLoad("targetSellRate", event.target.value)} />
                  </label>
                  <label>
                    Margin Target
                    <input type="number" min="0" value={manualLoad.marginTarget} onChange={(event) => updateManualLoad("marginTarget", event.target.value)} />
                  </label>
                  <label>
                    Fuel
                    <input type="number" min="0" value={manualLoad.fuelSurcharge} onChange={(event) => updateManualLoad("fuelSurcharge", event.target.value)} />
                  </label>
                  <label>
                    Accessorials
                    <input type="number" min="0" value={manualLoad.accessorialEstimate} onChange={(event) => updateManualLoad("accessorialEstimate", event.target.value)} />
                  </label>
                  <label>
                    Lumper
                    <input type="number" min="0" value={manualLoad.lumperEstimate} onChange={(event) => updateManualLoad("lumperEstimate", event.target.value)} />
                  </label>
                  <label>
                    Detention / Hr
                    <input
                      type="number"
                      min="0"
                      value={manualLoad.detentionRatePerHour}
                      onChange={(event) => updateManualLoad("detentionRatePerHour", event.target.value)}
                    />
                  </label>
                </div>
                <div className="manual-checkbox-row">
                  <label>
                    <input type="checkbox" checked={manualLoad.hazmat} onChange={(event) => updateManualLoad("hazmat", event.target.checked)} />
                    Hazmat
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={manualLoad.temperatureControlled}
                      onChange={(event) => updateManualLoad("temperatureControlled", event.target.checked)}
                    />
                    Temperature controlled
                  </label>
                </div>
                <label className="intake-wide-field">
                  Handling Requirements
                  <textarea
                    rows={2}
                    value={manualLoad.handlingRequirements}
                    onChange={(event) => updateManualLoad("handlingRequirements", event.target.value)}
                    placeholder="Dock appointment required; liftgate; no stack"
                  />
                </label>
                <label className="intake-wide-field">
                  Special Instructions
                  <textarea
                    rows={3}
                    value={manualLoad.specialInstructions}
                    onChange={(event) => updateManualLoad("specialInstructions", event.target.value)}
                  />
                </label>
              </div>

              <div className="data-quality-queue">
                <div>
                  <p className="transport-eyebrow">Error Correction Queue</p>
                  <h4>Guided Completeness Checks</h4>
                </div>
                {manualQualityChecks.map((check) => (
                  <div key={check} className="quality-card">
                    {check}
                  </div>
                ))}
              </div>

              <div className="intake-actions">
                <button className="btn btn-primary" type="submit">
                  Create SIL Load
                </button>
                {manualStatus && <p className="ops-note">{manualStatus}</p>}
              </div>
            </form>
          )}

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
                  <div className="manual-field-grid">
                    {loadMappingFields.map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <select
                          value={mapping[field] ?? ""}
                          onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
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
                          onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
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
                          onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}
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
                  <button className="btn btn-primary" type="button" onClick={handleImportLoads}>
                    Import Mapped Loads
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={handleImportCarriers}>
                    Import Carrier Profiles
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={handleImportLaneRates}>
                    Import Lane Rates
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
