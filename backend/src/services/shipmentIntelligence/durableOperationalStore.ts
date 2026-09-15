import { intakeCollection } from '../intake/intakeStore';
import { SilWorkflowEvent } from './types';

type RecordKind = 'loads' | 'carriers' | 'lanes' | 'marketRates';
const recordId = (id: string) => {
  if (!id || Buffer.byteLength(id) > 1000) throw new Error('Invalid operational record ID.');
  return Buffer.from(id).toString('base64url');
};
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export async function listDurableRecords<T>(kind: RecordKind, workspaceId?: string): Promise<T[]> {
  const snapshot = await intakeCollection(workspaceId!, kind).orderBy('updatedAt', 'desc').get();
  return snapshot.docs.map((doc) => doc.data()).filter((value) => value.workspaceId === workspaceId) as T[];
}

export async function getDurableRecord<T>(kind: RecordKind, id: string, workspaceId?: string): Promise<T | null> {
  const snapshot = await intakeCollection(workspaceId!, kind).doc(recordId(id)).get();
  const record = snapshot.data();
  return record?.workspaceId === workspaceId ? record as T : null;
}

export async function saveDurableRecord(kind: RecordKind, id: string, value: { workspaceId?: string }, create = false, event?: SilWorkflowEvent) {
  const collection = intakeCollection(value.workspaceId!, kind);
  const ref = collection.doc(recordId(id));
  const data = { ...clean(value), updatedAt: new Date().toISOString() };
  const batch = collection.firestore.batch();
  if (create) batch.create(ref, data);
  else batch.set(ref, data);
  if (event) {
    if (event.workspaceId !== value.workspaceId) throw new Error('Workflow event ownership does not match its record.');
    batch.create(intakeCollection(value.workspaceId!, 'workflowEvents').doc(event.eventId), clean(event));
  }
  await batch.commit();
}

export async function updateDurableLoadStatus(loadId: string, workspaceId: string, status: string) {
  await intakeCollection(workspaceId, 'loads').doc(recordId(loadId)).update({ status, updatedAt: new Date().toISOString() });
}
