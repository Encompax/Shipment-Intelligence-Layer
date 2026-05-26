import { Express, Request, Response } from 'express';
import * as fileUpload from 'express-fileupload';
import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { createSilLoad, listSilLoads, upsertSilCarrier } from '../services/shipmentIntelligence/silPersistenceService';
import { EquipmentType, SilCarrierProfile, SilLoad, TransportMode } from '../services/shipmentIntelligence/types';

const hashDataSourceId = (value: string) =>
  Math.abs(
    value.split('').reduce((hash, char) => {
      return (hash * 31 + char.charCodeAt(0)) | 0;
    }, 7)
  );

const parseCsv = (content: string) => {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);

  const headers = rows[0] ?? [];
  const records = rows.slice(1).map((values) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {})
  );
  return { headers, records };
};

const parseWorkbook = (filePath: string) => {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) return { headers: [], records: [], sheetName: null };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const records = rows.map((row) =>
    headers.reduce<Record<string, string>>((record, header) => {
      record[header] = String(row[header] ?? '').trim();
      return record;
    }, {})
  );
  return { headers, records, sheetName };
};

const readUploadTable = async (uploadId: number) => {
  const upload = await prisma.upload.findUnique({ where: { id: uploadId }, include: { job: true } });
  if (!upload) return null;
  const extension = path.extname(upload.originalName).toLowerCase();
  if (extension === '.csv' || upload.contentType.toLowerCase().includes('csv')) {
    const content = await fs.promises.readFile(upload.storedPath, 'utf8');
    return { upload, parsed: { ...parseCsv(content), sheetName: null }, format: 'CSV' };
  }
  if (['.xlsx', '.xls'].includes(extension) || upload.contentType.toLowerCase().includes('spreadsheet')) {
    return { upload, parsed: parseWorkbook(upload.storedPath), format: 'EXCEL' };
  }
  return { upload, error: 'Preview supports CSV, XLSX, and XLS files.' };
};

type LoadImportDraft = Pick<SilLoad, "customerId" | "customerName" | "origin" | "destination" | "mode" | "equipmentType"> &
  Pick<Partial<SilLoad>, "targetBuyRate" | "targetSellRate" | "source">;

const normalizeCell = (value: string | undefined) => (value ?? "").trim();

const normalizeKeyPart = (value: string | number | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const parseMode = (value: string | undefined): TransportMode => {
  const normalized = normalizeKeyPart(value);
  if (normalized === "ltl") return "LTL";
  if (normalized === "parcel") return "PARCEL";
  if (normalized === "intermodal") return "INTERMODAL";
  if (normalized === "air") return "AIR";
  if (normalized === "ocean") return "OCEAN";
  return "FTL";
};

const parseEquipmentType = (value: string | undefined): EquipmentType => {
  const normalized = normalizeKeyPart(value).replace(/[\s-]+/g, "_");
  if (normalized === "REEFER" || normalized === "REFRIGERATED") return "REEFER";
  if (normalized === "FLATBED") return "FLATBED";
  if (normalized === "BOX_TRUCK") return "BOX_TRUCK";
  if (normalized === "SPRINTER") return "SPRINTER";
  if (normalized === "CONTAINER") return "CONTAINER";
  if (normalized === "PARCEL") return "PARCEL";
  return "DRY_VAN";
};

const buildLoadImportDraft = (row: Record<string, string>, mapping: Record<string, string>): LoadImportDraft => {
  const customerName = normalizeCell(row[mapping.customerName]) || 'Imported Customer';
  return {
    customerId:
      (normalizeCell(row[mapping.customerId]) || customerName)
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

type CarrierImportDraft = Partial<SilCarrierProfile> & Pick<SilCarrierProfile, "carrierName">;

const parseBoolean = (value: string | undefined) => {
  const normalized = normalizeKeyPart(value);
  return ["true", "yes", "y", "1", "preferred", "blocked"].includes(normalized);
};

const parseNumber = (value: string | undefined) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeStatus = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T => {
  const normalized = normalizeKeyPart(value).replace(/[\s-]+/g, "_").toUpperCase();
  return allowed.includes(normalized as T) ? (normalized as T) : fallback;
};

const buildCarrierImportDraft = (row: Record<string, string>, mapping: Record<string, string>): CarrierImportDraft => {
  const carrierName = normalizeCell(row[mapping.carrierName]);
  if (!carrierName) throw new Error("Carrier name is required.");

  return {
    carrierName,
    mcNumber: mapping.mcNumber ? normalizeCell(row[mapping.mcNumber]) || undefined : undefined,
    dotNumber: mapping.dotNumber ? normalizeCell(row[mapping.dotNumber]) || undefined : undefined,
    insuranceStatus: normalizeStatus(
      mapping.insuranceStatus ? row[mapping.insuranceStatus] : undefined,
      ["UNKNOWN", "VALID", "EXPIRED", "INSUFFICIENT"] as const,
      "UNKNOWN"
    ),
    safetyStatus: normalizeStatus(
      mapping.safetyStatus ? row[mapping.safetyStatus] : undefined,
      ["UNKNOWN", "CLEAR", "REVIEW", "BLOCKED"] as const,
      "UNKNOWN"
    ),
    creditStatus: normalizeStatus(
      mapping.creditStatus ? row[mapping.creditStatus] : undefined,
      ["UNKNOWN", "APPROVED", "REVIEW", "BLOCKED"] as const,
      "UNKNOWN"
    ),
    serviceScore: mapping.serviceScore ? parseNumber(row[mapping.serviceScore]) : undefined,
    onTimeRate: mapping.onTimeRate ? parseNumber(row[mapping.onTimeRate]) : undefined,
    falloffRate: mapping.falloffRate ? parseNumber(row[mapping.falloffRate]) : undefined,
    preferred: mapping.preferred ? parseBoolean(row[mapping.preferred]) : undefined,
    blocked: mapping.blocked ? parseBoolean(row[mapping.blocked]) : undefined,
  };
};

const loadImportKey = (load: LoadImportDraft | SilLoad) =>
  [
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

const carrierImportKey = (carrier: CarrierImportDraft | SilCarrierProfile) =>
  [carrier.mcNumber, carrier.dotNumber, carrier.carrierName].map(normalizeKeyPart).join('|');

export function registerUploadRoutes(app: Express) {
 app.post('/api/ingest/upload', async (req: Request, res: Response) => {
   const dataSourceRef = String(req.body.dataSourceId ?? '').trim();
   const dataSourceId = Number.parseInt(dataSourceRef, 10);
   const legacyDataSourceId = Number.isFinite(dataSourceId) ? dataSourceId : hashDataSourceId(dataSourceRef);
   if (!dataSourceRef || !req.files || !('file' in req.files)) {
     return res.status(400).json({ message: 'dataSourceId and file are required' });
   }
   const file = req.files['file'] as fileUpload.UploadedFile;
   const uploadDir = path.join(process.cwd(), config.uploadDir);
   if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
   const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
   const storedFileName = `${Date.now()}_${safeName}`;
   const storedPath = path.join(uploadDir, storedFileName);
   await file.mv(storedPath);
   // Create job + upload record
   const job = await prisma.job.create({
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

 app.get('/api/ingest/uploads', async (_req: Request, res: Response) => {
   const uploads = await prisma.upload.findMany({
     include: { job: true },
     orderBy: { createdAt: 'desc' },
     take: 25,
   });
   res.json({ count: uploads.length, uploads });
 });

 app.get('/api/ingest/uploads/:uploadId/preview', async (req: Request, res: Response) => {
   const result = await readUploadTable(Number(req.params.uploadId));
   if (!result) return res.status(404).json({ error: 'Upload not found' });
   if ('error' in result) return res.status(415).json({ error: result.error, upload: result.upload });

   res.json({
     upload: result.upload,
     format: result.format,
     sheetName: result.parsed.sheetName,
     headers: result.parsed.headers,
     rows: result.parsed.records.slice(0, 10),
     totalRows: result.parsed.records.length,
   });
 });

 app.post('/api/ingest/uploads/:uploadId/import-loads', async (req: Request, res: Response) => {
   const result = await readUploadTable(Number(req.params.uploadId));
   if (!result) return res.status(404).json({ error: 'Upload not found' });
   if ('error' in result) return res.status(415).json({ error: result.error, upload: result.upload });

   const mapping = req.body?.mapping ?? {};
   const required = ['customerName', 'originCity', 'originState', 'destinationCity', 'destinationState'];
   const missing = required.filter((field) => !mapping[field]);
   if (missing.length > 0) {
     return res.status(400).json({ error: `Missing required mapping fields: ${missing.join(', ')}` });
   }

   const allowDuplicates = req.body?.allowDuplicates === true;
   const existingKeys = allowDuplicates ? new Set<string>() : new Set((await listSilLoads()).map(loadImportKey));
   const batchKeys = new Set<string>();
   const imported: SilLoad[] = [];
   const rejected: Array<{ row: number; error: string }> = [];
   const skipped: Array<{ row: number; reason: string; key: string }> = [];
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
       const load = await createSilLoad(draft);
       imported.push(load.load);
     } catch (error) {
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

 app.post('/api/ingest/uploads/:uploadId/import-carriers', async (req: Request, res: Response) => {
   const result = await readUploadTable(Number(req.params.uploadId));
   if (!result) return res.status(404).json({ error: 'Upload not found' });
   if ('error' in result) return res.status(415).json({ error: result.error, upload: result.upload });

   const mapping = req.body?.mapping ?? {};
   if (!mapping.carrierName) {
     return res.status(400).json({ error: 'Missing required mapping field: carrierName' });
   }

   const allowDuplicates = req.body?.allowDuplicates === true;
   const batchKeys = new Set<string>();
   const imported: SilCarrierProfile[] = [];
   const rejected: Array<{ row: number; error: string }> = [];
   const skipped: Array<{ row: number; reason: string; key: string }> = [];

   for (const [index, row] of result.parsed.records.entries()) {
     try {
       const draft = buildCarrierImportDraft(row, mapping);
       const key = carrierImportKey(draft);
       if (!allowDuplicates && batchKeys.has(key)) {
         skipped.push({ row: index + 2, reason: 'Duplicate carrier row in this upload.', key });
         continue;
       }
       batchKeys.add(key);
       const { carrier } = await upsertSilCarrier(draft);
       imported.push(carrier);
     } catch (error) {
       rejected.push({ row: index + 2, error: error instanceof Error ? error.message : 'Carrier import failed' });
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
