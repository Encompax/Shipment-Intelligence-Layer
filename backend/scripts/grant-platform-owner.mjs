import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.GOOGLE_CLOUD_PROJECT || "encompax-prod";
const email = String(process.argv[2] || "").trim().toLowerCase();

if (!email) {
  throw new Error("Usage: node scripts/grant-platform-owner.mjs owner@example.com");
}

const app = initializeApp({ credential: applicationDefault(), projectId });
const auth = getAuth(app);
const db = getFirestore(app);
const user = await auth.getUserByEmail(email);

if (!user.emailVerified) {
  throw new Error(`Refusing to elevate unverified account: ${email}`);
}

await auth.setCustomUserClaims(user.uid, {
  ...(user.customClaims || {}),
  admin: true,
  platformOwner: true,
});

await db.doc(`users/${user.uid}`).set(
  {
    uid: user.uid,
    email,
    commercialEntitlements: {
      billingExempt: true,
      exemptionReason: "platform-owner",
    },
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);

console.log(JSON.stringify({
  uid: user.uid,
  email,
  admin: true,
  platformOwner: true,
  billingExempt: true,
}, null, 2));
