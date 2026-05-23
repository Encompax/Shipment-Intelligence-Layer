import React, { useState } from "react";
import { uploadFile } from "../api/client";

interface Props {
  dataSourceId?: number | null;
}

const UploadPanel: React.FC<Props> = ({ dataSourceId = null }) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");

  const handleUpload = async () => {
    if (!dataSourceId || !file) return;
    setStatus("uploading");
    try {
      await uploadFile(dataSourceId, file);
      setStatus("done");
      setFile(null);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="form-group">
        <label htmlFor="upload-file">Select File</label>
        <input
          id="upload-file"
          type="file"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus("idle");
          }}
        />
      </div>

      <button
        className="btn btn-primary"
        disabled={!file || !dataSourceId || status === "uploading"}
        onClick={handleUpload}
        style={{ alignSelf: "flex-start" }}
      >
        {status === "uploading" ? "Uploading\u2026" : "Upload Document"}
      </button>

      {status === "done" && <span className="badge badge-success">Upload complete</span>}
      {status === "error" && <span className="badge badge-error">Upload failed — check console</span>}
      {!dataSourceId && (
        <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          Select a data source to enable uploads.
        </p>
      )}
    </div>
  );
};

export default UploadPanel;
