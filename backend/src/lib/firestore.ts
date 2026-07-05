import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

export const isFirestoreMirrorEnabled = () =>
  (process.env.SIL_FIRESTORE_ENABLED ?? "").toLowerCase() === "true";

export const isFirestorePrimaryEnabled = () =>
  (process.env.SIL_FIRESTORE_PRIMARY_ENABLED ?? "").toLowerCase() === "true";

export const isSilFirestoreStorageEnabled = () => isFirestoreMirrorEnabled() || isFirestorePrimaryEnabled();

export const getSilFirestoreProjectId = () =>
  process.env.SIL_FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || null;

export const getSilFirestoreRootCollection = () => process.env.SIL_FIRESTORE_ROOT_COLLECTION || "silWorkspaces";

export function getSilFirestore(): Firestore | null {
  if (!isSilFirestoreStorageEnabled()) return null;

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: getSilFirestoreProjectId() ?? undefined,
    });
  }

  return getFirestore();
}
