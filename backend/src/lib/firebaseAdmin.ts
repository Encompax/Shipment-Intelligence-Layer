import { applicationDefault, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const getProjectId = () =>
  process.env.SIL_FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined;

function getFirebaseAdminApp() {
  if (getApps().length) {
    return getApp();
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: getProjectId(),
  });
}

export function getSilFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}
