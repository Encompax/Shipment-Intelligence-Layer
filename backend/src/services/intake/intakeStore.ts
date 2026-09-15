import { randomBytes, randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma';
import { getSilFirestore, getSilFirestoreRootCollection, isFirestorePrimaryEnabled } from '../../lib/firestore';

export function intakeCollection(orgScope: string, name: string) {
  if (!orgScope || orgScope.includes('/') || ['.', '..'].includes(orgScope)
    || Buffer.byteLength(orgScope) > 1500) throw new Error('A valid organization scope is required.');
  const db = getSilFirestore();
  if (!db) throw new Error('Durable intake metadata storage is unavailable.');
  return db.collection(getSilFirestoreRootCollection()).doc(orgScope).collection(name);
}

export function assertIntakeStorageConfigured() {
  const hosted = Boolean(process.env.K_SERVICE) || process.env.NODE_ENV === 'production';
  if (hosted && !isFirestorePrimaryEnabled()) throw new Error('Hosted SIL intake requires Firestore primary storage.');
  if (isFirestorePrimaryEnabled() && !process.env.SIL_UPLOAD_BUCKET?.trim()) {
    throw new Error('SIL_UPLOAD_BUCKET is required for durable SIL intake.');
  }
}

export async function findIntakeSource(orgScope: string, id: string) {
  if (!id || id.includes('/')) return null;
  if (!isFirestorePrimaryEnabled()) return prisma.datasource.findFirst({ where: { id, orgScope } });
  const snapshot = await intakeCollection(orgScope, 'intakeSources').doc(id).get();
  const source = snapshot.data();
  return source?.orgScope === orgScope ? source : null;
}

export async function listIntakeSources(orgScope: string) {
  if (!isFirestorePrimaryEnabled()) return prisma.datasource.findMany({ where: { orgScope }, orderBy: { name: 'asc' } });
  const snapshot = await intakeCollection(orgScope, 'intakeSources').orderBy('name').get();
  return snapshot.docs.map((doc) => doc.data()).filter((source) => source.orgScope === orgScope);
}

export async function createIntakeSource(orgScope: string, input: { name: string; type: string; description: string | null }) {
  if (!isFirestorePrimaryEnabled()) return prisma.datasource.create({ data: { ...input, orgScope } });
  const timestamp = new Date().toISOString();
  const source = { ...input, id: randomUUID(), orgScope, endpointUrl: null, isActive: true, createdAt: timestamp, updatedAt: timestamp };
  await intakeCollection(orgScope, 'intakeSources').doc(source.id).create(source);
  return source;
}

export type StoredBlob = { storedPath: string; sha256?: string; storageGeneration?: string };
export type IntakeUpload = StoredBlob & {
  id: number; jobId: number; originalName: string; sizeBytes: number; contentType: string;
  createdAt: string | Date; uploadedBy?: string; orgScope?: string;
  job: { id: number; orgScope: string | null; dataSourceRef: string | null; dataSourceId: number; status: string; createdAt: string | Date; updatedAt: string | Date };
};

export function publicIntakeUpload(upload: IntakeUpload) {
  const { storedPath: _path, storageGeneration: _generation, ...visible } = upload;
  return visible;
}

export async function saveIntakeUpload(orgScope: string, dataSourceRef: string, dataSourceId: number,
  input: StoredBlob & { originalName: string; sizeBytes: number; contentType: string; uploadedBy: string }) {
  if (!isFirestorePrimaryEnabled()) {
    const jobWithUploads = await prisma.job.create({
      data: { orgScope, dataSourceRef, dataSourceId, status: 'Completed', uploads: { create: {
        originalName: input.originalName, storedPath: input.storedPath, sizeBytes: input.sizeBytes, contentType: input.contentType,
      } } }, include: { uploads: true },
    });
    const { uploads, ...job } = jobWithUploads;
    return { ...job, uploads: uploads.map((upload) => publicIntakeUpload({ ...upload, job })) };
  }
  // One document commits upload metadata and its receipt together; bytes are written first.
  const id = randomBytes(6).readUIntBE(0, 6) || 1;
  const timestamp = new Date().toISOString();
  const job = { id, orgScope, dataSourceRef, dataSourceId, status: 'Completed', createdAt: timestamp, updatedAt: timestamp };
  const upload: IntakeUpload = { ...input, id, jobId: id, orgScope, createdAt: timestamp, job };
  await intakeCollection(orgScope, 'intakeUploads').doc(String(id)).create(upload);
  return { ...job, uploads: [publicIntakeUpload(upload)] };
}

export async function findIntakeUpload(orgScope: string, id: number): Promise<IntakeUpload | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!isFirestorePrimaryEnabled()) return prisma.upload.findFirst({ where: { id, job: { orgScope } }, include: { job: true } });
  const snapshot = await intakeCollection(orgScope, 'intakeUploads').doc(String(id)).get();
  const upload = snapshot.data() as IntakeUpload | undefined;
  return upload?.orgScope === orgScope && upload.job.orgScope === orgScope ? upload : null;
}

export async function listIntakeUploads(orgScope: string) {
  if (!isFirestorePrimaryEnabled()) {
    const uploads = await prisma.upload.findMany({ where: { job: { orgScope } }, include: { job: true }, orderBy: { createdAt: 'desc' }, take: 25 });
    return uploads.map(publicIntakeUpload);
  }
  const snapshot = await intakeCollection(orgScope, 'intakeUploads').orderBy('createdAt', 'desc').limit(25).get();
  return snapshot.docs.map((doc) => doc.data() as IntakeUpload)
    .filter((upload) => upload.orgScope === orgScope && upload.job.orgScope === orgScope).map(publicIntakeUpload);
}

type QueuedJob = { id: string; orgScope: string; type: string; status: 'queued'; createdAt: string; payload: unknown };
const localJobs: QueuedJob[] = [];

export async function listIntakeJobs(orgScope: string) {
  if (!isFirestorePrimaryEnabled()) return localJobs.filter((job) => job.orgScope === orgScope).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const snapshot = await intakeCollection(orgScope, 'intakeJobs').orderBy('createdAt', 'desc').limit(100).get();
  return snapshot.docs.map((doc) => doc.data()).filter((job) => job.orgScope === orgScope).map(({ payloadJson, ...job }) => ({
    ...job, payload: JSON.parse(payloadJson),
  }));
}

export async function queueIntakeJob(orgScope: string, type: string, payload: unknown) {
  const job: QueuedJob = { id: randomUUID(), orgScope, type, payload: payload ?? null, status: 'queued', createdAt: new Date().toISOString() };
  if (isFirestorePrimaryEnabled()) {
    const { payload: jobPayload, ...metadata } = job;
    await intakeCollection(orgScope, 'intakeJobs').doc(job.id).create({ ...metadata, payloadJson: JSON.stringify(jobPayload) });
  }
  else localJobs.push(job);
  return job;
}
