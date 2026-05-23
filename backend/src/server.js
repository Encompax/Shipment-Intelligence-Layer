"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_fileupload_1 = __importDefault(require("express-fileupload"));
const config_1 = require("./lib/config");
const errorHandler_1 = require("./middleware/errorHandler");
const health_1 = require("./routes/health");
const datasources_1 = require("./routes/datasources");
const jobs_1 = require("./routes/jobs");
const uploads_1 = require("./routes/uploads");
const metrics_1 = require("./routes/metrics");
const picking_1 = require("./routes/picking");
const carriers_1 = require("./routes/carriers");
const lot_tracking_1 = require("./routes/lot-tracking");
const fulfillment_transactions_1 = require("./routes/fulfillment-transactions");
const inventory_movements_1 = require("./routes/inventory-movements");
const cycle_count_transactions_1 = require("./routes/cycle-count-transactions");
const shipment_intelligence_1 = require("./routes/shipment-intelligence");
const app = (0, express_1.default)();
// LAN-only deployment — CORS restricted to same origin.
// Update ALLOWED_ORIGIN env var if the frontend is served from a different port.
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express_1.default.json({ limit: '1mb' }));
app.use((0, express_fileupload_1.default)({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max upload
    abortOnLimit: true,
}));
// Register all route families
(0, health_1.registerHealthRoutes)(app);
(0, datasources_1.registerDatasourceRoutes)(app);
(0, jobs_1.registerJobRoutes)(app);
(0, uploads_1.registerUploadRoutes)(app);
(0, metrics_1.registerMetricsRoutes)(app);
(0, picking_1.registerPickingRoutes)(app);
(0, carriers_1.registerCarrierRoutes)(app);
(0, lot_tracking_1.registerLotTrackingRoutes)(app);
(0, fulfillment_transactions_1.registerFulfillmentRoutes)(app);
(0, inventory_movements_1.registerInventoryMovementRoutes)(app);
(0, cycle_count_transactions_1.registerCycleCountRoutes)(app);
(0, shipment_intelligence_1.registerShipmentIntelligenceRoutes)(app);
// Global error handler — must be registered last
app.use(errorHandler_1.errorHandler);
app.listen(config_1.config.port, () => {
    console.log(`[${new Date().toISOString()}] INFO  Encompax-core API listening on port ${config_1.config.port}`);
});
