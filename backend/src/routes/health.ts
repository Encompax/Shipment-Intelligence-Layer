// backend/src/routes/health.ts
import { Express, Router } from "express";
export function registerHealthRoutes(app: Express) {
 const router = Router();
 router.get("/", (req, res) => {
   res.json({ status: "ok", service: process.env.K_SERVICE || "encompax-sil-api" });
 });
 // Exposed as /api/health
 app.use("/api/health", router);
}
