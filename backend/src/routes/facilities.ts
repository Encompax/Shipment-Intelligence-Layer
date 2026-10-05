import { createHash } from "crypto";
import { Express, Request, Response } from "express";
import * as fileUpload from "express-fileupload";
import path from "path";
import * as XLSX from "xlsx";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { intakeWorkspace, requireIntakeWorkspace } from "../middleware/requireIntakeWorkspace";
import { intakeCollection } from "../services/intake/intakeStore";

type FacilityType = "SUPPLIER" | "CROSSDOCK" | "DC" | "MFC" | "OTHER";
type PropertyType = "COMMERCIAL" | "RESIDENTIAL";
type Facility = {
  facilityId: string;
  workspaceId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode?: string;
  facilityType: FacilityType;
  propertyType: PropertyType;
  updatedAt: string;
};

const localFacilities = new Map<string, Facility[]>();
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

export function registerFacilityRoutes(app: Express) {
  app.use("/api/facilities", requireIntakeWorkspace);

  app.get("/api/facilities", async (req: Request, res: Response) => {
    const workspaceId = intakeWorkspace(req);
    if (!isFirestorePrimaryEnabled()) return res.json({ facilities: localFacilities.get(workspaceId) ?? [] });
    const snapshot = await intakeCollection(workspaceId, "facilities").orderBy("name").get();
    res.json({ facilities: snapshot.docs.map((doc) => doc.data()).filter((facility) => facility.workspaceId === workspaceId) });
  });

  app.post("/api/facilities/import", async (req: Request, res: Response) => {
    const workspaceId = intakeWorkspace(req);
    const upload = req.files?.file as fileUpload.UploadedFile | undefined;
    if (!upload || Array.isArray(upload)) return res.status(400).json({ error: "Upload one CSV or Excel facility file." });
    const extension = path.extname(upload.name).toLowerCase();
    if (![".csv", ".xlsx", ".xls"].includes(extension)) return res.status(415).json({ error: "Facility imports support CSV, XLSX, and XLS files." });

    const imported: Facility[] = [];
    const rejected: Array<{ row: number; error: string }> = [];
    const timestamp = new Date().toISOString();
    for (const [index, row] of parseFacilityRows(upload, extension).entries()) {
      const name = valueFor(row, [/facilityname/, /^name$/, /locationname/]);
      const address = valueFor(row, [/address1?/, /street/, /address/]);
      const city = valueFor(row, [/city/, /municipality/]);
      const state = valueFor(row, [/state/, /province/, /region/]);
      if (!name || !address || !city || !state) {
        rejected.push({ row: index + 2, error: "Facility name, address, city, and state are required." });
        continue;
      }
      const facility: Facility = {
        facilityId: `facility-${createHash("sha256").update(`${workspaceId}|${name}|${address}|${city}|${state}`).digest("hex").slice(0, 20)}`,
        workspaceId,
        name,
        address,
        city,
        state,
        postalCode: valueFor(row, [/postal/, /zipcode/, /^zip$/]) || undefined,
        facilityType: facilityType(valueFor(row, [/facilitytype/, /^type$/, /locationtype/])),
        propertyType: propertyType(valueFor(row, [/propertytype/, /addresstype/, /residentialcommercial/])),
        updatedAt: timestamp,
      };
      imported.push(facility);
    }
    if (isFirestorePrimaryEnabled()) {
      const collection = intakeCollection(workspaceId, "facilities");
      const batch = collection.firestore.batch();
      imported.forEach((facility) => batch.set(collection.doc(facility.facilityId), facility));
      await batch.commit();
    } else {
      const existing = new Map((localFacilities.get(workspaceId) ?? []).map((facility) => [facility.facilityId, facility]));
      imported.forEach((facility) => existing.set(facility.facilityId, facility));
      localFacilities.set(workspaceId, [...existing.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }
    res.status(201).json({ importedCount: imported.length, rejectedCount: rejected.length, rejected, facilities: imported });
  });
}
