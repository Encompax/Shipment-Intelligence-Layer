import { randomUUID } from "crypto";
import { Express, Request, Response } from "express";
import { AuthenticatedSilRequest } from "../middleware/requireSilAuth";
import { intakeCollection } from "../services/intake/intakeStore";
import { getSilFirestore, isFirestorePrimaryEnabled } from "../lib/firestore";
import { omitUndefinedFields } from "../lib/firestoreDocument";

type LaneType = "LINEHAUL" | "FINAL_MILE" | "INBOUND" | "ADHOC";
type AwardType = "PRIMARY" | "BACKUP" | "SPOT";
type AdhocMode = "ONE_TIME" | "ROLLING_CONTINGENCY" | "TEMPORARY_RECURRING";

type LaneRecord = {
  laneId: string;
  workspaceId: string;
  name: string;
  laneType: LaneType;
  originFacilityId: string;
  destinationFacilityId: string;
  businessUnitId: string;
  businessUnitName: string;
  equipmentType?: string;
  loadAssumption?: "TL" | "LTL";
  frequency?: string;
  dispatchDays?: string[];
  transitDays?: number;
  terminalArrivalDays?: string[];
  terminalArrivalStart?: string;
  terminalArrivalEnd?: string;
  downlineCarrierTerminalFacilityId?: string;
  storeDeliveryDays?: string[];
  standardOriginDepartureTime?: string;
  standardCarrierArrivalStart?: string;
  standardCarrierArrivalEnd?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  notes?: string;
  adhocReason?: "CARRIER_COVERAGE" | "SPECIAL_PROJECT" | "VOLUME_CAPACITY";
  adhocMode?: AdhocMode;
  parentLaneId?: string;
  maxUsesPerWeek?: number;
  responseDeadlineHours?: number;
  rateCap?: number;
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
const adhocModes = new Set<AdhocMode>(["ONE_TIME", "ROLLING_CONTINGENCY", "TEMPORARY_RECURRING"]);
const operatingFrequencies = new Set(["DAILY", "1WEEKLY", "2WEEKLY", "3WEEKLY", "4WEEKLY", "OTHER"]);
const weekdays = new Set(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
const equipmentAssumptions = new Map([
  ["53 FT DRY VAN", "TL" as const],
  ["26 FT DRY VAN", "LTL" as const],
  ["BOX TRUCK", "LTL" as const],
]);
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

async function listBusinessUnits(workspaceId: string) {
  const db = getSilFirestore();
  if (!db) return [];
  const snapshot = await db.collection("organizations").doc(workspaceId).get();
  const organization = snapshot.data() || {};
  const configured = Array.isArray(organization.businessUnits) ? organization.businessUnits : [];
  if (configured.length) return configured.filter((unit: any) => unit?.status !== "inactive" && unit?.id && unit?.name);
  return String(organization.name || "").toLowerCase() === "gopuff"
    ? [{ id: "gopuff", name: "GoPuff", status: "active" }, { id: "bevmo", name: "BevMo", status: "active" }]
    : [];
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

async function findLane(workspaceId: string, laneId: string): Promise<LaneRecord | undefined> {
  if (!laneId) return undefined;
  if (!isFirestorePrimaryEnabled()) return (localLanes.get(workspaceId) ?? []).find((lane) => lane.laneId === laneId);
  const snapshot = await intakeCollection(workspaceId, "lanes").doc(laneId).get();
  const lane = snapshot.data() as LaneRecord | undefined;
  return lane?.workspaceId === workspaceId ? lane : undefined;
}

export function registerLaneRoutes(app: Express) {
  app.get("/api/lanes", async (req: Request, res: Response) => {
    const auth = requireClient(req, res);
    if (!auth) return;
    const [lanes, eligibility, awards, partners, businessUnits] = await Promise.all([
      listCollection(auth.orgScope, "lanes", localLanes),
      listCollection(auth.orgScope, "laneEligibility", localEligibility),
      listCollection(auth.orgScope, "laneAwards", localAwards),
      listPartners(auth.orgScope),
      listBusinessUnits(auth.orgScope),
    ]);
    res.json({ lanes, eligibility, awards, partners, businessUnits });
  });

  app.post("/api/lanes", async (req: Request, res: Response) => {
    const auth = requireClient(req, res);
    if (!auth) return;
    const name = cleanText(req.body?.name, 120);
    const laneType = cleanText(req.body?.laneType).toUpperCase() as LaneType;
    const originFacilityId = cleanText(req.body?.originFacilityId, 180);
    const destinationFacilityId = cleanText(req.body?.destinationFacilityId, 180);
    const businessUnitId = cleanText(req.body?.businessUnitId, 80).toLowerCase();
    const equipmentType = cleanText(req.body?.equipmentType, 80).toUpperCase();
    const frequency = cleanText(req.body?.frequency, 20).toUpperCase();
    const dispatchDays: string[] = Array.isArray(req.body?.dispatchDays)
      ? Array.from(new Set<string>((req.body.dispatchDays as unknown[]).map((day) => cleanText(day, 12).toUpperCase())))
      : [];
    const terminalArrivalDays: string[] = Array.isArray(req.body?.terminalArrivalDays) ? Array.from(new Set<string>((req.body.terminalArrivalDays as unknown[]).map((day) => cleanText(day, 12).toUpperCase()))) : [];
    const storeDeliveryDays: string[] = Array.isArray(req.body?.storeDeliveryDays) ? Array.from(new Set<string>((req.body.storeDeliveryDays as unknown[]).map((day) => cleanText(day, 12).toUpperCase()))) : [];
    const terminalArrivalStart = cleanText(req.body?.terminalArrivalStart, 5);
    const terminalArrivalEnd = cleanText(req.body?.terminalArrivalEnd, 5);
    const downlineCarrierTerminalFacilityId = cleanText(req.body?.downlineCarrierTerminalFacilityId, 180);
    const effectiveFrom = cleanText(req.body?.effectiveFrom, 10);
    const effectiveTo = cleanText(req.body?.effectiveTo, 10);
    const adhocReason = cleanText(req.body?.adhocReason).toUpperCase();
    const adhocMode = cleanText(req.body?.adhocMode).toUpperCase() as AdhocMode;
    const parentLaneId = cleanText(req.body?.parentLaneId, 180);
    const maxUsesPerWeek = optionalNumber(req.body?.maxUsesPerWeek);
    const responseDeadlineHours = optionalNumber(req.body?.responseDeadlineHours);
    const rateCap = optionalNumber(req.body?.rateCap);
    const standardOriginDepartureTime = cleanText(req.body?.standardOriginDepartureTime, 5);
    const standardCarrierArrivalStart = cleanText(req.body?.standardCarrierArrivalStart, 5);
    const standardCarrierArrivalEnd = cleanText(req.body?.standardCarrierArrivalEnd, 5);
    if (!name || !laneTypes.has(laneType) || !originFacilityId || !destinationFacilityId || originFacilityId === destinationFacilityId || !businessUnitId || !equipmentType) {
      return res.status(400).json({ error: "Lane name, business unit, equipment, type, and two different facilities are required." });
    }
    if (equipmentType && !equipmentAssumptions.has(equipmentType)) {
      return res.status(400).json({ error: "Select a supported lane equipment type." });
    }
    if (!operatingFrequencies.has(frequency) || !dispatchDays.length || dispatchDays.some((day) => !weekdays.has(day))) {
      return res.status(400).json({ error: "Select an operating frequency and at least one valid dispatch day." });
    }
    if (frequency === "DAILY" && dispatchDays.length !== weekdays.size) {
      return res.status(400).json({ error: "Daily lanes must include every dispatch day." });
    }
    const expectedWeeklyDays = new Map([["1WEEKLY", 1], ["2WEEKLY", 2], ["3WEEKLY", 3], ["4WEEKLY", 4]]).get(frequency);
    if (expectedWeeklyDays && dispatchDays.length !== expectedWeeklyDays) {
      return res.status(400).json({ error: `${frequency.replace("WEEKLY", " weekly")} lanes require exactly ${expectedWeeklyDays} dispatch day${expectedWeeklyDays === 1 ? "" : "s"}.` });
    }
    if (!validDate(effectiveFrom) || !validDate(effectiveTo) || (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom)) {
      return res.status(400).json({ error: "Lane effective dates are invalid." });
    }
    if (!terminalArrivalDays.length || terminalArrivalDays.some((day) => !weekdays.has(day))) {
      return res.status(400).json({ error: "Select valid terminal arrival days." });
    }
    if (laneType === "FINAL_MILE" && (!storeDeliveryDays.length || storeDeliveryDays.some((day) => !weekdays.has(day)))) {
      return res.status(400).json({ error: "Select valid store delivery days for the final mile lane." });
    }
    if (!terminalArrivalStart || !terminalArrivalEnd || !validTime(terminalArrivalStart) || !validTime(terminalArrivalEnd) || terminalArrivalEnd <= terminalArrivalStart) {
      return res.status(400).json({ error: "The terminal arrival window requires a valid start and later end time." });
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
    if (laneType === "ADHOC" && !adhocModes.has(adhocMode)) {
      return res.status(400).json({ error: "Select a one-time, rolling contingency, or temporary recurring adhoc mode." });
    }
    if (laneType === "ADHOC" && adhocMode === "ROLLING_CONTINGENCY") {
      const parentLane = await findLane(auth.orgScope, parentLaneId);
      if (!parentLane || parentLane.laneType === "ADHOC") return res.status(400).json({ error: "A rolling contingency must reference an existing standard lane." });
    }
    if (maxUsesPerWeek !== undefined && (!Number.isInteger(maxUsesPerWeek) || maxUsesPerWeek < 1 || maxUsesPerWeek > 999)) {
      return res.status(400).json({ error: "Maximum uses per week must be a whole number between 1 and 999." });
    }
    if (responseDeadlineHours !== undefined && (!Number.isFinite(responseDeadlineHours) || responseDeadlineHours <= 0 || responseDeadlineHours > 168)) {
      return res.status(400).json({ error: "Carrier response deadline must be between 0 and 168 hours." });
    }
    if (rateCap !== undefined && (!Number.isFinite(rateCap) || rateCap <= 0)) return res.status(400).json({ error: "Rate cap must be greater than zero." });
    if (!(await facilityExists(auth.orgScope, originFacilityId)) || !(await facilityExists(auth.orgScope, destinationFacilityId))) {
      return res.status(400).json({ error: "Both lane facilities must exist in this workspace." });
    }
    if (!downlineCarrierTerminalFacilityId || !(await facilityExists(auth.orgScope, downlineCarrierTerminalFacilityId))) {
      return res.status(400).json({ error: "Select a downline carrier terminal from this workspace's facilities." });
    }
    const businessUnit = (await listBusinessUnits(auth.orgScope)).find((unit: any) => String(unit.id).toLowerCase() === businessUnitId);
    if (!businessUnit) return res.status(400).json({ error: "Select an active business unit managed by this organization." });
    const now = new Date().toISOString();
    const lane: LaneRecord = {
      laneId: randomUUID(), workspaceId: auth.orgScope, name, laneType, originFacilityId, destinationFacilityId,
      businessUnitId: String(businessUnit.id), businessUnitName: String(businessUnit.name),
      equipmentType: equipmentType || undefined,
      loadAssumption: equipmentType ? equipmentAssumptions.get(equipmentType) : undefined,
      frequency,
      dispatchDays,
      terminalArrivalDays,
      terminalArrivalStart,
      terminalArrivalEnd,
      downlineCarrierTerminalFacilityId,
      storeDeliveryDays: laneType === "FINAL_MILE" ? storeDeliveryDays : undefined,
      standardOriginDepartureTime: laneType === "LINEHAUL" ? standardOriginDepartureTime || undefined : undefined,
      standardCarrierArrivalStart: laneType === "LINEHAUL" ? standardCarrierArrivalStart || undefined : undefined,
      standardCarrierArrivalEnd: laneType === "LINEHAUL" ? standardCarrierArrivalEnd || undefined : undefined,
      effectiveFrom: effectiveFrom || undefined,
      effectiveTo: effectiveTo || undefined,
      notes: cleanText(req.body?.notes, 1000) || undefined,
      adhocReason: laneType === "ADHOC" ? adhocReason as LaneRecord["adhocReason"] : undefined,
      adhocMode: laneType === "ADHOC" ? adhocMode : undefined,
      parentLaneId: laneType === "ADHOC" && parentLaneId ? parentLaneId : undefined,
      maxUsesPerWeek: laneType === "ADHOC" ? maxUsesPerWeek : undefined,
      responseDeadlineHours: laneType === "ADHOC" ? responseDeadlineHours : undefined,
      rateCap: laneType === "ADHOC" ? rateCap : undefined,
      status: "ACTIVE", createdBy: auth.uid, createdAt: now, updatedAt: now,
    };
    if (isFirestorePrimaryEnabled()) await intakeCollection(auth.orgScope, "lanes").doc(lane.laneId).create(omitUndefinedFields(lane));
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
    if (isFirestorePrimaryEnabled()) await intakeCollection(auth.orgScope, "laneEligibility").doc(eligibility.eligibilityId).create(omitUndefinedFields(eligibility));
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
      batch.create(intakeCollection(auth.orgScope, "laneAwards").doc(award.awardId), omitUndefinedFields(award));
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
