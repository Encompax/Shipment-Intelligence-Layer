// backend/src/routes/jobs.ts

import { Express, Request, Response, Router } from "express";

import { randomUUID } from "crypto";

type JobStatus = "queued" | "running" | "succeeded" | "failed";

interface Job {

  id: string;

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

  // GET /api/jobs

  router.get("/", (req: Request, res: Response) => {

    // newest first

    const list = [...jobs].sort(

      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)

    );

    res.json(list);

  });

  // POST /api/jobs

  router.post("/", (req: Request, res: Response) => {

    const { type, payload } = req.body;

    if (!type) {

      return res.status(400).json({ message: "type is required" });

    }

    const job: Job = {

      id: randomUUID(),

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
 