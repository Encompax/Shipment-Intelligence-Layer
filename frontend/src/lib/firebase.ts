import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, OAuthProvider, signInWithCustomToken } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyDUcr7o-M_4kTyO_wurwzSvASFHvoC-Kc8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "encompax-prod.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "encompax-prod",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "encompax-prod.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "111381214769",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:111381214769:web:9a4ff0102d924c3c77c710",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const microsoftProvider = new OAuthProvider("microsoft.com");
microsoftProvider.setCustomParameters({ prompt: "select_account" });

export async function consumeEncompaxLaunchCode() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("encompax_launch");
  if (!code) return false;

  url.searchParams.delete("encompax_launch");
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);

  const response = await fetch("/api/auth/encompax/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.customToken) {
    throw new Error(result?.error || "Encompax module launch could not be completed.");
  }

  await signInWithCustomToken(auth, result.customToken);
  return true;
}
