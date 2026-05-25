import { useEffect, useMemo, useState } from "react";
import { createDatasource, fetchDatasources, fetchUploadPreview, importUploadLoads, uploadFile } from "../api/client";

type DataSource = {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  createdAt?: string;
};

type UploadPreview = {
  upload: { id: number; originalName: string };
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

const manualFieldTemplates = [
  "customer_name",
  "origin",
  "destination",
  "pickup_window",
  "delivery_window",
  "mode",
  "equipment_type",
  "target_buy_rate",
  "target_sell_rate",
];

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
          customerName: headers.find((header: string) => /customer|account|shipper/i.test(header)) ?? headers[0] ?? "",
          originCity: headers.find((header: string) => /origin.*city|pickup.*city|from.*city/i.test(header)) ?? "",
          originState: headers.find((header: string) => /origin.*state|pickup.*state|from.*state/i.test(header)) ?? "",
          destinationCity: headers.find((header: string) => /dest.*city|delivery.*city|to.*city/i.test(header)) ?? "",
          destinationState: headers.find((header: string) => /dest.*state|delivery.*state|to.*state/i.test(header)) ?? "",
          mode: headers.find((header: string) => /^mode$|transport.*mode/i.test(header)) ?? "",
          equipmentType: headers.find((header: string) => /equipment|trailer/i.test(header)) ?? "",
          targetBuyRate: headers.find((header: string) => /buy|cost|carrier.*rate/i.test(header)) ?? "",
          targetSellRate: headers.find((header: string) => /sell|revenue|customer.*rate/i.test(header)) ?? "",
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
      setStatus(`Imported ${result.importedCount} load(s). ${result.rejectedCount} row(s) need review.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Load import failed");
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
            <div className="manual-field-grid">
              {manualFieldTemplates.map((field) => (
                <label key={field}>
                  {field.replaceAll("_", " ")}
                  <input placeholder={`Map ${field}`} />
                </label>
              ))}
            </div>
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
              <p className="ops-note">CSV files can be previewed and mapped into SIL loads. Excel files are stored for the XLSX parser stage.</p>
              {preview && (
                <div className="mapping-workbench">
                  <div className="transport-panel-header compact">
                    <div>
                      <p className="transport-eyebrow">Mapping Preview</p>
                      <h4>{preview.upload.originalName}</h4>
                    </div>
                    <span>{preview.totalRows} row(s)</span>
                  </div>
                  <div className="manual-field-grid">
                    {[
                      ["customerName", "Customer"],
                      ["originCity", "Origin City"],
                      ["originState", "Origin State"],
                      ["destinationCity", "Destination City"],
                      ["destinationState", "Destination State"],
                      ["mode", "Mode"],
                      ["equipmentType", "Equipment"],
                      ["targetBuyRate", "Target Buy"],
                      ["targetSellRate", "Target Sell"],
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
