import { createHash, randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getStorage } from 'firebase-admin/storage';
import { getSilFirebaseAdminAuth } from '../../lib/firebaseAdmin';
import { config } from '../../lib/config';
import { isFirestorePrimaryEnabled } from '../../lib/firestore';
import { assertIntakeStorageConfigured, StoredBlob } from './intakeStore';

const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const objectPrefix = (orgScope: string) => `sil-intake/${digest(orgScope)}/`;

export function intakeBucket() {
  assertIntakeStorageConfigured();
  return getStorage(getSilFirebaseAdminAuth().app).bucket(process.env.SIL_UPLOAD_BUCKET!.trim());
}

export async function storeUploadBytes(orgScope: string, bytes: Buffer, contentType: string): Promise<StoredBlob> {
  assertIntakeStorageConfigured();
  const sha256 = digest(bytes);
  if (!isFirestorePrimaryEnabled()) {
    const root = path.resolve(config.uploadDir);
    await fs.mkdir(root, { recursive: true });
    const storedPath = path.join(root, randomUUID());
    await fs.writeFile(storedPath, bytes, { flag: 'wx' });
    return { storedPath, sha256 };
  }
  const storedPath = `${objectPrefix(orgScope)}${randomUUID()}`;
  const file = intakeBucket().file(storedPath);
  await file.save(bytes, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType, cacheControl: 'private, no-store', metadata: { sha256 } } });
  const [metadata] = await file.getMetadata();
  if (!metadata.generation) throw new Error('The uploaded object has no verified generation.');
  return { storedPath, sha256, storageGeneration: String(metadata.generation) };
}

export async function readUploadBytes(orgScope: string, blob: StoredBlob): Promise<Buffer> {
  assertIntakeStorageConfigured();
  if (!isFirestorePrimaryEnabled()) {
    const root = path.resolve(config.uploadDir);
    const target = path.resolve(blob.storedPath);
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid local upload path.');
    return fs.readFile(target);
  }
  if (!blob.storedPath.startsWith(objectPrefix(orgScope)) || !blob.storageGeneration || !blob.sha256) {
    throw new Error('Upload storage provenance is invalid.');
  }
  const [bytes] = await intakeBucket().file(blob.storedPath, { generation: blob.storageGeneration }).download({ validation: 'crc32c' });
  if (digest(bytes) !== blob.sha256) throw new Error('Upload integrity verification failed.');
  return bytes;
}
