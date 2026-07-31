import { NextFunction, Request, Response } from "express";
import { DecodedIdToken } from "firebase-admin/auth";
import { getSilFirebaseAdminAuth } from "../lib/firebaseAdmin";

export type AuthenticatedSilRequest = Request & {
  authUser?: DecodedIdToken;
};

const isAuthRequired = () => (process.env.SIL_AUTH_REQUIRED ?? "").toLowerCase() === "true";

export async function requireSilAuth(req: AuthenticatedSilRequest, res: Response, next: NextFunction) {
  if (!isAuthRequired() || req.method === "OPTIONS") {
    next();
    return;
  }

  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const decoded = await getSilFirebaseAdminAuth().verifyIdToken(match[1]);
    req.authUser = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      error: "Invalid authentication token.",
      details: error instanceof Error ? error.message : "Unknown authentication error",
    });
  }
}
