import { createHash, randomBytes } from "crypto";
import { Express, Request, Response, Router } from "express";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { AuthenticatedSilRequest, requireSilAuth } from "../middleware/requireSilAuth";
import { getSilFirebaseAdminAuth } from "../lib/firebaseAdmin";

const MODULE_KEY = "sil";
const CODE_TTL_MS = 60_000;
const COLLECTION = "moduleLaunchCodes";

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function getAdminFirestore() {
  return getFirestore(getSilFirebaseAdminAuth().app);
}

async function createLaunchCode(req: AuthenticatedSilRequest, res: Response) {
  const user = req.authUser;
  if (!user?.uid) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const db = getAdminFirestore();
  const context = req.silAuth;
  if (!context || (!context.partnerContext && String(context.profile?.moduleAccess?.[MODULE_KEY] || "").toLowerCase() !== "active")) {
    res.status(403).json({ error: "Active SIL access is required for this account." });
    return;
  }

  const code = randomBytes(32).toString("base64url");
  const expiresAt = Timestamp.fromMillis(Date.now() + CODE_TTL_MS);

  await db.collection(COLLECTION).doc(hashCode(code)).set({
    uid: user.uid,
    module: MODULE_KEY,
    orgScope: context.orgScope,
    homeOrgScope: context.homeOrgScope,
    partnerContext: context.partnerContext || null,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    consumedAt: null,
  });

  res.setHeader("cache-control", "no-store");
  res.status(201).json({ code, expiresInSeconds: CODE_TTL_MS / 1000 });
}

async function redeemLaunchCode(req: Request, res: Response) {
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!code) {
    res.status(400).json({ error: "A launch code is required." });
    return;
  }

  const db = getAdminFirestore();
  const codeReference = db.collection(COLLECTION).doc(hashCode(code));
  let launchUid = "";
  let launchOrgScope = "";
  let launchHomeOrgScope = "";
  let partnerOrgScope = "";
  let clientOrgScope = "";
  let externalPartnerId = "";
  let clientOrganizationName = "";
  let relationshipAccessScopes: string[] = [];

  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(codeReference);
      const data = snapshot.data();
      const expiresAt = data?.expiresAt instanceof Timestamp ? data.expiresAt.toMillis() : 0;

      if (!snapshot.exists || data?.module !== MODULE_KEY || data?.consumedAt || expiresAt <= Date.now()) {
        throw new Error("INVALID_LAUNCH_CODE");
      }

      launchUid = String(data.uid);
      launchOrgScope = String(data.orgScope || "");
      launchHomeOrgScope = String(data.homeOrgScope || data.orgScope || "");
      const storedPartnerContext = data.partnerContext && typeof data.partnerContext === "object" ? data.partnerContext : null;
      partnerOrgScope = String(storedPartnerContext?.partnerOrgScope || "");
      clientOrgScope = String(storedPartnerContext?.clientOrgScope || "");
      externalPartnerId = String(storedPartnerContext?.externalPartnerId || "");
      clientOrganizationName = String(storedPartnerContext?.clientOrganizationName || "");
      relationshipAccessScopes = Array.isArray(storedPartnerContext?.accessScopes) ? storedPartnerContext.accessScopes.map(String) : [];
      transaction.update(codeReference, { consumedAt: FieldValue.serverTimestamp() });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_LAUNCH_CODE") {
      res.status(401).json({ error: "The launch code is invalid, expired, or already used." });
      return;
    }
    throw error;
  }

  if (!launchUid) {
    res.status(401).json({ error: "The launch code could not be redeemed." });
    return;
  }

  const customClaims: Record<string, unknown> = {
    encompaxModule: MODULE_KEY,
    orgScope: launchOrgScope,
    homeOrgScope: launchHomeOrgScope,
  };
  if (partnerOrgScope && clientOrgScope && externalPartnerId) {
    customClaims.partnerOrgScope = partnerOrgScope;
    customClaims.clientOrgScope = clientOrgScope;
    customClaims.externalPartnerId = externalPartnerId;
    customClaims.clientOrganizationName = clientOrganizationName;
    customClaims.relationshipAccessScopes = relationshipAccessScopes;
  }
  const customToken = await getSilFirebaseAdminAuth().createCustomToken(launchUid, customClaims);

  res.setHeader("cache-control", "no-store");
  res.json({ customToken });
}

export function registerEncompaxAuthRoutes(app: Express) {
  const router = Router();
  router.post("/launch", requireSilAuth, (req, res, next) => {
    void createLaunchCode(req as AuthenticatedSilRequest, res).catch(next);
  });
  router.post("/redeem", (req, res, next) => {
    void redeemLaunchCode(req, res).catch(next);
  });
  app.use("/api/auth/encompax", router);
}
