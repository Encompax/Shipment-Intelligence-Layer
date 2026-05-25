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
const silPersistenceService_1 = require("../services/shipmentIntelligence/silPersistenceService");
const hashDataSourceId = (value) => Math.abs(value.split('').reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) | 0;
}, 7));
const parseCsv = (content) => {
    var _a;
    const rows = [];
    let current = '';
    let row = [];
    let quoted = false;
    for (let index = 0; index < content.length; index += 1) {
        const char = content[index];
        const next = content[index + 1];
        if (char === '"' && quoted && next === '"') {
            current += '"';
            index += 1;
        }
        else if (char === '"') {
            quoted = !quoted;
        }
        else if (char === ',' && !quoted) {
            row.push(current.trim());
            current = '';
        }
        else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && next === '\n')
                index += 1;
            row.push(current.trim());
            if (row.some(Boolean))
                rows.push(row);
            row = [];
            current = '';
        }
        else {
            current += char;
        }
    }
    row.push(current.trim());
    if (row.some(Boolean))
        rows.push(row);
    const headers = (_a = rows[0]) !== null && _a !== void 0 ? _a : [];
    const records = rows.slice(1).map((values) => headers.reduce((record, header, index) => {
        var _a;
        record[header] = (_a = values[index]) !== null && _a !== void 0 ? _a : '';
        return record;
    }, {}));
    return { headers, records };
};
const readUploadCsv = async (uploadId) => {
    const upload = await prisma_1.prisma.upload.findUnique({ where: { id: uploadId }, include: { job: true } });
    if (!upload)
        return null;
    const extension = path_1.default.extname(upload.originalName).toLowerCase();
    if (extension !== '.csv' && !upload.contentType.toLowerCase().includes('csv')) {
        return { upload, error: 'Preview currently supports CSV files. Excel files are stored and ready for the XLSX parser stage.' };
    }
    const content = await fs_1.default.promises.readFile(upload.storedPath, 'utf8');
    return { upload, parsed: parseCsv(content) };
};
function registerUploadRoutes(app) {
    app.post('/api/ingest/upload', async (req, res) => {
        var _a;
        const dataSourceRef = String((_a = req.body.dataSourceId) !== null && _a !== void 0 ? _a : '').trim();
        const dataSourceId = Number.parseInt(dataSourceRef, 10);
        const legacyDataSourceId = Number.isFinite(dataSourceId) ? dataSourceId : hashDataSourceId(dataSourceRef);
        if (!dataSourceRef || !req.files || !('file' in req.files)) {
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
                dataSourceId: legacyDataSourceId,
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
        res.status(201).json({ ...job, dataSourceRef });
    });
    app.get('/api/ingest/uploads', async (_req, res) => {
        const uploads = await prisma_1.prisma.upload.findMany({
            include: { job: true },
            orderBy: { createdAt: 'desc' },
            take: 25,
        });
        res.json({ count: uploads.length, uploads });
    });
    app.get('/api/ingest/uploads/:uploadId/preview', async (req, res) => {
        const result = await readUploadCsv(Number(req.params.uploadId));
        if (!result)
            return res.status(404).json({ error: 'Upload not found' });
        if ('error' in result)
            return res.status(415).json({ error: result.error, upload: result.upload });
        res.json({
            upload: result.upload,
            headers: result.parsed.headers,
            rows: result.parsed.records.slice(0, 10),
            totalRows: result.parsed.records.length,
        });
    });
    app.post('/api/ingest/uploads/:uploadId/import-loads', async (req, res) => {
        var _a, _b;
        const result = await readUploadCsv(Number(req.params.uploadId));
        if (!result)
            return res.status(404).json({ error: 'Upload not found' });
        if ('error' in result)
            return res.status(415).json({ error: result.error, upload: result.upload });
        const mapping = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.mapping) !== null && _b !== void 0 ? _b : {};
        const required = ['customerName', 'originCity', 'originState', 'destinationCity', 'destinationState'];
        const missing = required.filter((field) => !mapping[field]);
        if (missing.length > 0) {
            return res.status(400).json({ error: `Missing required mapping fields: ${missing.join(', ')}` });
        }
        const imported = [];
        const rejected = [];
        for (const [index, row] of result.parsed.records.entries()) {
            try {
                const customerName = row[mapping.customerName] || 'Imported Customer';
                const load = await (0, silPersistenceService_1.createSilLoad)({
                    customerId: (row[mapping.customerId] || customerName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'imported-customer',
                    customerName,
                    origin: {
                        city: row[mapping.originCity] || 'Unknown',
                        state: (row[mapping.originState] || '').toUpperCase() || 'NA',
                    },
                    destination: {
                        city: row[mapping.destinationCity] || 'Unknown',
                        state: (row[mapping.destinationState] || '').toUpperCase() || 'NA',
                    },
                    mode: row[mapping.mode] === 'LTL' ? 'LTL' : 'FTL',
                    equipmentType: row[mapping.equipmentType] === 'REEFER' ? 'REEFER' : 'DRY_VAN',
                    targetBuyRate: mapping.targetBuyRate ? Number(row[mapping.targetBuyRate]) || undefined : undefined,
                    targetSellRate: mapping.targetSellRate ? Number(row[mapping.targetSellRate]) || undefined : undefined,
                    source: 'manual',
                });
                imported.push(load.load);
            }
            catch (error) {
                rejected.push({ row: index + 2, error: error instanceof Error ? error.message : 'Import failed' });
            }
        }
        res.status(201).json({
            upload: result.upload,
            importedCount: imported.length,
            rejectedCount: rejected.length,
            imported,
            rejected,
        });
    });
}
