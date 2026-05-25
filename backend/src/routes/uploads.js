"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUploadRoutes = registerUploadRoutes;
const prisma_1 = require("../lib/prisma");
const config_1 = require("../lib/config");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const XLSX = __importStar(require("xlsx"));
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
const parseWorkbook = (filePath) => {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    if (!sheet)
        return { headers: [], records: [], sheetName: null };
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const records = rows.map((row) => headers.reduce((record, header) => {
        var _a;
        record[header] = String((_a = row[header]) !== null && _a !== void 0 ? _a : '').trim();
        return record;
    }, {}));
    return { headers, records, sheetName };
};
const readUploadTable = async (uploadId) => {
    const upload = await prisma_1.prisma.upload.findUnique({ where: { id: uploadId }, include: { job: true } });
    if (!upload)
        return null;
    const extension = path_1.default.extname(upload.originalName).toLowerCase();
    if (extension === '.csv' || upload.contentType.toLowerCase().includes('csv')) {
        const content = await fs_1.default.promises.readFile(upload.storedPath, 'utf8');
        return { upload, parsed: { ...parseCsv(content), sheetName: null }, format: 'CSV' };
    }
    if (['.xlsx', '.xls'].includes(extension) || upload.contentType.toLowerCase().includes('spreadsheet')) {
        return { upload, parsed: parseWorkbook(upload.storedPath), format: 'EXCEL' };
    }
    return { upload, error: 'Preview supports CSV, XLSX, and XLS files.' };
};
const normalizeCell = (value) => (value !== null && value !== void 0 ? value : "").trim();
const normalizeKeyPart = (value) => String(value !== null && value !== void 0 ? value : "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const parseMode = (value) => {
    const normalized = normalizeKeyPart(value);
    if (normalized === "ltl")
        return "LTL";
    if (normalized === "parcel")
        return "PARCEL";
    if (normalized === "intermodal")
        return "INTERMODAL";
    if (normalized === "air")
        return "AIR";
    if (normalized === "ocean")
        return "OCEAN";
    return "FTL";
};
const parseEquipmentType = (value) => {
    const normalized = normalizeKeyPart(value).replace(/[\s-]+/g, "_");
    if (normalized === "REEFER" || normalized === "REFRIGERATED")
        return "REEFER";
    if (normalized === "FLATBED")
        return "FLATBED";
    if (normalized === "BOX_TRUCK")
        return "BOX_TRUCK";
    if (normalized === "SPRINTER")
        return "SPRINTER";
    if (normalized === "CONTAINER")
        return "CONTAINER";
    if (normalized === "PARCEL")
        return "PARCEL";
    return "DRY_VAN";
};
const buildLoadImportDraft = (row, mapping) => {
    const customerName = normalizeCell(row[mapping.customerName]) || 'Imported Customer';
    return {
        customerId: (normalizeCell(row[mapping.customerId]) || customerName)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'imported-customer',
        customerName,
        origin: {
            city: normalizeCell(row[mapping.originCity]) || 'Unknown',
            state: normalizeCell(row[mapping.originState]).toUpperCase() || 'NA',
        },
        destination: {
            city: normalizeCell(row[mapping.destinationCity]) || 'Unknown',
            state: normalizeCell(row[mapping.destinationState]).toUpperCase() || 'NA',
        },
        mode: parseMode(row[mapping.mode]),
        equipmentType: parseEquipmentType(row[mapping.equipmentType]),
        targetBuyRate: mapping.targetBuyRate ? Number(row[mapping.targetBuyRate]) || undefined : undefined,
        targetSellRate: mapping.targetSellRate ? Number(row[mapping.targetSellRate]) || undefined : undefined,
        source: 'manual',
    };
};
const loadImportKey = (load) => [
    load.customerId,
    load.origin.city,
    load.origin.state,
    load.destination.city,
    load.destination.state,
    load.mode,
    load.equipmentType,
    load.targetBuyRate,
    load.targetSellRate,
]
    .map(normalizeKeyPart)
    .join('|');
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
        const result = await readUploadTable(Number(req.params.uploadId));
        if (!result)
            return res.status(404).json({ error: 'Upload not found' });
        if ('error' in result)
            return res.status(415).json({ error: result.error, upload: result.upload });
        res.json({
            upload: result.upload,
            format: result.format,
            sheetName: result.parsed.sheetName,
            headers: result.parsed.headers,
            rows: result.parsed.records.slice(0, 10),
            totalRows: result.parsed.records.length,
        });
    });
    app.post('/api/ingest/uploads/:uploadId/import-loads', async (req, res) => {
        var _a, _b, _c;
        const result = await readUploadTable(Number(req.params.uploadId));
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
        const allowDuplicates = ((_c = req.body) === null || _c === void 0 ? void 0 : _c.allowDuplicates) === true;
        const existingKeys = allowDuplicates ? new Set() : new Set((await (0, silPersistenceService_1.listSilLoads)()).map(loadImportKey));
        const batchKeys = new Set();
        const imported = [];
        const rejected = [];
        const skipped = [];
        for (const [index, row] of result.parsed.records.entries()) {
            try {
                const draft = buildLoadImportDraft(row, mapping);
                const key = loadImportKey(draft);
                if (!allowDuplicates && existingKeys.has(key)) {
                    skipped.push({ row: index + 2, reason: 'Matching SIL load already exists.', key });
                    continue;
                }
                if (!allowDuplicates && batchKeys.has(key)) {
                    skipped.push({ row: index + 2, reason: 'Duplicate row in this upload.', key });
                    continue;
                }
                batchKeys.add(key);
                const load = await (0, silPersistenceService_1.createSilLoad)(draft);
                imported.push(load.load);
            }
            catch (error) {
                rejected.push({ row: index + 2, error: error instanceof Error ? error.message : 'Import failed' });
            }
        }
        res.status(201).json({
            upload: result.upload,
            format: result.format,
            sheetName: result.parsed.sheetName,
            importedCount: imported.length,
            rejectedCount: rejected.length,
            skippedCount: skipped.length,
            imported,
            rejected,
            skipped,
        });
    });
}
