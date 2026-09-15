import { NextFunction, Request, Response } from "express";
import { DecodedIdToken } from "firebase-admin/auth";
import { getSilFirebaseAdminAuth } from "../lib/firebaseAdmin";
import { getFirestore } from "firebase-admin/firestore";

export type SilAuthContext = {
  uid: string;
  orgScope: string;
  profile: Record<string, any>;
};

export type AuthenticatedSilRequest = Request & {
  authUser?: DecodedIdToken;
  silAuth?: SilAuthContext;
};

const isAuthRequired = () =>
  process.env.NODE_ENV === "production" || (process.env.SIL_AUTH_REQUIRED ?? "").toLowerCase() === "true";

export async function requireSilAuth(req: AuthenticatedSilRequest, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    if (!isAuthRequired()) {
      next();
      return;
    }
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const decoded = await getSilFirebaseAdminAuth().verifyIdToken(match[1], true);
    const db = getFirestore(getSilFirebaseAdminAuth().app);
    const snapshot = await db.doc(`users/${decoded.uid}`).get();
    const profile = snapshot.data() || {};
    const orgScope = String(profile.orgScope || "").trim();
    if (!snapshot.exists || !orgScope || orgScope.includes('/')) {
      res.status(403).json({ error: "An organization-scoped Encompax profile is required." });
      return;
    }
    if (String(profile.moduleAccess?.sil || "").toLowerCase() !== "active") {
      res.status(403).json({ error: "Active SIL module access is required." });
      return;
    }
    const [organization, membership] = await Promise.all([
      db.doc(`organizations/${orgScope}`).get(),
      db.doc(`organizations/${orgScope}/members/${decoded.uid}`).get(),
    ]);
    const org = organization.data();
    const member = membership.data();
    if (!organization.exists || org?.status !== 'active' || org.moduleEntitlements?.sil?.status !== 'active'
      || !membership.exists || member?.uid !== decoded.uid || member.status !== 'active'
      || !Array.isArray(member.moduleKeys) || !member.moduleKeys.includes('sil')) {
      res.status(403).json({ error: 'Active organization membership and SIL entitlement are required.' });
      return;
    }
    req.authUser = decoded;
    req.silAuth = { uid: decoded.uid, orgScope, profile };
    next();
  } catch (error) {
    res.status(401).json({
      error: "Invalid authentication token.",
    });
  }
}
