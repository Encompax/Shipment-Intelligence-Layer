// backend/src/routes/jobs.ts

import { Express, Request, Response, Router } from "express";

import { intakeWorkspace, requireIntakeWorkspace } from "../middleware/requireIntakeWorkspace";
import { findIntakeSource, listIntakeJobs, queueIntakeJob } from "../services/intake/intakeStore";

export function registerJobRoutes(app: Express) {

  const router = Router();
  router.use(requireIntakeWorkspace);

  // GET /api/jobs

  router.get("/", async (req: Request, res: Response) => {

    // newest first

    const list = await listIntakeJobs(intakeWorkspace(req));

    res.json(list);

  });

  // POST /api/jobs

  router.post("/", async (req: Request, res: Response) => {

    const { type, payload } = req.body;

    if (typeof type !== 'string' || !type.trim() || type.length > 100) {

      return res.status(400).json({ message: "type is required" });

    }

    if (JSON.stringify(payload ?? null).length > 100000) return res.status(413).json({ error: 'Job payload is too large.' });
    for (const sourceRef of [payload?.dataSourceId, payload?.dataSourceRef]) {
      if (sourceRef === undefined) continue;
      const source = await findIntakeSource(intakeWorkspace(req), String(sourceRef));
      if (!source) return res.status(404).json({ error: "Data source not found" });
    }

    const job = await queueIntakeJob(intakeWorkspace(req), type.trim(), payload);

    // A queue receipt is not evidence of a running connector or a completed import.

    res.status(201).json(job);

  });

  // Mount under /api/jobs

  app.use("/api/jobs", router);

}
