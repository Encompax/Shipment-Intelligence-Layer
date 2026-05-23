import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";
import { config } from "./lib/config";
import { errorHandler } from "./middleware/errorHandler";
import { registerHealthRoutes } from "./routes/health";
import { registerDatasourceRoutes } from "./routes/datasources";
import { registerJobRoutes } from "./routes/jobs";
import { registerUploadRoutes } from "./routes/uploads";
import { registerMetricsRoutes } from "./routes/metrics";
import { registerPickingRoutes } from "./routes/picking";
import { registerCarrierRoutes } from "./routes/carriers";
import { registerLotTrackingRoutes } from "./routes/lot-tracking";
import { registerFulfillmentRoutes } from "./routes/fulfillment-transactions";
import { registerInventoryMovementRoutes } from "./routes/inventory-movements";
import { registerCycleCountRoutes } from "./routes/cycle-count-transactions";
import { registerShipmentIntelligenceRoutes } from "./routes/shipment-intelligence";

const app = express();

// LAN-only deployment — CORS restricted to same origin.
// Update ALLOWED_ORIGIN env var if the frontend is served from a different port.
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max upload
  abortOnLimit: true,
}));

// Register all route families
registerHealthRoutes(app);
registerDatasourceRoutes(app);
registerJobRoutes(app);
registerUploadRoutes(app);
registerMetricsRoutes(app);
registerPickingRoutes(app);
registerCarrierRoutes(app);
registerLotTrackingRoutes(app);
registerFulfillmentRoutes(app);
registerInventoryMovementRoutes(app);
registerCycleCountRoutes(app);
registerShipmentIntelligenceRoutes(app);

// Global error handler — must be registered last
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[${new Date().toISOString()}] INFO  Encompax-core API listening on port ${config.port}`);
});
