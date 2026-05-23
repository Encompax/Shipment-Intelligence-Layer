"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUploadRoutes = registerUploadRoutes;
const prisma_1 = require("../lib/prisma");
const config_1 = require("../lib/config");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function registerUploadRoutes(app) {
    app.post('/api/ingest/upload', async (req, res) => {
        const dataSourceId = parseInt(req.body.dataSourceId, 10);
        if (!dataSourceId || isNaN(dataSourceId) || !req.files || !('file' in req.files)) {
            return res.status(400).json({ message: 'dataSourceId and file are required' });
        }
        const file = req.files['file'];
        const uploadDir = path_1.default.join(process.cwd(), config_1.config.uploadDir);
        if (!fs_1.default.existsSync(uploadDir))
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        const safeName = path_1.default.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
        const storedFileName = `${Date.now()}_${safeName}`;
        const storedPath = path_1.default.join(uploadDir, storedFileName);
        await file.mv(storedPath);
        // Create job + upload record
        const job = await prisma_1.prisma.job.create({
            data: {
                dataSourceId,
                status: 'Completed', // later you can support async processing
                uploads: {
                    create: {
                        originalName: file.name,
                        storedPath,
                        sizeBytes: file.size,
                        contentType: file.mimetype,
                    },
                },
            },
            include: { uploads: true },
        });
        res.status(201).json(job);
    });
}
