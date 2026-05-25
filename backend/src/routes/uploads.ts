import { Express, Request, Response } from 'express';
import * as fileUpload from 'express-fileupload';
import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import path from 'path';
import fs from 'fs';
import { createSilLoad } from '../services/shipmentIntelligence/silPersistenceService';
import { SilLoad } from '../services/shipmentIntelligence/types';

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

const readUploadCsv = async (uploadId: number) => {
  const upload = await prisma.upload.findUnique({ where: { id: uploadId }, include: { job: true } });
  if (!upload) return null;
  const extension = path.extname(upload.originalName).toLowerCase();
  if (extension !== '.csv' && !upload.contentType.toLowerCase().includes('csv')) {
    return { upload, error: 'Preview currently supports CSV files. Excel files are stored and ready for the XLSX parser stage.' };
  }
  const content = await fs.promises.readFile(upload.storedPath, 'utf8');
  return { upload, parsed: parseCsv(content) };
};

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
   const result = await readUploadCsv(Number(req.params.uploadId));
   if (!result) return res.status(404).json({ error: 'Upload not found' });
   if ('error' in result) return res.status(415).json({ error: result.error, upload: result.upload });

   res.json({
     upload: result.upload,
     headers: result.parsed.headers,
     rows: result.parsed.records.slice(0, 10),
     totalRows: result.parsed.records.length,
   });
 });

 app.post('/api/ingest/uploads/:uploadId/import-loads', async (req: Request, res: Response) => {
   const result = await readUploadCsv(Number(req.params.uploadId));
   if (!result) return res.status(404).json({ error: 'Upload not found' });
   if ('error' in result) return res.status(415).json({ error: result.error, upload: result.upload });

   const mapping = req.body?.mapping ?? {};
   const required = ['customerName', 'originCity', 'originState', 'destinationCity', 'destinationState'];
   const missing = required.filter((field) => !mapping[field]);
   if (missing.length > 0) {
     return res.status(400).json({ error: `Missing required mapping fields: ${missing.join(', ')}` });
   }

   const imported: SilLoad[] = [];
   const rejected: Array<{ row: number; error: string }> = [];
   for (const [index, row] of result.parsed.records.entries()) {
     try {
       const customerName = row[mapping.customerName] || 'Imported Customer';
       const load = await createSilLoad({
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
     } catch (error) {
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
