import { randomUUID } from "crypto";
import { Express, Request, Response } from "express";
import { AuthenticatedSilRequest } from "../middleware/requireSilAuth";
import { intakeCollection } from "../services/intake/intakeStore";
import { getSilFirestore, isFirestorePrimaryEnabled } from "../lib/firestore";

type LaneType = "LINEHAUL" | "FINAL_MILE" | "INBOUND" | "ADHOC";
type AwardType = "PRIMARY" | "BACKUP" | "SPOT";

type LaneRecord = {
  laneId: string;
  workspaceId: string;
  name: string;
  laneType: LaneType;
  originFacilityId: string;
  destinationFacilityId: string;
  equipmentType?: string;
  frequency?: string;
  transitDays?: number;
  standardOriginDepartureTime?: string;
  standardCarrierArrivalStart?: string;
  standardCarrierArrivalEnd?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  notes?: string;
  adhocReason?: "CARRIER_COVERAGE" | "SPECIAL_PROJECT" | "VOLUME_CAPACITY";
  status: "ACTIVE";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type EligibilityRecord = {
  eligibilityId: string;
  workspaceId: string;
  laneId: string;
  externalPartnerId: string;
  notes?: string;
  status: "ELIGIBLE";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type AwardRecord = {
  awardId: string;
  workspaceId: string;
  laneId: string;
  externalPartnerId: string;
  awardType: AwardType;
  rate: number;
  currency: "USD";
  rateUnit: "PER_LOAD" | "PER_MILE" | "FLAT";
  capacity?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  notes?: string;
  status: "ACTIVE" | "SUPERSEDED";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  supersededAt?: string;
  supersededByAwardId?: string;
};

const laneTypes = new Set<LaneType>(["LINEHAUL", "FINAL_MILE", "INBOUND", "ADHOC"]);
const awardTypes = new Set<AwardType>(["PRIMARY", "BACKUP", "SPOT"]);
const rateUnits = new Set(["PER_LOAD", "PER_MILE", "FLAT"]);
const adhocReasons = new Set(["CARRIER_COVERAGE", "SPECIAL_PROJECT", "VOLUME_CAPACITY"]);
const localLanes = new Map<string, LaneRecord[]>();
const localEligibility = new Map<string, EligibilityRecord[]>();
const localAwards = new Map<string, AwardRecord[]>();

const authContext = (req: Request) => (req as AuthenticatedSilRequest).silAuth;

function requireClient(req: Request, res: Response) {
  const auth = authContext(req);
  if (!auth?.orgScope) {
    res.status(403).json({ error: "An authenticated client workspace is required." });
    return null;
  }
  if (String(auth.profile.userType || "customer_user") === "partner_user") {
    res.status(403).json({ error: "Partner accounts cannot administer client lanes or awards." });
    return null;
  }
  return auth;
}

const cleanText = (value: unknown, max = 240) => String(value || "").trim().slice(0, max);
const optionalNumber = (value: unknown) => value === "" || value === null || value === undefined ? undefined : Number(value);
const validDate = (value: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
const validTime = (value: string) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

async function listCollection<T>(workspaceId: string, name: string, local: Map<string, T[]>) {
  if (!isFirestorePrimaryEnabled()) return local.get(workspaceId) ?? [];
  const snapshot = await intakeCollection(workspaceId, name).get();
  return snapshot.docs.map((doc) => doc.data()).filter((record) => record.workspaceId === workspaceId) as T[];
}

async function listPartners(workspaceId: string) {
  const db = getSilFirestore();
  if (!db) return [];
  const snapshot = await db.collection("organizations").doc(workspaceId).collection("externalPartners").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((partner: any) => partner.status !== "archived");
}

async function facilityExists(workspaceId: string, facilityId: string) {
  if (!isFirestorePrimaryEnabled()) return true;
  return (await intakeCollection(workspaceId, "facilities").doc(facilityId).get()).exists;
}

async function partnerExists(workspaceId: string, partnerId: string) {
  const db = getSilFirestore();
  if (!db) return false;
  return (await db.collection("organizations").doc(workspaceId).collection("externalPartners").doc(partnerId).get()).exists;
}

async function laneExists(workspaceId: string, laneId: string) {
  if (!isFirestorePrimaryEnabled()) return (localLanes.get(workspaceId) ?? []).some((lane) => lane.laneId === laneId);
  return (await intakeCollection(workspaceId, "lanes").doc(laneId).get()).exists;
}

export function registerLaneRoutes(app: Express) {
  app.get("/api/lanes", async (req: Request, res: Response) => {
    const auth = requireClient(req, res);
    if (!auth) return;
    const [lanes, eligibility, awards, partners] = await Promise.all([
      listCollection(auth.orgScope, "lanes", localLanes),
      listCollection(auth.orgScope, "laneEligibility", localEligibility),
      listCollection(auth.orgScope, "laneAwards", localAwards),
      listPartners(auth.orgScope),
    ]);
    res.json({ lanes, eligibility, awards, partners });
  });

  app.post("/api/lanes", async (req: Request, res: Response) => {
    const auth = requireClient(req, res);
    if (!auth) return;
    const name = cleanText(req.body?.name, 120);
    const laneType = cleanText(req.body?.laneType).toUpperCase() as LaneType;
    const originFacilityId = cleanText(req.body?.originFacilityId, 180);
    const destinationFacilityId = cleanText(req.body?.destinationFacilityId, 180);
    const transitDays = optionalNumber(req.body?.transitDays);
    const effectiveFrom = cleanText(req.body?.effectiveFrom, 10);
    const effectiveTo = cleanText(req.body?.effectiveTo, 10);
    const adhocReason = cleanText(req.body?.adhocReason).toUpperCase();
    const standardOriginDepartureTime = cleanText(req.body?.standardOriginDepartureTime, 5);
    const standardCarrierArrivalStart = cleanText(req.body?.standardCarrierArrivalStart, 5);
    const standardCarrierArrivalEnd = cleanText(req.body?.standardCarrierArrivalEnd, 5);
    if (!name || !laneTypes.has(laneType) || !originFacilityId || !destinationFacilityId || originFacilityId === destinationFacilityId) {
      return res.status(400).json({ error: "Lane name, type, and two different facilities are required." });
    }
    if (!validDate(effectiveFrom) || !validDate(effectiveTo) || (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)) {
      return res.status(400).json({ error: "Lane effective dates are invalid." });
    }
    if (transitDays !== undefined && (!Number.isFinite(transitDays) || transitDays < 0 || transitDays > 60)) {
      return res.status(400).json({ error: "Transit days must be between 0 and 60." });
    }
    if (![standardOriginDepartureTime, standardCarrierArrivalStart, standardCarrierArrivalEnd].every(validTime)) {
      return res.status(400).json({ error: "Lane schedule times must use a valid 24-hour time." });
    }
    if ((standardCarrierArrivalStart && !standardCarrierArrivalEnd) || (!standardCarrierArrivalStart && standardCarrierArrivalEnd)) {
      return res.status(400).json({ error: "Both the carrier arrival window start and end are required when setting a window." });
    }
    if (standardCarrierArrivalStart && standardCarrierArrivalEnd && standardCarrierArrivalEnd <= standardCarrierArrivalStart) {
      return res.status(400).json({ error: "The carrier arrival window end must be later than its start." });
    }
    if (laneType === "ADHOC" && !adhocReasons.has(adhocReason)) {
      return res.status(400).json({ error: "Select whether the adhoc lane supports carrier coverage, a special project, or volume capacity." });
    }
    if (!(await facilityExists(auth.orgScope, originFacilityId)) || !(await facilityExists(auth.orgScope, destinationFacilityId))) {
      return res.status(400).json({ error: "Both lane facilities must exist in this workspace." });
    }
    const now = new Date().toISOString();
    const lane: LaneRecord = {
      laneId: randomUUID(), workspaceId: auth.orgScope, name, laneType, originFacilityId, destinationFacilityId,
      equipmentType: cleanText(req.body?.equipmentType, 80) || undefined,
      frequency: cleanText(req.body?.frequency, 80) || undefined,
      transitDays,
      standardOriginDepartureTime: laneType === "LINEHAUL" ? standardOriginDepartureTime || undefined : undefined,
      standardCarrierArrivalStart: laneType === "LINEHAUL" ? standardCarrierArrivalStart || undefined : undefined,
      standardCarrierArrivalEnd: laneType === "LINEHAUL" ? standardCarrierArrivalEnd || undefined : undefined,
      effectiveFrom: effectiveFrom || undefined,
      effectiveTo: effectiveTo || undefined,
      notes: cleanText(req.body?.notes, 1000) || undefined,
      adhocReason: laneType === "ADHOC" ? adhocReason as LaneRecord["adhocReason"] : undefined,
      status: "ACTIVE", createdBy: auth.uid, createdAt: now, updatedAt: now,
    };
    if (isFirestorePrimaryEnabled()) await intakeCollection(auth.orgScope, "lanes").doc(lane.laneId).create(lane);
    else localLanes.set(auth.orgScope, [...(localLanes.get(auth.orgScope) ?? []), lane]);
    res.status(201).json({ lane });
  });

  app.post("/api/lanes/:laneId/eligibility", async (req: Request, res: Response) => {
    const auth = requireClient(req, res);
    if (!auth) return;
    const laneId = cleanText(req.params.laneId, 180);
    const externalPartnerId = cleanText(req.body?.externalPartnerId, 180);
    if (!laneId || !externalPartnerId || !(await laneExists(auth.orgScope, laneId)) || !(await partnerExists(auth.orgScope, externalPartnerId))) {
      return res.status(400).json({ error: "A lane and registered external partner are required." });
    }
    const existing = (await listCollection(auth.orgScope, "laneEligibility", localEligibility)).find((item) => item.laneId === laneId && item.externalPartnerId === externalPartnerId);
    if (existing) return res.status(409).json({ error: "This carrier is already eligible for the lane." });
    const now = new Date().toISOString();
    const eligibility: EligibilityRecord = {
      eligibilityId: randomUUID(), workspaceId: auth.orgScope, laneId, externalPartnerId,
      notes: cleanText(req.body?.notes, 500) || undefined,
      status: "ELIGIBLE", createdBy: auth.uid, createdAt: now, updatedAt: now,
    };
    if (isFirestorePrimaryEnabled()) await intakeCollection(auth.orgScope, "laneEligibility").doc(eligibility.eligibilityId).create(eligibility);
    else localEligibility.set(auth.orgScope, [...(localEligibility.get(auth.orgScope) ?? []), eligibility]);
    res.status(201).json({ eligibility });
  });

  app.post("/api/lanes/:laneId/awards", async (req: Request, res: Response) => {
    const auth = requireClient(req, res);
    if (!auth) return;
    const laneId = cleanText(req.params.laneId, 180);
    const externalPartnerId = cleanText(req.body?.externalPartnerId, 180);
    const awardType = cleanText(req.body?.awardType).toUpperCase() as AwardType;
    const rateUnit = cleanText(req.body?.rateUnit).toUpperCase() as AwardRecord["rateUnit"];
    const rate = Number(req.body?.rate);
    const capacity = optionalNumber(req.body?.capacity);
    const effectiveFrom = cleanText(req.body?.effectiveFrom, 10);
    const effectiveTo = cleanText(req.body?.effectiveTo, 10);
    const eligibility = await listCollection(auth.orgScope, "laneEligibility", localEligibility);
    if (!laneId || !externalPartnerId || !awardTypes.has(awardType) || !rateUnits.has(rateUnit) || !Number.isFinite(rate) || rate <= 0) {
      return res.status(400).json({ error: "Carrier, award type, rate, and rate unit are required." });
    }
    if (!validDate(effectiveFrom) || !effectiveFrom || !validDate(effectiveTo) || (effectiveTo && effectiveTo < effectiveFrom)) {
      return res.status(400).json({ error: "A valid award start date and date range are required." });
    }
    if (capacity !== undefined && (!Number.isFinite(capacity) || capacity < 0)) return res.status(400).json({ error: "Capacity cannot be negative." });
    if (!(await laneExists(auth.orgScope, laneId)) || !(await partnerExists(auth.orgScope, externalPartnerId))) {
      return res.status(400).json({ error: "The lane or external partner does not exist." });
    }
    if (!eligibility.some((item) => item.laneId === laneId && item.externalPartnerId === externalPartnerId && item.status === "ELIGIBLE")) {
      return res.status(409).json({ error: "Mark the carrier eligible for this lane before creating an award." });
    }

    const now = new Date().toISOString();
    const award: AwardRecord = {
      awardId: randomUUID(), workspaceId: auth.orgScope, laneId, externalPartnerId, awardType, rate,
      currency: "USD", rateUnit, capacity,
      effectiveFrom, effectiveTo: effectiveTo || undefined,
      notes: cleanText(req.body?.notes, 500) || undefined,
      status: "ACTIVE", createdBy: auth.uid, createdAt: now, updatedAt: now,
    };
    const awards = await listCollection(auth.orgScope, "laneAwards", localAwards);
    const superseded = awards.filter((item) => item.laneId === laneId && item.externalPartnerId === externalPartnerId && item.awardType === awardType && item.status === "ACTIVE");
    if (isFirestorePrimaryEnabled()) {
      const batch = getSilFirestore()!.batch();
      superseded.forEach((item) => batch.update(intakeCollection(auth.orgScope, "laneAwards").doc(item.awardId), {
        status: "SUPERSEDED", supersededAt: now, supersededByAwardId: award.awardId, updatedAt: now,
      }));
      batch.create(intakeCollection(auth.orgScope, "laneAwards").doc(award.awardId), award);
      await batch.commit();
    } else {
      const next = awards.map((item) => superseded.some((previous) => previous.awardId === item.awardId)
        ? { ...item, status: "SUPERSEDED" as const, supersededAt: now, supersededByAwardId: award.awardId, updatedAt: now }
        : item);
      localAwards.set(auth.orgScope, [...next, award]);
    }
    res.status(201).json({ award, supersededAwardIds: superseded.map((item) => item.awardId) });
  });
}
