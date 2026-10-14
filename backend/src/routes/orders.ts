import { randomUUID } from "crypto";
import { Express, Request, Response } from "express";
import { AuthenticatedSilRequest } from "../middleware/requireSilAuth";
import { intakeCollection } from "../services/intake/intakeStore";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { readUploadTable } from "./uploads";
import { listFacilitiesForWorkspace } from "./facilities";
import { listLaneBusinessUnits, listLanePartners, listLanePlanningRegistry } from "./lanes";
import { buildOrderPlanningProposal, getLatestOrderPlanningProposal, listOrderPlanningProposals, saveOrderPlanningProposal } from "../services/orderPlanningService";
import { decideOrderPlanningProposal, listOrderPlanningDecisions, PlanningDecisionConflict, PlanningDecisionValidationError, type PlanningDecisionType } from "../services/orderPlanningDecisionService";

export type OrderStatus = "DRAFT" | "VALIDATION_REQUIRED" | "READY_TO_PLAN" | "ASSIGNED_TO_LOAD" | "TENDERED" | "CARRIER_ACCEPTED" | "TENDER_REJECTED" | "TENDER_EXPIRED" | "IN_TRANSIT" | "DELIVERED";
export type OrderRecord = Record<string, unknown> & { orderId: string; workspaceId: string; primaryReference: string; status: OrderStatus };

const localOrders = new Map<string, OrderRecord[]>();
const localProfiles = new Map<string, any[]>();
const localReviews = new Map<string, any[]>();
const localMeidCounters = new Map<string, number>();
const fields = [
  "action", "primaryReference", "poNumber", "materialTransferOrderNumber", "meid", "businessUnit",
  "earliestPickup", "latestPickup", "earliestDelivery", "latestDelivery", "originId", "destinationId",
  "quantity", "quantityUom", "lines", "weight", "weightUom", "waterWeight", "equipmentType", "scac",
  "modeType", "orderType", "handlingUnits", "handlingUnitsUom", "waterPallets",
  "eachQuantity", "caseQuantity", "palletQuantity",
] as const;

const aliases: Record<string, string[]> = {
  action: ["action"], primaryReference: ["primary reference", "primary_reference", "primaryreference", "transfer number"],
  poNumber: ["po number", "po_number", "ponumber", "po"], materialTransferOrderNumber: ["material transfer order number", "material_transfer_order_number", "mto", "to number"],
  meid: ["meid"], businessUnit: ["business unit", "business_unit"], earliestPickup: ["earliest pickup", "earliest_pickup"],
  latestPickup: ["latest pickup", "latest_pickup"], earliestDelivery: ["earliest delivery", "earliest_delivery"], latestDelivery: ["latest delivery", "latest_delivery"],
  originId: ["origin id", "origin_id", "origin"], destinationId: ["destination id", "destination_id", "destination"],
  quantity: ["quantity", "qty"], quantityUom: ["quantity unit of measure", "quantity uom", "quantity_uom"], lines: ["lines", "line count"],
  weight: ["weight"], weightUom: ["weight unit of measure", "weight uom", "weight_uom"], waterWeight: ["water weight", "water_weight"],
  equipmentType: ["equipment type", "equipment_type", "equipment"], scac: ["scac"], modeType: ["mode type", "mode_type", "mode"],
  orderType: ["order type", "order_type"], handlingUnits: ["handling units", "handling_units"], handlingUnitsUom: ["handling units unit of measure", "handling units uom", "handling_units_uom"],
  waterPallets: ["water pallets", "water_pallets"],
  eachQuantity: ["each quantity", "each qty", "eaches"], caseQuantity: ["case quantity", "case qty", "cases"], palletQuantity: ["pallet quantity", "pallet qty", "pallets"],
};

const auth = (req: Request) => (req as AuthenticatedSilRequest).silAuth;
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const normalizedHeader = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const numberOrNull = (value: unknown) => value === "" || value == null ? null : Number(value);
const comparable = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
type ReviewIssue = { row: number; field: string; severity: "ERROR" | "REVIEW"; code?: string; message: string };
type ReviewCorrection = { row: number; field: string; originalValue: unknown; proposedValue: unknown; reason: string; confidence: number };
const FIRST_SIL_TEST_MEID = 500000001;

async function reserveSilTestMeids(workspaceId: string, count: number) {
  if (count <= 0) return [];
  let first: number;
  if (isFirestorePrimaryEnabled()) {
    const counter = intakeCollection(workspaceId, "orderCounters").doc("silTestMeid");
    first = await counter.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(counter);
      const next = snapshot.exists ? Number(snapshot.data()?.nextValue) : FIRST_SIL_TEST_MEID;
      if (!Number.isSafeInteger(next) || next < FIRST_SIL_TEST_MEID || next + count - 1 > 999999999) throw new Error("SIL test MEID range is exhausted or misconfigured.");
      transaction.set(counter, { workspaceId, nextValue: next + count, updatedAt: new Date().toISOString() });
      return next;
    });
  } else {
    first = localMeidCounters.get(workspaceId) ?? FIRST_SIL_TEST_MEID;
    localMeidCounters.set(workspaceId, first + count);
  }
  return Array.from({ length: count }, (_, index) => String(first + index));
}

function requireWorkspace(req: Request, res: Response) {
  const context = auth(req);
  if (!context?.orgScope) { res.status(403).json({ error: "An authenticated client workspace is required." }); return null; }
  if (String(context.profile.userType || "customer_user") === "partner_user") { res.status(403).json({ error: "Partner accounts cannot administer orders." }); return null; }
  return context;
}

async function list(workspaceId: string, name: string, local: Map<string, any[]>) {
  if (!isFirestorePrimaryEnabled()) return local.get(workspaceId) ?? [];
  const snapshot = await intakeCollection(workspaceId, name).get();
  return snapshot.docs.map((doc) => doc.data()).filter((item) => item.workspaceId === workspaceId);
}

async function save(workspaceId: string, name: string, id: string, value: any, local: Map<string, any[]>) {
  if (isFirestorePrimaryEnabled()) await intakeCollection(workspaceId, name).doc(id).set(value);
  else local.set(workspaceId, [...(local.get(workspaceId) ?? []).filter((item) => item.orderId !== id && item.profileId !== id && item.reviewId !== id), value]);
}

export async function markLocalOrdersTenderState(workspaceId: string, orderIds: string[], status: OrderStatus, activeTenderId: string | null, updatedAt: string) {
  if (isFirestorePrimaryEnabled()) return;
  const orders = await list(workspaceId, "orders", localOrders);
  for (const order of orders.filter((item) => orderIds.includes(item.orderId))) {
    await save(workspaceId, "orders", order.orderId, { ...order, status, activeTenderId, updatedAt }, localOrders);
  }
}

export async function markLocalOrdersTendered(workspaceId: string, orderIds: string[], tenderId: string, updatedAt: string) {
  await markLocalOrdersTenderState(workspaceId, orderIds, "TENDERED", tenderId, updatedAt);
}

export function inferOrderMapping(headers: string[]) {
  const available = headers.map((header) => [header, normalizedHeader(header)] as const);
  return Object.fromEntries(fields.map((field) => {
    const accepted = (aliases[field] ?? [field]).map(normalizedHeader);
    const match = available.find(([, normalized]) => accepted.includes(normalized));
    return [field, match?.[0] ?? ""];
  }));
}

export function canonicalizeOrder(row: Record<string, unknown>, mapping: Record<string, string>) {
  const output: Record<string, unknown> = {};
  for (const field of fields) output[field] = mapping[field] ? row[mapping[field]] ?? "" : "";
  for (const field of ["quantity", "lines", "weight", "waterWeight", "handlingUnits", "waterPallets", "eachQuantity", "caseQuantity", "palletQuantity"]) output[field] = numberOrNull(output[field]);
  output.action = clean(output.action || "CREATE").toUpperCase();
  output.primaryReference = clean(output.primaryReference);
  return output;
}

export function validateOrder(row: Record<string, unknown>, rowNumber: number) {
  const issues: ReviewIssue[] = [];
  for (const field of ["primaryReference", "originId", "destinationId", "earliestPickup", "latestDelivery"]) {
    if (!clean(row[field])) issues.push({ row: rowNumber, field, severity: "ERROR", message: `${field} is required.` });
  }
  for (const field of ["quantity", "weight", "handlingUnits", "eachQuantity", "caseQuantity", "palletQuantity"]) {
    if (row[field] != null && (!Number.isFinite(row[field]) || Number(row[field]) < 0)) issues.push({ row: rowNumber, field, severity: "ERROR", message: `${field} must be a non-negative number.` });
  }
  if (!clean(row.poNumber) && !clean(row.materialTransferOrderNumber)) issues.push({ row: rowNumber, field: "poNumber", severity: "REVIEW", message: "No PO or material transfer order number was supplied." });
  return issues;
}

async function resolveFacilities(workspaceId: string, rows: Record<string, unknown>[]) {
  const facilities = await listFacilitiesForWorkspace(workspaceId);
  const corrections: ReviewCorrection[] = [];
  const issues: ReviewIssue[] = [];
  const resolve = (value: unknown) => {
    const key = comparable(value);
    if (!key) return [];
    return facilities.filter((facility: any) => [facility.facilityId, facility.siteId, facility.name].some((candidate) => comparable(candidate) === key));
  };
  rows.forEach((row, index) => {
    for (const field of ["originId", "destinationId"]) {
      const source = row[field];
      const matches = resolve(source);
      if (matches.length === 1) {
        const canonicalId = matches[0].facilityId;
        if (clean(source) !== canonicalId) {
          corrections.push({ row: index + 2, field, originalValue: source, proposedValue: canonicalId, reason: `Matched ${clean(source)} to facility ${matches[0].name}${matches[0].siteId ? ` (${matches[0].siteId})` : ""}.`, confidence: 1 });
          row[field] = canonicalId;
        }
      } else if (matches.length > 1) issues.push({ row: index + 2, field, severity: "ERROR", code: "AMBIGUOUS_FACILITY", message: `${clean(source)} matches more than one facility.` });
      else if (clean(source)) issues.push({ row: index + 2, field, severity: "ERROR", code: "FACILITY_NOT_FOUND", message: `${clean(source)} is not in the facility master.` });
    }
  });
  return { corrections, issues };
}

export const orderDuplicateKey = (row: Record<string, unknown>) => [row.primaryReference, row.poNumber, row.materialTransferOrderNumber, row.externalMeid || row.meid].map(comparable).filter(Boolean).join("|");

export function registerOrderRoutes(app: Express) {
  app.get("/api/orders", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const orders = await list(context.orgScope, "orders", localOrders);
    res.json({ orders: orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
  });

  app.post("/api/orders", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const canonical = canonicalizeOrder(req.body || {}, Object.fromEntries(fields.map((field) => [field, field])));
    const facilityReview = await resolveFacilities(context.orgScope, [canonical]);
    const existing = await list(context.orgScope, "orders", localOrders);
    const issues = [...validateOrder(canonical, 1), ...facilityReview.issues];
    const businessUnits = await listLaneBusinessUnits(context.orgScope);
    if (!businessUnits.some((unit: any) => comparable(unit.name) === comparable(canonical.businessUnit) || comparable(unit.id) === comparable(canonical.businessUnit))) issues.push({ row: 1, field: "businessUnit", severity: "ERROR", code: "BUSINESS_UNIT_NOT_FOUND", message: "Select a configured organization business unit." });
    if (clean(canonical.scac)) {
      const partners = await listLanePartners(context.orgScope);
      if (!partners.some((partner: any) => comparable(partner.scac) === comparable(canonical.scac))) issues.push({ row: 1, field: "scac", severity: "ERROR", code: "SCAC_NOT_FOUND", message: "Select the SCAC of a registered external partner." });
    }
    if (orderDuplicateKey(canonical) && existing.some((order) => orderDuplicateKey(order) === orderDuplicateKey(canonical))) issues.push({ row: 1, field: "primaryReference", severity: "ERROR", code: "DUPLICATE_ORDER", message: "An order with these references already exists." });
    const now = new Date().toISOString();
    const [silTestMeid] = await reserveSilTestMeids(context.orgScope, 1);
    const order: OrderRecord = { ...canonical, externalMeid: clean(canonical.meid) || null, meid: silTestMeid, silTestMeid, identifierType: "SIL_TEST_MEID", identifierSource: "SIL", environment: "TEST", orderId: randomUUID(), workspaceId: context.orgScope, primaryReference: clean(canonical.primaryReference), status: issues.some((i) => i.severity === "ERROR") ? "VALIDATION_REQUIRED" : "READY_TO_PLAN", issues, corrections: facilityReview.corrections, source: "MANUAL", createdBy: context.uid, createdAt: now, updatedAt: now } as OrderRecord;
    await save(context.orgScope, "orders", order.orderId, order, localOrders);
    res.status(201).json({ order });
  });

  app.get("/api/orders/intake-profiles", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    res.json({ profiles: await list(context.orgScope, "orderIntakeProfiles", localProfiles), canonicalFields: fields });
  });

  app.post("/api/orders/:orderId/generate-test-meid", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const orders = await list(context.orgScope, "orders", localOrders);
    const order = orders.find((item) => item.orderId === req.params.orderId);
    if (!order) { res.status(404).json({ error: "Order not found." }); return; }
    if (order.silTestMeid) { res.json({ order }); return; }
    const [silTestMeid] = await reserveSilTestMeids(context.orgScope, 1);
    const updated = { ...order, externalMeid: clean(order.externalMeid || order.meid) || null, meid: silTestMeid, silTestMeid, identifierType: "SIL_TEST_MEID", identifierSource: "SIL", environment: "TEST", updatedAt: new Date().toISOString() };
    await save(context.orgScope, "orders", order.orderId, updated, localOrders);
    res.json({ order: updated });
  });

  app.get("/api/orders/:orderId/planning-match", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const orders = await list(context.orgScope, "orders", localOrders);
    if (!orders.some((item) => item.orderId === req.params.orderId)) { res.status(404).json({ error: "Order not found." }); return; }
    const proposal = await getLatestOrderPlanningProposal(context.orgScope, req.params.orderId);
    if (!proposal) { res.status(404).json({ error: "No planning match has been created for this order." }); return; }
    res.json({ proposal });
  });

  app.get("/api/orders/:orderId/planning-matches", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const orders = await list(context.orgScope, "orders", localOrders);
    if (!orders.some((item) => item.orderId === req.params.orderId)) { res.status(404).json({ error: "Order not found." }); return; }
    const proposals = await listOrderPlanningProposals(context.orgScope, req.params.orderId);
    res.json({ count: proposals.length, proposals });
  });

  app.post("/api/orders/:orderId/planning-match", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const orders = await list(context.orgScope, "orders", localOrders);
    const order = orders.find((item) => item.orderId === req.params.orderId);
    if (!order) { res.status(404).json({ error: "Order not found." }); return; }
    if (order.status !== "READY_TO_PLAN") { res.status(409).json({ error: "Only orders that are ready to plan can be matched to lanes." }); return; }
    const [registry, previous] = await Promise.all([listLanePlanningRegistry(context.orgScope), getLatestOrderPlanningProposal(context.orgScope, order.orderId)]);
    const proposal = buildOrderPlanningProposal({
      workspaceId: context.orgScope,
      order,
      lanes: registry.lanes,
      eligibility: registry.eligibility,
      awards: registry.awards,
      partners: registry.partners,
      actor: context.uid,
      supersedesProposalId: previous?.proposalId ?? null,
    });
    await saveOrderPlanningProposal(proposal);
    res.status(201).json({ proposal });
  });

  app.get("/api/orders/:orderId/planning-decisions", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const orders = await list(context.orgScope, "orders", localOrders);
    if (!orders.some((item) => item.orderId === req.params.orderId)) { res.status(404).json({ error: "Order not found." }); return; }
    const decisions = await listOrderPlanningDecisions(context.orgScope, req.params.orderId);
    res.json({ count: decisions.length, decisions });
  });

  app.post("/api/orders/:orderId/planning-decisions", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const decision = clean(req.body?.decision).toUpperCase() as PlanningDecisionType;
    if (!(["APPROVED", "REJECTED"] as string[]).includes(decision)) { res.status(400).json({ error: "Decision must be APPROVED or REJECTED." }); return; }
    const orders = await list(context.orgScope, "orders", localOrders);
    const order = orders.find((item) => item.orderId === req.params.orderId);
    if (!order) { res.status(404).json({ error: "Order not found." }); return; }
    const latest = await getLatestOrderPlanningProposal(context.orgScope, order.orderId);
    if (!latest) { res.status(404).json({ error: "No planning proposal is available for this order." }); return; }
    const proposalId = clean(req.body?.proposalId);
    if (!proposalId || proposalId !== latest.proposalId) { res.status(409).json({ error: "Only the latest planning proposal can be decided." }); return; }
    try {
      const result = await decideOrderPlanningProposal({ workspaceId: context.orgScope, order, proposal: latest, decision, reason: clean(req.body?.reason, 1000), actor: context.uid });
      if (!isFirestorePrimaryEnabled() && result.load) await save(context.orgScope, "orders", order.orderId, result.order, localOrders);
      res.status(result.idempotent ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof PlanningDecisionConflict) { res.status(409).json({ error: error.message }); return; }
      if (error instanceof PlanningDecisionValidationError) { res.status(422).json({ error: error.message }); return; }
      throw error;
    }
  });

  app.post("/api/orders/intake-profiles", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const name = clean(req.body?.name, 120); const headers = Array.isArray(req.body?.headers) ? req.body.headers.map((header: unknown) => clean(header)) : [];
    if (!name || !headers.length) { res.status(400).json({ error: "Profile name and source headers are required." }); return; }
    const now = new Date().toISOString();
    const profile = { profileId: randomUUID(), workspaceId: context.orgScope, name, mapping: { ...inferOrderMapping(headers), ...(req.body?.mapping || {}) }, createdBy: context.uid, createdAt: now, updatedAt: now };
    await save(context.orgScope, "orderIntakeProfiles", profile.profileId, profile, localProfiles);
    res.status(201).json({ profile });
  });

  app.post("/api/orders/intake-reviews", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    let rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : [];
    if (req.body?.uploadId) {
      const upload = await readUploadTable(Number(req.body.uploadId), context.orgScope);
      if (!upload) { res.status(404).json({ error: "Upload not found." }); return; }
      if ("error" in upload) { res.status(415).json({ error: upload.error }); return; }
      rows = upload.parsed.records.slice(0, 5000);
    }
    if (!rows.length || typeof rows[0] !== "object") { res.status(400).json({ error: "At least one source row is required." }); return; }
    const headers = Object.keys(rows[0]);
    let storedProfile: any = null;
    if (req.body?.profileId) storedProfile = (await list(context.orgScope, "orderIntakeProfiles", localProfiles)).find((profile) => profile.profileId === clean(req.body.profileId));
    if (req.body?.profileId && !storedProfile) { res.status(404).json({ error: "Order intake profile not found in this workspace." }); return; }
    const mapping = { ...inferOrderMapping(headers), ...(storedProfile?.mapping || {}), ...(req.body?.mapping || {}) };
    const proposedRows = rows.map((row: any) => canonicalizeOrder(row, mapping));
    const facilityReview = await resolveFacilities(context.orgScope, proposedRows);
    const existingOrders = await list(context.orgScope, "orders", localOrders);
    const existingKeys = new Set(existingOrders.map(orderDuplicateKey).filter(Boolean));
    const batchKeys = new Set<string>();
    const duplicateIssues: ReviewIssue[] = [];
    proposedRows.forEach((row, index) => {
      const key = orderDuplicateKey(row);
      if (!key) return;
      if (existingKeys.has(key)) duplicateIssues.push({ row: index + 2, field: "primaryReference", severity: "ERROR", code: "DUPLICATE_EXISTING", message: "This order already exists in the workspace." });
      else if (batchKeys.has(key)) duplicateIssues.push({ row: index + 2, field: "primaryReference", severity: "ERROR", code: "DUPLICATE_FILE", message: "This order is duplicated within the uploaded file." });
      batchKeys.add(key);
    });
    const issues = [...proposedRows.flatMap((row, index) => validateOrder(row, index + 2)), ...facilityReview.issues, ...duplicateIssues];
    const now = new Date().toISOString();
    const comparisons = proposedRows.slice(0, 100).map((proposed, index) => ({ row: index + 2, original: rows[index], proposed, corrections: facilityReview.corrections.filter((correction) => correction.row === index + 2), issues: issues.filter((issue) => issue.row === index + 2) }));
    const review = { reviewId: randomUUID(), workspaceId: context.orgScope, profileId: storedProfile?.profileId || null, profileName: storedProfile?.name || clean(req.body?.profileName) || "Ad hoc order intake", sourceName: clean(req.body?.sourceName) || "Uploaded file", mapping, originalRows: rows, proposedRows, comparisons, corrections: facilityReview.corrections, issues, status: "PENDING_APPROVAL", createdBy: context.uid, createdAt: now };
    await save(context.orgScope, "orderIntakeReviews", review.reviewId, review, localReviews);
    res.status(201).json({ review: { ...review, originalRows: undefined, proposedRows: proposedRows.slice(0, 100), totalRows: proposedRows.length } });
  });

  app.post("/api/orders/intake-reviews/:reviewId/approve", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const reviews = await list(context.orgScope, "orderIntakeReviews", localReviews);
    const review = reviews.find((item) => item.reviewId === req.params.reviewId);
    if (!review || review.status !== "PENDING_APPROVAL") { res.status(404).json({ error: "A pending order intake review was not found." }); return; }
    const errorRows = new Set(review.issues.filter((issue: any) => issue.severity === "ERROR").map((issue: any) => issue.row - 2));
    const now = new Date().toISOString();
    const accepted = review.proposedRows.filter((_: any, index: number) => !errorRows.has(index));
    const testMeids = await reserveSilTestMeids(context.orgScope, accepted.length);
    const orders = accepted.map((row: any, index: number) => ({ ...row, externalMeid: clean(row.meid) || null, meid: testMeids[index], silTestMeid: testMeids[index], identifierType: "SIL_TEST_MEID", identifierSource: "SIL", environment: "TEST", orderId: randomUUID(), workspaceId: context.orgScope, status: "READY_TO_PLAN", issues: review.issues.filter((issue: any) => issue.row - 2 === review.proposedRows.indexOf(row)), source: "FILE_IMPORT", intakeReviewId: review.reviewId, intakeProfileId: review.profileId, createdBy: context.uid, createdAt: now, updatedAt: now }));
    for (const order of orders) await save(context.orgScope, "orders", order.orderId, order, localOrders);
    const approved = { ...review, status: "APPROVED", approvedBy: context.uid, approvedAt: now, importedOrderIds: orders.map((order: any) => order.orderId) };
    await save(context.orgScope, "orderIntakeReviews", review.reviewId, approved, localReviews);
    res.json({ importedCount: orders.length, rejectedCount: review.proposedRows.length - orders.length, orders });
  });
}
