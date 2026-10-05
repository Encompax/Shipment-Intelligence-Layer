import { createHash, randomUUID } from "crypto";
import { Express, Request, Response } from "express";
import * as fileUpload from "express-fileupload";
import path from "path";
import * as XLSX from "xlsx";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeWorkspace, requireIntakeWorkspace } from "../middleware/requireIntakeWorkspace";
import { intakeCollection } from "../services/intake/intakeStore";
import { FacilityCorrection, FacilityReviewIssue, FacilityReviewRow, reviewFacilityIntake } from "../services/intake/facilityGovernanceReview";

type FacilityType = "SUPPLIER" | "CROSSDOCK" | "DC" | "MFC" | "OTHER";
type PropertyType = "COMMERCIAL" | "RESIDENTIAL";
type Facility = {
  facilityId: string;
  workspaceId: string;
  name: string;
  siteId?: string;
  address: string;
  city: string;
  state: string;
  postalCode?: string;
  facilityType: FacilityType;
  propertyType: PropertyType;
  primaryContactName?: string;
  primaryContactTitle?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  operatingHours?: string;
  regionalManager?: string;
  supplyChainBusinessPartner?: string;
  updatedAt: string;
};

const localFacilities = new Map<string, Facility[]>();
type FacilityReview = {
  reviewId: string;
  workspaceId: string;
  createdAt: string;
  originalName: string;
  rows: Facility[];
  issues: FacilityReviewIssue[];
  corrections: Array<FacilityCorrection & { councilDecision: "APPROVED" | "OPERATOR_REVIEW" }>;
  summary: string;
  risks: string[];
  councilStatus: "APPROVED" | "APPROVED_WITH_OPERATOR_REVIEW";
  importedAt?: string;
};
const localReviews = new Map<string, FacilityReview>();
const firestoreDocument = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const normalize = (value: string | undefined) => (value ?? "").trim();
const key = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");
const valueFor = (row: Record<string, string>, patterns: RegExp[]) => {
  const header = Object.keys(row).find((candidate) => patterns.some((pattern) => pattern.test(key(candidate))));
  return header ? normalize(row[header]) : "";
};
const parseCsv = (content: string) => {
  const rows = content.split(/\r?\n/).filter((line) => line.trim()).map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
  const headers = rows.shift() ?? [];
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
};
const parseFacilityRows = (upload: fileUpload.UploadedFile, extension: string): Array<Record<string, string>> => {
  if (extension === ".csv") return parseCsv(upload.data.toString("utf8"));
  const workbook = XLSX.read(upload.data, { type: "buffer" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false })
    .map((row) => Object.fromEntries(Object.entries(row).map(([header, value]) => [header, String(value ?? "")] )));
};
const facilityType = (value: string): FacilityType => {
  const candidate = value.toUpperCase().replace(/[\s-]/g, "");
  if (["SUPPLIER", "CROSSDOCK", "DC", "MFC"].includes(candidate)) return candidate as FacilityType;
  return "OTHER";
};
const propertyType = (value: string): PropertyType => value.toUpperCase().includes("RESIDENT") ? "RESIDENTIAL" : "COMMERCIAL";
const comparable = (value: string | undefined) => normalize(value).toLocaleLowerCase().replace(/[^a-z0-9]/g, "");

const buildFacility = (workspaceId: string, row: Record<string, string>, timestamp: string): Facility | null => {
  const name = valueFor(row, [/facilityname/, /^name$/, /locationname/]);
  const siteId = valueFor(row, [/siteid/, /sitecode/, /facilityid/, /locationid/]) || undefined;
  const address = valueFor(row, [/address1?/, /street/, /address/]);
  const city = valueFor(row, [/city/, /municipality/]);
  const state = valueFor(row, [/state/, /province/, /region/]);
  if (!name || !address || !city || !state) return null;
  return {
    facilityId: `facility-${createHash("sha256").update(siteId ? `${workspaceId}|${siteId}` : `${workspaceId}|${name}|${address}|${city}|${state}`).digest("hex").slice(0, 20)}`,
    workspaceId,
    name,
    siteId,
    address,
    city,
    state,
    postalCode: valueFor(row, [/postal/, /zipcode/, /^zip$/]) || undefined,
    facilityType: facilityType(valueFor(row, [/facilitytype/, /^type$/, /locationtype/])),
    propertyType: propertyType(valueFor(row, [/propertytype/, /addresstype/, /residentialcommercial/])),
    primaryContactName: valueFor(row, [/primarycontactname/, /contactname/, /^contact$/]) || undefined,
    primaryContactTitle: valueFor(row, [/primarycontacttitle/, /contacttitle/, /contactrole/]) || undefined,
    primaryContactEmail: valueFor(row, [/primarycontactemail/, /contactemail/, /^email$/]) || undefined,
    primaryContactPhone: valueFor(row, [/primarycontactphone/, /contactphone/, /^phone$/, /telephone/]) || undefined,
    operatingHours: valueFor(row, [/operatinghours/, /operationhours/, /storehours/, /^hours$/]) || undefined,
    regionalManager: valueFor(row, [/regionalmanager/, /regionmanager/]) || undefined,
    supplyChainBusinessPartner: valueFor(row, [/supplychainbusinesspartner/, /supplychainpartner/, /scbp/]) || undefined,
    updatedAt: timestamp,
  };
};

const reviewIssuesFor = (row: Record<string, string>, facility: Facility | null, rowNumber: number): FacilityReviewIssue[] => {
  if (!facility) return [{ row: rowNumber, severity: "ERROR", field: "record", message: "Facility name, address, city, and state are required." }];
  const issues: FacilityReviewIssue[] = [];
  const sourceType = valueFor(row, [/facilitytype/, /^type$/, /locationtype/]);
  const sourceProperty = valueFor(row, [/propertytype/, /addresstype/, /residentialcommercial/]);
  if (sourceType && facility.facilityType === "OTHER" && !/^other$/i.test(sourceType)) {
    issues.push({ row: rowNumber, severity: "REVIEW", field: "facilityType", message: `Unrecognized facility type: ${sourceType}.` });
  }
  if (sourceProperty && !/commercial|residential/i.test(sourceProperty)) {
    issues.push({ row: rowNumber, severity: "REVIEW", field: "propertyType", message: `Unrecognized property type: ${sourceProperty}.` });
  }
  if (facility.primaryContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(facility.primaryContactEmail)) {
    issues.push({ row: rowNumber, severity: "REVIEW", field: "primaryContactEmail", message: "Primary contact email is not in a recognized email format." });
  }
  if (/^\d{5,}$/.test(facility.name.replace(/[-\s]/g, ""))) {
    issues.push({ row: rowNumber, severity: "REVIEW", field: "name", message: "The facility name resembles an order or reference number; verify the source columns." });
  }
  return issues;
};

const applyCouncilCorrections = (rows: Facility[], corrections: FacilityCorrection[]) => {
  const byRow = new Map(rows.map((row, index) => [index + 2, row]));
  return corrections.map((correction) => {
    const record = byRow.get(correction.row);
    if (!record || !comparable(record[correction.field]) || comparable(record[correction.field]) !== comparable(correction.value)) {
      return { ...correction, councilDecision: "OPERATOR_REVIEW" as const };
    }
    const value = normalize(correction.value);
    if (correction.field === "facilityType") record.facilityType = facilityType(value);
    else if (correction.field === "propertyType") record.propertyType = propertyType(value);
    else if (correction.field === "postalCode") record.postalCode = value || undefined;
    else record[correction.field] = value;
    return { ...correction, councilDecision: "APPROVED" as const };
  });
};

const saveReview = async (review: FacilityReview) => {
  if (!isFirestorePrimaryEnabled()) {
    localReviews.set(`${review.workspaceId}:${review.reviewId}`, review);
    return;
  }
  await intakeCollection(review.workspaceId, "facilityReviews").doc(review.reviewId).set(firestoreDocument(review));
};

const findReview = async (workspaceId: string, reviewId: string): Promise<FacilityReview | null> => {
  if (!isFirestorePrimaryEnabled()) return localReviews.get(`${workspaceId}:${reviewId}`) ?? null;
  const snapshot = await intakeCollection(workspaceId, "facilityReviews").doc(reviewId).get();
  const review = snapshot.data() as FacilityReview | undefined;
  return review?.workspaceId === workspaceId ? review : null;
};

const persistFacilities = async (workspaceId: string, imported: Facility[]) => {
  if (isFirestorePrimaryEnabled()) {
    const collection = intakeCollection(workspaceId, "facilities");
    const batch = collection.firestore.batch();
    imported.forEach((facility) => batch.set(collection.doc(facility.facilityId), firestoreDocument(facility)));
    await batch.commit();
    return;
  }
  const existing = new Map((localFacilities.get(workspaceId) ?? []).map((facility) => [facility.facilityId, facility]));
  imported.forEach((facility) => existing.set(facility.facilityId, facility));
  localFacilities.set(workspaceId, [...existing.values()].sort((a, b) => a.name.localeCompare(b.name)));
};

export function registerFacilityRoutes(app: Express) {
  app.use("/api/facilities", requireIntakeWorkspace);

  app.get("/api/facilities", async (req: Request, res: Response) => {
    const workspaceId = intakeWorkspace(req);
    if (!isFirestorePrimaryEnabled()) return res.json({ facilities: localFacilities.get(workspaceId) ?? [] });
    const snapshot = await intakeCollection(workspaceId, "facilities").orderBy("name").get();
    res.json({ facilities: snapshot.docs.map((doc) => doc.data()).filter((facility) => facility.workspaceId === workspaceId) });
  });

  app.post("/api/facilities", async (req: Request, res: Response) => {
    const workspaceId = intakeWorkspace(req);
    const sourceRow = Object.fromEntries(Object.entries(req.body ?? {}).map(([field, value]) => [field, typeof value === "string" ? value : ""]));
    const facility = buildFacility(workspaceId, sourceRow, new Date().toISOString());
    if (!facility) return res.status(400).json({ error: "Facility name, address, city, and state are required." });
    if (facility.primaryContactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(facility.primaryContactEmail)) {
      return res.status(400).json({ error: "Enter a valid primary contact email or leave it blank." });
    }
    await persistFacilities(workspaceId, [facility]);
    res.status(201).json({ facility });
  });

  app.post("/api/facilities/review", async (req: Request, res: Response) => {
    const workspaceId = intakeWorkspace(req);
    const upload = req.files?.file as fileUpload.UploadedFile | undefined;
    if (!upload || Array.isArray(upload)) return res.status(400).json({ error: "Upload one CSV or Excel facility file." });
    const extension = path.extname(upload.name).toLowerCase();
    if (![".csv", ".xlsx", ".xls"].includes(extension)) return res.status(415).json({ error: "Facility reviews support CSV, XLSX, and XLS files." });

    const sourceRows = parseFacilityRows(upload, extension);
    if (sourceRows.length === 0) return res.status(400).json({ error: "The facility file has no data rows to review." });
    if (sourceRows.length > 500) return res.status(413).json({ error: "Facility review supports up to 500 rows per file." });

    const timestamp = new Date().toISOString();
    const rows: Facility[] = [];
    const reviewRows: FacilityReviewRow[] = [];
    const issues: FacilityReviewIssue[] = [];
    sourceRows.forEach((sourceRow, index) => {
      const rowNumber = index + 2;
      const facility = buildFacility(workspaceId, sourceRow, timestamp);
      issues.push(...reviewIssuesFor(sourceRow, facility, rowNumber));
      if (!facility) return;
      rows.push(facility);
      // Contact details are retained in SIL but are intentionally excluded from the AI review payload.
      reviewRows.push({
        row: rowNumber,
        name: facility.name,
        siteId: facility.siteId,
        address: facility.address,
        city: facility.city,
        state: facility.state,
        postalCode: facility.postalCode,
        facilityType: facility.facilityType,
        propertyType: facility.propertyType,
      });
    });

    let agentReview;
    try {
      agentReview = await reviewFacilityIntake({
        headers: Object.keys(sourceRows[0] ?? {}),
        rows: reviewRows,
        issues,
        safetyIdentifier: createHash("sha256").update(workspaceId).digest("hex"),
      });
    } catch (error) {
      console.error("Facility review agent request failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
      return res.status(503).json({ error: "The Encompax review agent is unavailable. No facilities were imported." });
    }

    const corrections = applyCouncilCorrections(rows, agentReview.corrections);
    const approvedCount = corrections.filter((correction) => correction.councilDecision === "APPROVED").length;
    const review: FacilityReview = {
      reviewId: randomUUID(),
      workspaceId,
      createdAt: timestamp,
      originalName: upload.name,
      rows,
      issues,
      corrections,
      summary: agentReview.summary,
      risks: agentReview.risks,
      councilStatus: corrections.length > approvedCount || issues.length > 0
        ? "APPROVED_WITH_OPERATOR_REVIEW"
        : "APPROVED",
    };
    await saveReview(review);
    res.status(201).json({
      reviewId: review.reviewId,
      originalName: review.originalName,
      validCount: review.rows.length,
      rejectedCount: review.issues.filter((issue) => issue.severity === "ERROR").length,
      issues: review.issues,
      corrections: review.corrections,
      summary: review.summary,
      risks: review.risks,
      councilStatus: review.councilStatus,
      rows: review.rows,
    });
  });

  app.post("/api/facilities/import", async (req: Request, res: Response) => {
    const workspaceId = intakeWorkspace(req);
    const reviewId = typeof req.body?.reviewId === "string" ? req.body.reviewId : "";
    if (reviewId) {
      const review = await findReview(workspaceId, reviewId);
      if (!review) return res.status(404).json({ error: "The facility review was not found for this workspace." });
      if (review.importedAt) return res.status(409).json({ error: "This reviewed facility file has already been imported." });
      await persistFacilities(workspaceId, review.rows);
      review.importedAt = new Date().toISOString();
      await saveReview(review);
      return res.status(201).json({
        importedCount: review.rows.length,
        rejectedCount: review.issues.filter((issue) => issue.severity === "ERROR").length,
        rejected: review.issues.filter((issue) => issue.severity === "ERROR"),
        facilities: review.rows,
      });
    }
    const upload = req.files?.file as fileUpload.UploadedFile | undefined;
    if (!upload || Array.isArray(upload)) return res.status(400).json({ error: "Upload one CSV or Excel facility file." });
    const extension = path.extname(upload.name).toLowerCase();
    if (![".csv", ".xlsx", ".xls"].includes(extension)) return res.status(415).json({ error: "Facility imports support CSV, XLSX, and XLS files." });

    const imported: Facility[] = [];
    const rejected: Array<{ row: number; error: string }> = [];
    const timestamp = new Date().toISOString();
    for (const [index, row] of parseFacilityRows(upload, extension).entries()) {
      const facility = buildFacility(workspaceId, row, timestamp);
      if (!facility) {
        rejected.push({ row: index + 2, error: "Facility name, address, city, and state are required." });
        continue;
      }
      imported.push(facility);
    }
    await persistFacilities(workspaceId, imported);
    res.status(201).json({ importedCount: imported.length, rejectedCount: rejected.length, rejected, facilities: imported });
  });
}
