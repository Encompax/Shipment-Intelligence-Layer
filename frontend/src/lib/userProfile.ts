import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { ProductivitySuite, WorkspacePlan } from "./onboarding";

export type SilUserProfile = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  organization?: string | null;
  workspaceId?: string;
  workspaceName?: string;
  preferredModule?: string;
  requestedModules?: string[];
  moduleAccess?: Record<string, "pending" | "active" | "suspended">;
  signupSource?: string;
  authIntent?: string;
  authMethod?: string;
  intendedPlan?: WorkspacePlan;
  productivitySuite?: ProductivitySuite;
  recommendedImportMode?: string;
  onboardingStatus?: string;
  setupCompleted?: boolean;
  setupCompletedAt?: unknown;
  firstDataSourceMode?:
    | "csv-upload"
    | "excel-upload"
    | "google-sheet-export"
    | "database-or-api"
    | "api-later";
  firstConnectionTarget?:
    | "sql-server"
    | "postgresql"
    | "mysql"
    | "erp-or-tms"
    | "custom-api"
    | "not-selected";
  firstOperationalGoal?: "launch-workspace" | "connect-loads" | "tender-freight" | "govern-decisions";
  usageGuardrails?: {
    monthlyTokenGuardrail?: number;
    monthlySpendReviewRequired?: boolean;
  };
  adaptiveExperience?: {
    uxLearningEnabled?: boolean;
    startingProfile?: string;
    nextStep?: string;
  };
  legalAcknowledgements?: {
    termsAccepted?: boolean;
    privacyAccepted?: boolean;
    acceptedAt?: unknown;
  };
  ownerEmail?: string | null;
};

export async function getSilUserProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as SilUserProfile) : null;
}

export async function updateSilUserProfile(uid: string, payload: Partial<SilUserProfile>) {
  await setDoc(
    doc(db, "users", uid),
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
