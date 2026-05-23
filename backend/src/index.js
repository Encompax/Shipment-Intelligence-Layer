"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_fileupload_1 = __importDefault(require("express-fileupload"));
const config_1 = require("./lib/config");
const health_1 = require("./routes/health");
const datasources_1 = require("./routes/datasources");
const jobs_1 = require("./routes/jobs");
const uploads_1 = require("./routes/uploads");
const metrics_1 = require("./routes/metrics");
const picking_1 = require("./routes/picking");
const carriers_1 = require("./routes/carriers");
const lot_tracking_1 = require("./routes/lot-tracking");
const errorHandler_1 = require("./middleware/errorHandler");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, express_fileupload_1.default)()); // handles multipart file uploads
// Register route handlers
(0, health_1.registerHealthRoutes)(app);
(0, datasources_1.registerDatasourceRoutes)(app);
(0, jobs_1.registerJobRoutes)(app);
(0, uploads_1.registerUploadRoutes)(app);
(0, metrics_1.registerMetricsRoutes)(app);
(0, picking_1.registerPickingRoutes)(app);
(0, carriers_1.registerCarrierRoutes)(app);
(0, lot_tracking_1.registerLotTrackingRoutes)(app);
app.use(errorHandler_1.errorHandler);
app.listen(config_1.config.port, () => {
    console.log(`Encompax-core API listening on port ${config_1.config.port}`);
});
