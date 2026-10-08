import type { NextFunction, Request, Response } from "express";

const cloudProject = process.env.GOOGLE_CLOUD_PROJECT
  || process.env.GCLOUD_PROJECT
  || process.env.SIL_FIRESTORE_PROJECT_ID;

export function requestTracing(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  const traceHeader = req.header("x-cloud-trace-context");
  const [traceId, spanPart] = traceHeader?.split("/") ?? [];
  const spanId = spanPart?.split(";")[0];

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const entry: Record<string, unknown> = {
      severity: res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARNING" : "INFO",
      event: "http_request_complete",
      service: process.env.K_SERVICE || "encompax-sil-api",
      revision: process.env.K_REVISION,
      durationMs: Number(durationMs.toFixed(2)),
      httpRequest: {
        requestMethod: req.method,
        requestUrl: req.path,
        status: res.statusCode,
        responseSize: res.getHeader("content-length"),
      },
    };

    if (cloudProject && traceId) {
      entry["logging.googleapis.com/trace"] = `projects/${cloudProject}/traces/${traceId}`;
    }
    if (spanId) {
      entry["logging.googleapis.com/spanId"] = spanId;
    }

    console.log(JSON.stringify(entry));
  });

  next();
}
