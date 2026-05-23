"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHealthRoutes = registerHealthRoutes;
// backend/src/routes/health.ts
const express_1 = require("express");
function registerHealthRoutes(app) {
    const router = (0, express_1.Router)();
    router.get("/", (req, res) => {
        res.json({ status: "ok", service: "encompax-core" });
    });
    // Exposed as /api/health
    app.use("/api/health", router);
}
