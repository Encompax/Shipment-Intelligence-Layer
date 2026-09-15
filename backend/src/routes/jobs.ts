// backend/src/routes/jobs.ts

import { Express, Request, Response, Router } from "express";

import { randomUUID } from "crypto";
import { intakeWorkspace, requireIntakeWorkspace } from "../middleware/requireIntakeWorkspace";
import { prisma } from "../lib/prisma";

type JobStatus = "queued" | "running" | "succeeded" | "failed";

interface Job {

  id: string;
  orgScope: string;

  type: string;          // e.g. "datasource_import", "panatracker_sync"

  status: JobStatus;

  createdAt: string;

  startedAt?: string;

  finishedAt?: string;

  payload?: any;         // shape of job input; can refine later

  errorMessage?: string; // populate when failed

}

// Temporary in-memory store; later this becomes a Prisma model

const jobs: Job[] = [];

export function registerJobRoutes(app: Express) {

  const router = Router();
  router.use(requireIntakeWorkspace);

  // GET /api/jobs

  router.get("/", (req: Request, res: Response) => {

    // newest first

    const list = jobs.filter((job) => job.orgScope === intakeWorkspace(req)).sort(

      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)

    );

    res.json(list);

  });

  // POST /api/jobs

  router.post("/", async (req: Request, res: Response) => {

    const { type, payload } = req.body;

    if (!type) {

      return res.status(400).json({ message: "type is required" });

    }

    for (const sourceRef of [payload?.dataSourceId, payload?.dataSourceRef]) {
      if (sourceRef === undefined) continue;
      const source = await prisma.datasource.findFirst({
        where: { id: String(sourceRef), orgScope: intakeWorkspace(req) },
      });
      if (!source) return res.status(404).json({ error: "Data source not found" });
    }

    const job: Job = {

      id: randomUUID(),
      orgScope: intakeWorkspace(req),

      type,

      status: "queued",

      createdAt: new Date().toISOString(),

      payload: payload ?? null,

    };

    jobs.push(job);

    // For now we just queue it; later you can kick off a worker

    res.status(201).json(job);

  });

  // Mount under /api/jobs

  app.use("/api/jobs", router);

}
