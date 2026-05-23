import { Express, Request, Response } from 'express';
import * as fileUpload from 'express-fileupload';
import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import path from 'path';
import fs from 'fs';
export function registerUploadRoutes(app: Express) {
 app.post('/api/ingest/upload', async (req: Request, res: Response) => {
   const dataSourceId = parseInt(req.body.dataSourceId, 10);
   if (!dataSourceId || isNaN(dataSourceId) || !req.files || !('file' in req.files)) {
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