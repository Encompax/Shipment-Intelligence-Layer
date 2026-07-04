import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

export const isFirestoreMirrorEnabled = () =>
  (process.env.SIL_FIRESTORE_ENABLED ?? "").toLowerCase() === "true";

export function getSilFirestore(): Firestore | null {
  if (!isFirestoreMirrorEnabled()) return null;

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.SIL_FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
    });
  }

  return getFirestore();
}
