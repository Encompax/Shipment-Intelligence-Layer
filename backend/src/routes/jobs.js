"use strict";
// backend/src/routes/jobs.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerJobRoutes = registerJobRoutes;
const express_1 = require("express");
const crypto_1 = require("crypto");
// Temporary in-memory store; later this becomes a Prisma model
const jobs = [];
function registerJobRoutes(app) {
    const router = (0, express_1.Router)();
    // GET /api/jobs
    router.get("/", (req, res) => {
        // newest first
        const list = [...jobs].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        res.json(list);
    });
    // POST /api/jobs
    router.post("/", (req, res) => {
        const { type, payload } = req.body;
        if (!type) {
            return res.status(400).json({ message: "type is required" });
        }
        const job = {
            id: (0, crypto_1.randomUUID)(),
            type,
            status: "queued",
            createdAt: new Date().toISOString(),
            payload: payload !== null && payload !== void 0 ? payload : null,
        };
        jobs.push(job);
        // For now we just queue it; later you can kick off a worker
        res.status(201).json(job);
    });
    // Mount under /api/jobs
    app.use("/api/jobs", router);
}
