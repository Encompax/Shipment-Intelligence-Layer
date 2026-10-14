import { NextFunction, Request, Response } from "express";
import { DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getSilFirebaseAdminAuth } from "../lib/firebaseAdmin";

export type SilPartnerContext = {
  partnerOrgScope: string;
  clientOrgScope: string;
  externalPartnerId: string;
  clientOrganizationName: string;
  accessScopes: string[];
};

export type SilAuthContext = {
  uid: string;
  orgScope: string;
  homeOrgScope: string;
  profile: Record<string, any>;
  partnerContext?: SilPartnerContext;
};

export type AuthenticatedSilRequest = Request & {
  authUser?: DecodedIdToken;
  silAuth?: SilAuthContext;
};

const isAuthRequired = () =>
  process.env.NODE_ENV === "production" || (process.env.SIL_AUTH_REQUIRED ?? "").toLowerCase() === "true";

export function isPartnerApiPath(pathname: unknown) {
  return /^\/partner(?:\/|$)/.test(String(pathname || ""));
}

function validScope(value: unknown) {
  const scope = String(value || "").trim();
  return scope && !scope.includes("/") && ![".", ".."].includes(scope) ? scope : "";
}

function requestedPartnerContext(req: AuthenticatedSilRequest, decoded: DecodedIdToken) {
  const bodyContext = String(req.originalUrl || "").startsWith("/api/auth/encompax/launch") ? req.body?.relationshipContext : null;
  const partnerOrgScope = validScope(bodyContext?.partnerOrgScope || decoded.partnerOrgScope);
  const clientOrgScope = validScope(bodyContext?.clientOrgScope || decoded.clientOrgScope);
  const externalPartnerId = validScope(bodyContext?.externalPartnerId || decoded.externalPartnerId);
  if (!partnerOrgScope && !clientOrgScope && !externalPartnerId) return null;
  if (!partnerOrgScope || !clientOrgScope || !externalPartnerId) throw new Error("PARTNER_CONTEXT_INCOMPLETE");
  return { partnerOrgScope, clientOrgScope, externalPartnerId };
}

async function validatePartnerContext(
  db: Firestore,
  uid: string,
  homeOrgScope: string,
  context: { partnerOrgScope: string; clientOrgScope: string; externalPartnerId: string },
): Promise<SilPartnerContext> {
  if (context.partnerOrgScope !== homeOrgScope) throw new Error("PARTNER_ORGANIZATION_MISMATCH");
  const [partnerOrganization, partnerMembership, clientOrganization, relationship, externalPartner] = await Promise.all([
    db.doc(`organizations/${context.partnerOrgScope}`).get(),
    db.doc(`organizations/${context.partnerOrgScope}/members/${uid}`).get(),
    db.doc(`organizations/${context.clientOrgScope}`).get(),
    db.doc(`organizations/${context.partnerOrgScope}/clientRelationships/${context.clientOrgScope}`).get(),
    db.doc(`organizations/${context.clientOrgScope}/externalPartners/${context.externalPartnerId}`).get(),
  ]);
  const partnerOrg = partnerOrganization.data() || {};
  const membership = partnerMembership.data() || {};
  const clientOrg = clientOrganization.data() || {};
  const relation = relationship.data() || {};
  const partner = externalPartner.data() || {};
  const relationshipAdministrator = ["primary_admin", "organization_admin"].includes(String(membership.role || "").toLowerCase());
  const valid = partnerOrganization.exists && partnerOrg.status === "active"
    && partnerMembership.exists && membership.uid === uid && membership.status === "active" && relationshipAdministrator
    && clientOrganization.exists && clientOrg.status === "active"
    && relationship.exists && relation.status === "active" && relation.moduleKey === "sil"
    && relation.externalPartnerId === context.externalPartnerId
    && externalPartner.exists && partner.status === "active"
    && String(partner.linkedOrganizationScope || partner.partnerOrgScope || "") === context.partnerOrgScope;
  if (!valid) throw new Error("PARTNER_RELATIONSHIP_NOT_ACTIVE");
  return {
    ...context,
    clientOrganizationName: String(relation.clientOrganizationName || clientOrg.name || context.clientOrgScope),
    accessScopes: Array.isArray(relation.accessScopes) ? relation.accessScopes.map(String) : [],
  };
}

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
    const adminAuth = getSilFirebaseAdminAuth();
    const decoded = await adminAuth.verifyIdToken(match[1], true);
    const db = getFirestore(adminAuth.app);
    const snapshot = await db.doc(`users/${decoded.uid}`).get();
    const profile = snapshot.data() || {};
    const homeOrgScope = validScope(profile.orgScope);
    if (!snapshot.exists || !homeOrgScope) {
      res.status(403).json({ error: "An organization-scoped Encompax profile is required." });
      return;
    }
    const partnerRequest = requestedPartnerContext(req, decoded);
    if (partnerRequest) {
      const partnerContext = await validatePartnerContext(db, decoded.uid, homeOrgScope, partnerRequest);
      req.authUser = decoded;
      req.silAuth = { uid: decoded.uid, orgScope: partnerContext.clientOrgScope, homeOrgScope, profile, partnerContext };
      next();
      return;
    }
    if (String(profile.moduleAccess?.sil || "").toLowerCase() !== "active") {
      res.status(403).json({ error: "Active SIL module access is required." });
      return;
    }
    const [organization, membership] = await Promise.all([
      db.doc(`organizations/${homeOrgScope}`).get(),
      db.doc(`organizations/${homeOrgScope}/members/${decoded.uid}`).get(),
    ]);
    const org = organization.data();
    const member = membership.data() || {};
    if (!organization.exists || org?.status !== 'active' || org.moduleEntitlements?.sil?.status !== 'active'
      || !membership.exists || member?.uid !== decoded.uid || member.status !== 'active'
      || !Array.isArray(member.moduleKeys) || !member.moduleKeys.includes('sil')) {
      res.status(403).json({ error: 'Active organization membership and SIL entitlement are required.' });
      return;
    }
    req.authUser = decoded;
    req.silAuth = { uid: decoded.uid, orgScope: homeOrgScope, homeOrgScope, profile };
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_AUTHENTICATION_TOKEN";
    const relationshipError = message.startsWith("PARTNER_");
    res.status(relationshipError ? 403 : 401).json({ error: relationshipError ? message : "Invalid authentication token." });
  }
}
