import React, { useEffect, useState } from "react";
import { fetchDatasources, uploadFile } from "../api/client";

type DataSource = {
  id: string;
  name: string;
  type: string;
};

interface Props {
  dataSourceId?: number | null;
}

const UploadPanel: React.FC<Props> = ({ dataSourceId = null }) => {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | number | null>(dataSourceId);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchDatasources()
      .then((data) => {
        if (!mounted) return;
        const nextSources = Array.isArray(data) ? data : [];
        setSources(nextSources);
        setSelectedSourceId((current) => current ?? dataSourceId ?? nextSources[0]?.id ?? null);
      })
      .catch((err) => {
        if (mounted) setMessage(err instanceof Error ? err.message : "Unable to load data sources");
      });
    return () => {
      mounted = false;
    };
  }, [dataSourceId]);

  const handleUpload = async () => {
    if (!selectedSourceId || !file) return;
    setStatus("uploading");
    setMessage(null);
    try {
      await uploadFile(selectedSourceId, file);
      setStatus("done");
      setMessage("Upload complete. SIL recorded the ingest job for review.");
      setFile(null);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <div className="data-intake">
      <section className="transport-panel">
        <div className="transport-panel-header">
          <div>
            <p className="transport-eyebrow">File Intake</p>
            <h3>Upload Operational Data</h3>
          </div>
          <span>{sources.length} source(s)</span>
        </div>
        <div className="file-upload-panel">
          <label>
            Target Source
            <select
              value={selectedSourceId ?? ""}
              onChange={(event) => setSelectedSourceId(event.target.value)}
            >
              <option value="">Select a source</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name} / {source.type}
                </option>
              ))}
            </select>
          </label>

          <label>
            CSV, Excel, or Export File
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.json"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setStatus("idle");
                setMessage(null);
              }}
            />
          </label>

          <button
            className="btn btn-primary"
            disabled={!file || !selectedSourceId || status === "uploading"}
            onClick={handleUpload}
            style={{ alignSelf: "flex-start" }}
          >
            {status === "uploading" ? "Uploading..." : "Upload File"}
          </button>

          {status === "done" && <span className="badge badge-success">Upload complete</span>}
          {status === "error" && <span className="badge badge-error">Upload failed</span>}
          {message && <p className="ops-note">{message}</p>}
          {sources.length === 0 && (
            <p className="ops-note">Create a data source first, then return here to attach files to that source.</p>
          )}
        </div>
      </section>
    </div>
  );
};

export default UploadPanel;
