import { createHash, randomUUID } from "crypto";
import { Express, Request, Response } from "express";
import { AuthenticatedSilRequest } from "../middleware/requireSilAuth";
import { intakeCollection } from "../services/intake/intakeStore";
import { isFirestorePrimaryEnabled } from "../lib/firestore";
import { readUploadTable } from "./uploads";
import { listFacilitiesForWorkspace } from "./facilities";
import { listLaneBusinessUnits, listLanePartners, listLanePlanningRegistry } from "./lanes";
import { buildOrderPlanningProposal, getLatestOrderPlanningProposal, listLatestOrderPlanningProposals, listOrderPlanningProposals, saveOrderPlanningProposal, type OrderPlanningProposal } from "../services/orderPlanningService";
import { buildPlanningDecisionRecords, decideOrderPlanningProposal, listOrderPlanningDecisions, PlanningDecisionConflict, PlanningDecisionValidationError, registerLocalPlannedLoads, type PlanningDecisionType } from "../services/orderPlanningDecisionService";
import { buildPlanningResolutionAnalysis, createPlanningResolutionDraft, getPlanningResolutionDraft, recordPlanningResolutionDecision } from "../services/planningResolutionService";
import { buildOrderConsolidationDecision, buildOrderConsolidationProposal, getOrderConsolidationDecision, listOrderConsolidationProposals, registerLocalOrderConsolidationDecision, saveOrderConsolidationProposal, verifyOrderConsolidationProposal } from "../services/orderConsolidationService";
import { runConsolidationAssistant, safetyIdentifierFor } from "../services/consolidationAssistantService";
import { buildShipmentJourney, listShipmentJourneys, saveShipmentJourney } from "../services/shipmentJourneyService";
import { buildCargoNestingProposal, listCargoNestingProposals, saveCargoNestingProposal, type CargoAllocationInput } from "../services/cargoNestingService";
import { coordinatePlanning, getPlanningCoordinatorDraft, listPlanningCoordinatorRuns, revisePlanningCoordinatorDraft } from "../services/planningCoordinatorService";

export type OrderStatus = "DRAFT" | "VALIDATION_REQUIRED" | "READY_TO_PLAN" | "REMOVED" | "ASSIGNED_TO_LOAD" | "TENDERED" | "CARRIER_ACCEPTED" | "TENDER_REJECTED" | "TENDER_EXPIRED" | "IN_TRANSIT" | "DELIVERED";
export type OrderRecord = Record<string, unknown> & { orderId: string; workspaceId: string; primaryReference: string; status: OrderStatus };

const localOrders = new Map<string, OrderRecord[]>();
const localProfiles = new Map<string, any[]>();
const localReviews = new Map<string, any[]>();
const localMeidCounters = new Map<string, number>();
const localCoordinatorValidations = new Map<string, any>();
const localCoordinatorApprovals = new Map<string, any>();
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

async function createAutomaticPlanningProposal(workspaceId: string, order: OrderRecord, actor: string, registry?: Awaited<ReturnType<typeof listLanePlanningRegistry>>) {
  const planningRegistry = registry ?? await listLanePlanningRegistry(workspaceId);
  const [previous, facilities] = await Promise.all([getLatestOrderPlanningProposal(workspaceId, order.orderId), listFacilitiesForWorkspace(workspaceId)]);
  const proposal = buildOrderPlanningProposal({
    workspaceId,
    order: effectivePlanningOrder(order),
    lanes: planningRegistry.lanes,
    eligibility: planningRegistry.eligibility,
    awards: planningRegistry.awards,
    partners: planningRegistry.partners,
    facilities,
    actor,
    supersedesProposalId: previous?.proposalId ?? null,
  });
  await saveOrderPlanningProposal(proposal);
  return proposal;
}

async function coordinateAutomaticProposals(workspaceId: string, proposals: OrderPlanningProposal[], actor: string) {
  if (!proposals.length) return null;
  let latest: Awaited<ReturnType<typeof coordinatePlanning>> | null = null;
  for (let index = 0; index < proposals.length; index += 100) {
    latest = await coordinatePlanning({ workspaceId, proposals: proposals.slice(index, index + 100), actor, safetyIdentifier: safetyIdentifierFor(actor) });
  }
  return latest;
}

function coordinatorValidationHash(value: unknown): string {
  const canonical = (child: unknown): string => child === null || typeof child !== "object" ? JSON.stringify(child) : Array.isArray(child) ? `[${child.map(canonical).join(",")}]` : `{${Object.entries(child as Record<string, unknown>).filter(([, nested]) => nested !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function effectivePlanningOrder(order: OrderRecord): OrderRecord {
  const overrides = order.planningOverrides && typeof order.planningOverrides === "object" ? order.planningOverrides as Record<string, unknown> : {};
  return { ...order, ...((overrides.values && typeof overrides.values === "object") ? overrides.values as Record<string, unknown> : {}), planningOverrideCodes: Array.isArray(overrides.codes) ? overrides.codes : [] } as OrderRecord;
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
  const timestamps = Object.fromEntries(["earliestPickup", "latestPickup", "earliestDelivery", "latestDelivery"].map((field) => {
    const value = clean(row[field]);
    const timestamp = value ? Date.parse(value) : null;
    if (value && !Number.isFinite(timestamp)) issues.push({ row: rowNumber, field, severity: "ERROR", code: "INVALID_DATETIME", message: `${field} must contain a valid date and time.` });
    return [field, Number.isFinite(timestamp) ? timestamp : null];
  })) as Record<string, number | null>;
  if (timestamps.earliestPickup != null && timestamps.latestPickup != null && timestamps.latestPickup < timestamps.earliestPickup) {
    issues.push({ row: rowNumber, field: "latestPickup", severity: "ERROR", code: "PICKUP_WINDOW_REVERSED", message: "Latest pickup cannot be earlier than earliest pickup." });
  }
  if (timestamps.earliestDelivery != null && timestamps.latestDelivery != null && timestamps.latestDelivery < timestamps.earliestDelivery) {
    issues.push({ row: rowNumber, field: "latestDelivery", severity: "ERROR", code: "DELIVERY_WINDOW_REVERSED", message: "Latest delivery cannot be earlier than earliest delivery." });
  }
  const pickupBoundary = timestamps.latestPickup ?? timestamps.earliestPickup;
  const deliveryBoundary = timestamps.earliestDelivery ?? timestamps.latestDelivery;
  if (pickupBoundary != null && deliveryBoundary != null && deliveryBoundary < pickupBoundary) {
    issues.push({ row: rowNumber, field: timestamps.earliestDelivery != null ? "earliestDelivery" : "latestDelivery", severity: "ERROR", code: "DELIVERY_BEFORE_PICKUP", message: "The delivery window cannot begin before the pickup window ends." });
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
  app.get("/api/orders/planning-coordinator/runs", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const runs = await listPlanningCoordinatorRuns(context.orgScope);
    res.json({ runs, latest: runs[0] ?? null });
  });

  app.post("/api/orders/planning-coordinator/run", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const requestedIds = Array.isArray(req.body?.orderIds) ? [...new Set(req.body.orderIds.map((value: unknown) => clean(value)).filter(Boolean))].slice(0, 50) : [];
    const orders = await list(context.orgScope, "orders", localOrders) as OrderRecord[];
    const ready = orders.filter((order) => order.status === "READY_TO_PLAN" && (!requestedIds.length || requestedIds.includes(order.orderId)));
    if (!ready.length) { res.status(400).json({ error: "Select at least one order that is ready to plan." }); return; }
    if (requestedIds.length && ready.length !== requestedIds.length) { res.status(409).json({ error: "Every selected order must still be ready to plan in this workspace." }); return; }
    try {
      const registry = await listLanePlanningRegistry(context.orgScope);
      const proposals: OrderPlanningProposal[] = [];
      for (const order of ready) proposals.push(await createAutomaticPlanningProposal(context.orgScope, order, context.uid, registry));
      const run = await coordinatePlanning({ workspaceId: context.orgScope, proposals: await Promise.all(proposals.map((proposal) => getLatestOrderPlanningProposal(context.orgScope, proposal.orderId) as Promise<OrderPlanningProposal>)), actor: context.uid, safetyIdentifier: safetyIdentifierFor(context.uid) });
      res.status(201).json({ run });
    } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "The Planning Coordinator could not prepare the workflow." }); }
  });

  app.get("/api/orders/planning-coordinator/drafts/:draftId", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const draft = await getPlanningCoordinatorDraft(context.orgScope, req.params.draftId);
    if (!draft) { res.status(404).json({ error: "Planning action draft not found." }); return; }
    res.json({ draft });
  });

  app.post("/api/orders/planning-coordinator/drafts/:draftId/revisions", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const draft = await getPlanningCoordinatorDraft(context.orgScope, req.params.draftId);
    if (!draft) { res.status(404).json({ error: "Planning action draft not found." }); return; }
    const latest = await getLatestOrderPlanningProposal(context.orgScope, draft.orderId);
    if (!latest || latest.proposalId !== draft.proposalId || latest.contentHash !== draft.proposalContentHash || latest.integrity !== "VERIFIED") { res.status(409).json({ error: "This action draft is no longer based on the current verified planning evidence." }); return; }
    try {
      const revised = await revisePlanningCoordinatorDraft({ workspaceId: context.orgScope, draft, actor: context.uid, selectedAction: req.body?.selectedAction, inputs: req.body?.inputs, rationale: req.body?.rationale });
      res.status(201).json({ draft: revised });
    } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "The planning action draft could not be revised." }); }
  });

  app.post("/api/orders/planning-coordinator/drafts/:draftId/validate", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const [draft, orders, registry, facilities, businessUnits] = await Promise.all([getPlanningCoordinatorDraft(context.orgScope, req.params.draftId), list(context.orgScope, "orders", localOrders) as Promise<OrderRecord[]>, listLanePlanningRegistry(context.orgScope), listFacilitiesForWorkspace(context.orgScope), listLaneBusinessUnits(context.orgScope)]);
    if (!draft) { res.status(404).json({ error: "Planning action draft not found." }); return; }
    const order = orders.find((item) => item.orderId === draft.orderId);
    if (!order || order.status !== "READY_TO_PLAN") { res.status(409).json({ error: "The source order is no longer ready to plan." }); return; }
    const proposedOrder = { ...order, ...draft.inputs, updatedAt: order.updatedAt } as OrderRecord;
    const inputIssues = validateOrder(proposedOrder, 1);
    const facilityIds = new Set(facilities.flatMap((facility: any) => [comparable(facility.facilityId), comparable(facility.siteId)].filter(Boolean)));
    if (!facilityIds.has(comparable(proposedOrder.originId))) inputIssues.push({ row: 1, field: "originId", severity: "ERROR", code: "FACILITY_NOT_FOUND", message: "The draft origin is not in this workspace's facility master." });
    if (!facilityIds.has(comparable(proposedOrder.destinationId))) inputIssues.push({ row: 1, field: "destinationId", severity: "ERROR", code: "FACILITY_NOT_FOUND", message: "The draft destination is not in this workspace's facility master." });
    if (!businessUnits.some((unit: any) => comparable(unit.name) === comparable(proposedOrder.businessUnit) || comparable(unit.id) === comparable(proposedOrder.businessUnit))) inputIssues.push({ row: 1, field: "businessUnit", severity: "ERROR", code: "BUSINESS_UNIT_NOT_FOUND", message: "The draft business unit is not configured for this workspace." });
    if (clean(proposedOrder.scac) && !registry.partners.some((partner: any) => comparable(partner.scac) === comparable(proposedOrder.scac))) inputIssues.push({ row: 1, field: "scac", severity: "ERROR", code: "SCAC_NOT_FOUND", message: "The draft SCAC is not a registered external partner." });
    const proposal = buildOrderPlanningProposal({ workspaceId: context.orgScope, order: effectivePlanningOrder(proposedOrder), lanes: registry.lanes, eligibility: registry.eligibility, awards: registry.awards, partners: registry.partners, facilities, actor: context.uid, supersedesProposalId: draft.proposalId });
    const route = proposal.routePlans.find((item) => item.routePlanId === proposal.recommendedRoutePlanId);
    const findings = [...(route?.findings ?? proposal.candidates[0]?.findings ?? []), ...inputIssues.map((issue) => ({ category: "ORDER", severity: issue.severity === "ERROR" ? "BLOCKER" as const : "WARNING" as const, code: issue.code || "ORDER_INPUT_REVIEW", message: issue.message }))];
    const changedFields = Object.keys(draft.inputs).filter((field) => JSON.stringify(order[field] ?? null) !== JSON.stringify(draft.inputs[field] ?? null));
    const before = Object.fromEntries(changedFields.map((field) => [field, order[field] ?? null]));
    const after = Object.fromEntries(changedFields.map((field) => [field, draft.inputs[field] ?? null]));
    const legs = route?.legs ?? [];
    const validationBase = { schemaVersion: "1.0", validationId: randomUUID(), workspaceId: context.orgScope, actionDraftId: draft.actionDraftId, actionDraftContentHash: draft.contentHash, orderId: order.orderId, sourceOrderUpdatedAt: clean(order.updatedAt), proposal, before, after, effects: { segmentCount: legs.length, plannedLoads: legs.map((leg) => ({ laneId: leg.candidate.laneId, laneName: leg.candidate.laneName, laneType: leg.candidate.laneType, carrier: leg.candidate.activeAwards[0]?.carrier ?? null, award: leg.candidate.activeAwards[0] ?? null, pickup: leg.plannedPickup, delivery: leg.plannedDelivery })), cargoAllocationCount: legs.length, custodyEventCount: legs.length * 2, blockerCount: findings.filter((item) => item.severity === "BLOCKER").length, warningCount: findings.filter((item) => item.severity === "WARNING").length }, status: draft.selectedAction === "HOLD" || findings.some((item) => item.severity === "BLOCKER") || !legs.length || legs.some((leg) => !leg.candidate.activeAwards.length) ? "BLOCKED" : "READY_FOR_APPROVAL", createdBy: context.uid, createdAt: new Date().toISOString() };
    const validation = { ...validationBase, contentHash: coordinatorValidationHash(validationBase) };
    if (isFirestorePrimaryEnabled()) await intakeCollection(context.orgScope, "planningCoordinatorValidations").doc(validation.validationId).create(JSON.parse(JSON.stringify(validation)));
    else localCoordinatorValidations.set(`${context.orgScope}:${validation.validationId}`, validation);
    res.status(201).json({ validation });
  });

  app.post("/api/orders/planning-coordinator/validations/:validationId/approve", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const validationRef = intakeCollection(context.orgScope, "planningCoordinatorValidations").doc(req.params.validationId);
    const validation: any = isFirestorePrimaryEnabled() ? (await validationRef.get()).data() : localCoordinatorValidations.get(`${context.orgScope}:${req.params.validationId}`);
    if (!validation || validation.workspaceId !== context.orgScope) { res.status(404).json({ error: "Validated planning draft not found." }); return; }
    if (validation.status !== "READY_FOR_APPROVAL" || validation.contentHash !== coordinatorValidationHash(Object.fromEntries(Object.entries(validation).filter(([key]) => key !== "contentHash")))) { res.status(409).json({ error: "Only an integrity-verified draft without blockers can be approved." }); return; }
    const priorApproval: any = isFirestorePrimaryEnabled() ? (await intakeCollection(context.orgScope, "planningCoordinatorApprovals").doc(validation.validationId).get()).data() : localCoordinatorApprovals.get(`${context.orgScope}:${validation.validationId}`);
    if (priorApproval) { res.status(200).json({ approval: priorApproval, idempotent: true }); return; }
    const draft = await getPlanningCoordinatorDraft(context.orgScope, validation.actionDraftId);
    if (!draft || draft.contentHash !== validation.actionDraftContentHash) { res.status(409).json({ error: "The validated draft is no longer current." }); return; }
    const proposal = validation.proposal as OrderPlanningProposal;
    const currentOrders = await list(context.orgScope, "orders", localOrders) as OrderRecord[];
    const currentOrder = currentOrders.find((item) => item.orderId === validation.orderId);
    if (!currentOrder || clean(currentOrder.updatedAt) !== validation.sourceOrderUpdatedAt) { res.status(409).json({ error: "The order changed after validation. Validate the draft again." }); return; }
    const proposedOrder = { ...currentOrder, ...draft.inputs } as OrderRecord;
    let records;
    try { records = buildPlanningDecisionRecords({ workspaceId: context.orgScope, order: proposedOrder, proposal, decision: "APPROVED", reason: clean(req.body?.reason, 1000) || "Approved coordinator action draft", actor: context.uid }); }
    catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "The validated draft cannot be approved." }); return; }
    const route = proposal.routePlans.find((item) => item.routePlanId === proposal.recommendedRoutePlanId)!;
    const now = records.decision.decidedAt;
    const journeyBase = { schemaVersion: "1.0", journeyId: randomUUID(), workspaceId: context.orgScope, orderIds: [currentOrder.orderId], status: "CONNECTED", segments: route.legs.map((leg, index) => ({ sequence: index + 1, orderId: currentOrder.orderId, orderMeid: clean(currentOrder.silTestMeid || currentOrder.meid), proposalId: proposal.proposalId, laneId: leg.candidate.laneId, laneName: leg.candidate.laneName, laneType: leg.candidate.laneType, originFacilityId: leg.candidate.laneSnapshot.originFacilityId, destinationFacilityId: leg.candidate.laneSnapshot.destinationFacilityId, plannedPickup: leg.plannedPickup, plannedDelivery: leg.plannedDelivery, disposition: leg.candidate.disposition })), findings: [{ severity: "INFO", code: "COORDINATOR_DRAFT_APPROVED", message: "The validated coordinator draft created this governed journey." }], createdBy: context.uid, createdAt: now };
    const journey = { ...journeyBase, contentHash: coordinatorValidationHash(journeyBase) };
    const allocations = records.loads.map((load, index) => ({ allocationId: randomUUID(), workspaceId: context.orgScope, orderId: currentOrder.orderId, loadId: load.loadId, journeyId: journey.journeyId, segmentSequence: index + 1, weight: proposedOrder.weight ?? null, weightUom: proposedOrder.weightUom ?? null, pallets: proposedOrder.palletQuantity ?? null, createdAt: now }));
    const custody = allocations.flatMap((allocation, index) => [{ custodyEventId: randomUUID(), workspaceId: context.orgScope, allocationId: allocation.allocationId, journeyId: journey.journeyId, loadId: allocation.loadId, orderId: currentOrder.orderId, sequence: index * 2 + 1, event: "SEGMENT_PICKUP", facilityId: route.legs[index].candidate.laneSnapshot.originFacilityId, expectedAt: route.legs[index].plannedPickup, status: "PLANNED", recordedAt: now }, { custodyEventId: randomUUID(), workspaceId: context.orgScope, allocationId: allocation.allocationId, journeyId: journey.journeyId, loadId: allocation.loadId, orderId: currentOrder.orderId, sequence: index * 2 + 2, event: index === route.legs.length - 1 ? "FINAL_DELIVERY" : "SEGMENT_HANDOFF", facilityId: route.legs[index].candidate.laneSnapshot.destinationFacilityId, expectedAt: route.legs[index].plannedDelivery, status: "PENDING", recordedAt: now }]);
    const approval = { schemaVersion: "1.0", approvalId: validation.validationId, workspaceId: context.orgScope, validationId: validation.validationId, actionDraftId: draft.actionDraftId, decisionId: records.decision.decisionId, journeyId: journey.journeyId, plannedLoadIds: records.loads.map((load) => load.loadId), allocationIds: allocations.map((item) => item.allocationId), custodyEventIds: custody.map((item) => item.custodyEventId), approvedBy: context.uid, approvedAt: now };
    const revision = { schemaVersion: "1.0", revisionId: randomUUID(), workspaceId: context.orgScope, orderId: currentOrder.orderId, changedFields: Object.keys(validation.after), before: validation.before, after: validation.after, reason: clean(req.body?.reason, 1000) || "Approved coordinator action draft", source: "PLANNING_COORDINATOR", actionDraftId: draft.actionDraftId, validationId: validation.validationId, createdBy: context.uid, createdAt: now };
    const updatedOrder = { ...proposedOrder, status: "ASSIGNED_TO_LOAD", plannedLoadId: records.load!.loadId, plannedLoadIds: records.loads.map((load) => load.loadId), journeyId: journey.journeyId, updatedAt: now };
    if (isFirestorePrimaryEnabled()) {
      const db = validationRef.firestore;
      await db.runTransaction(async (transaction) => {
        const [existingApproval, orderSnapshot] = await Promise.all([transaction.get(intakeCollection(context.orgScope, "planningCoordinatorApprovals").doc(validation.validationId)), transaction.get(intakeCollection(context.orgScope, "orders").doc(currentOrder.orderId))]);
        if (existingApproval.exists) return;
        if (!orderSnapshot.exists || clean(orderSnapshot.data()?.updatedAt) !== validation.sourceOrderUpdatedAt) throw new Error("The order changed after validation.");
        transaction.create(intakeCollection(context.orgScope, "planningCoordinatorApprovals").doc(validation.validationId), approval);
        transaction.create(intakeCollection(context.orgScope, "orderRevisions").doc(revision.revisionId), { ...revision, contentHash: coordinatorValidationHash(revision) });
        transaction.create(intakeCollection(context.orgScope, "orderPlanningProposals").doc(proposal.proposalId), proposal);
        transaction.create(intakeCollection(context.orgScope, "orderPlanningDecisions").doc(proposal.proposalId), records.decision);
        transaction.create(intakeCollection(context.orgScope, "shipmentJourneys").doc(journey.journeyId), journey);
        records.loads.forEach((load) => transaction.create(intakeCollection(context.orgScope, "plannedLoads").doc(load.loadId), load));
        allocations.forEach((item) => transaction.create(intakeCollection(context.orgScope, "cargoAllocations").doc(item.allocationId), item));
        custody.forEach((item) => transaction.create(intakeCollection(context.orgScope, "cargoCustodyEvents").doc(item.custodyEventId), item));
        transaction.set(intakeCollection(context.orgScope, "orders").doc(currentOrder.orderId), updatedOrder);
      });
    } else {
      if (!localCoordinatorApprovals.has(`${context.orgScope}:${validation.validationId}`)) { localCoordinatorApprovals.set(`${context.orgScope}:${validation.validationId}`, approval); registerLocalPlannedLoads(records.loads); await saveOrderPlanningProposal(proposal); await saveShipmentJourney(journey as any); await save(context.orgScope, "orders", currentOrder.orderId, updatedOrder, localOrders); }
    }
    res.status(201).json({ approval, journey, loads: records.loads, allocations, custody, order: updatedOrder });
  });

  app.get("/api/orders/cargo-nesting-proposals", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const proposals = await listCargoNestingProposals(context.orgScope);
    res.json({ proposals, latest: proposals[0] ?? null });
  });

  app.post("/api/orders/cargo-nesting-proposals", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const parentOrderId = clean(req.body?.parentOrderId);
    const allocations = Array.isArray(req.body?.allocations) ? req.body.allocations.slice(0, 100) as CargoAllocationInput[] : [];
    if (!parentOrderId || !allocations.length) { res.status(400).json({ error: "Select one parent Linehaul order and at least one downstream cargo order." }); return; }
    const [orders, registry] = await Promise.all([list(context.orgScope, "orders", localOrders) as Promise<OrderRecord[]>, listLanePlanningRegistry(context.orgScope)]);
    const parent = orders.find((order) => order.orderId === parentOrderId && order.status === "READY_TO_PLAN");
    if (!parent) { res.status(404).json({ error: "The selected parent Linehaul order is not available for planning." }); return; }
    const childIds = new Set(allocations.map((item) => clean(item.orderId)));
    if (childIds.size !== allocations.length) { res.status(400).json({ error: "Each downstream order can appear only once in a cargo nesting proposal." }); return; }
    if (childIds.has(parentOrderId)) { res.status(400).json({ error: "The parent Linehaul order cannot also be nested as child cargo." }); return; }
    const children = orders.filter((order) => childIds.has(order.orderId) && order.status === "READY_TO_PLAN");
    if (children.length !== childIds.size) { res.status(404).json({ error: "One or more selected cargo orders are unavailable in this workspace." }); return; }
    try {
      const proposal = buildCargoNestingProposal({ workspaceId: context.orgScope, parent, children, allocations, lanes: registry.lanes, awards: registry.awards, actor: context.uid, filters: Array.isArray(req.body?.filters) ? req.body.filters.map(String).slice(0,20) : [], visibleFields: Array.isArray(req.body?.visibleFields) ? req.body.visibleFields.map(String).slice(0,20) : [] });
      await saveCargoNestingProposal(proposal);
      res.status(201).json({ proposal });
    } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "Cargo nesting could not be prepared." }); }
  });

  app.post("/api/orders/cargo-nesting-proposals/:proposalId/approve", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const proposals = await listCargoNestingProposals(context.orgScope);
    const proposal = proposals.find((item) => item.cargoNestingId === req.params.proposalId);
    if (!proposal) { res.status(404).json({ error: "Cargo nesting proposal not found." }); return; }
    if (proposal.findings.some((finding) => finding.severity === "BLOCKER")) { res.status(409).json({ error: "Resolve every cargo nesting blocker before execution release." }); return; }
    const existing = isFirestorePrimaryEnabled() ? await intakeCollection(context.orgScope, "cargoNestingDecisions").doc(proposal.cargoNestingId).get() : null;
    if (existing?.exists) { res.status(200).json({ decision: existing.data(), loads: [] }); return; }
    const [registry, currentOrders] = await Promise.all([
      listLanePlanningRegistry(context.orgScope),
      list(context.orgScope, "orders", localOrders) as Promise<OrderRecord[]>,
    ]);
    const currentById = new Map(currentOrders.map((order) => [order.orderId, order]));
    const parentSnapshot = proposal.parentOrder as OrderRecord;
    const currentParent = currentById.get(parentSnapshot.orderId);
    const childrenCurrent = proposal.allocations.every((allocation) => {
      const order = currentById.get(allocation.orderId);
      return Boolean(order && order.status === "READY_TO_PLAN" && clean(order.updatedAt) === allocation.sourceOrderUpdatedAt);
    });
    if (!currentParent || currentParent.status !== "READY_TO_PLAN" || clean(currentParent.updatedAt) !== clean(parentSnapshot.updatedAt) || !childrenCurrent) {
      res.status(409).json({ error: "One or more source orders changed after this proposal was built. Build a new cargo nesting proposal." }); return;
    }
    const now = new Date().toISOString();
    const parentLoadId = randomUUID();
    const childLoadIds = proposal.allocations.map(() => randomUUID());
    const awardFor = (laneId: string) => registry.awards.find((award) => award.laneId === laneId && award.status === "ACTIVE");
    const partnerFor = (externalPartnerId: string) => registry.partners.find((partner: any) => (partner.id || partner.externalPartnerId) === externalPartnerId) as any;
    const buildCarrier = (laneId: string) => { const award = awardFor(laneId); const partner = award ? partnerFor(award.externalPartnerId) : undefined; return { award, carrier: award ? { externalPartnerId: award.externalPartnerId, name: clean(partner?.name || partner?.organizationName) || "Registered carrier", scac: clean(partner?.scac) || undefined } : null }; };
    const currentParentLane = registry.lanes.find((lane) => lane.laneId === proposal.parentLane.laneId && lane.status === "ACTIVE");
    const currentFinalMileLanes = proposal.allocations.map((allocation) => registry.lanes.find((lane) => lane.laneId === allocation.finalMileLaneId && lane.status === "ACTIVE"));
    if (!currentParentLane || currentFinalMileLanes.some((lane) => !lane)) { res.status(409).json({ error: "One or more route segments are no longer active. Build a new cargo nesting proposal." }); return; }
    const parentCarrier = buildCarrier(proposal.parentLane.laneId);
    if (!parentCarrier.award || !parentCarrier.carrier || proposal.allocations.some((allocation) => !awardFor(allocation.finalMileLaneId))) { res.status(409).json({ error: "Every nested segment requires an active carrier award before execution release." }); return; }
    const parent = proposal.parentOrder as OrderRecord;
    const loads: any[] = [{ schemaVersion: "1.0", loadId: parentLoadId, displayId: `SIL-${parentLoadId.replace(/-/g, "").slice(0,10).toUpperCase()}`, workspaceId: context.orgScope, status: "PLANNED", sourceProposalId: proposal.cargoNestingId, sourceProposalContentHash: proposal.contentHash, planningDecisionId: proposal.cargoNestingId, orderIds: [parent.orderId, ...proposal.allocations.map((item) => item.orderId)], orderMeids: [clean(parent.silTestMeid || parent.meid), ...proposal.allocations.map((item) => item.orderMeid)].filter(Boolean), laneId: proposal.parentLane.laneId, laneName: proposal.parentLane.name, laneType: "LINEHAUL", originFacilityId: proposal.parentLane.originFacilityId, destinationFacilityId: proposal.parentLane.destinationFacilityId, businessUnitName: clean(parent.businessUnit), equipmentType: proposal.parentLane.equipmentType, loadAssumption: "TL", carrier: parentCarrier.carrier, award: parentCarrier.award, plannedPickup: proposal.parentLane.plannedPickup, plannedDelivery: proposal.parentLane.plannedDelivery, cargoNestingId: proposal.cargoNestingId, createdBy: context.uid, createdAt: now }];
    proposal.allocations.forEach((allocation, index) => { const lane = currentFinalMileLanes[index]!; const segment = buildCarrier(lane.laneId); loads.push({ schemaVersion: "1.0", loadId: childLoadIds[index], displayId: `SIL-${childLoadIds[index].replace(/-/g, "").slice(0,10).toUpperCase()}`, workspaceId: context.orgScope, status: "PLANNED", sourceProposalId: proposal.cargoNestingId, sourceProposalContentHash: proposal.contentHash, planningDecisionId: proposal.cargoNestingId, orderIds: [allocation.orderId], orderMeids: [allocation.orderMeid].filter(Boolean), laneId: lane.laneId, laneName: lane.name, laneType: "FINAL_MILE", originFacilityId: lane.originFacilityId, destinationFacilityId: lane.destinationFacilityId, businessUnitName: clean(parent.businessUnit), equipmentType: lane.equipmentType, loadAssumption: lane.loadAssumption, carrier: segment.carrier, award: segment.award, plannedPickup: allocation.plannedPickup, plannedDelivery: allocation.plannedDelivery, parentLoadId, cargoAllocationId: allocation.allocationId, createdBy: context.uid, createdAt: now }); });
    const decisionEvidence = { schemaVersion: "1.0", decisionId: randomUUID(), workspaceId: context.orgScope, cargoNestingId: proposal.cargoNestingId, proposalContentHash: proposal.contentHash, decision: "APPROVED", parentLoadId, childLoadIds, decidedBy: context.uid, decidedAt: now };
    const decision = { ...decisionEvidence, contentHash: createHash("sha256").update(JSON.stringify(decisionEvidence)).digest("hex") };
    if (isFirestorePrimaryEnabled()) {
      const db = intakeCollection(context.orgScope, "plannedLoads").doc().firestore; const batch = db.batch();
      batch.create(intakeCollection(context.orgScope, "cargoNestingDecisions").doc(proposal.cargoNestingId), decision);
      loads.forEach((load) => batch.create(intakeCollection(context.orgScope, "plannedLoads").doc(load.loadId), JSON.parse(JSON.stringify(load))));
      proposal.allocations.forEach((allocation, index) => { batch.create(intakeCollection(context.orgScope, "cargoAllocations").doc(allocation.allocationId), { ...allocation, workspaceId: context.orgScope, cargoNestingId: proposal.cargoNestingId, parentLoadId, childLoadId: childLoadIds[index], createdAt: now }); allocation.custody.forEach((event) => batch.create(intakeCollection(context.orgScope, "cargoCustodyEvents").doc(`${allocation.allocationId}-${event.sequence}`), { ...event, workspaceId: context.orgScope, cargoNestingId: proposal.cargoNestingId, allocationId: allocation.allocationId, parentLoadId, childLoadId: childLoadIds[index], recordedAt: now })); });
      const orderIds = [parent.orderId, ...proposal.allocations.map((item) => item.orderId)]; orderIds.forEach((orderId) => batch.update(intakeCollection(context.orgScope, "orders").doc(orderId), { status: "ASSIGNED_TO_LOAD", cargoNestingId: proposal.cargoNestingId, parentLoadId, updatedAt: now }));
      await batch.commit();
    } else registerLocalPlannedLoads(loads);
    res.status(201).json({ decision, loads });
  });

  app.get("/api/orders/consolidation-proposals", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const proposals = await listOrderConsolidationProposals(context.orgScope);
    res.json({ proposals, latest: proposals[0] ?? null });
  });

  app.post("/api/orders/consolidation-proposals", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const [orders, planning] = await Promise.all([list(context.orgScope, "orders", localOrders), listLatestOrderPlanningProposals(context.orgScope)]);
    const proposal = buildOrderConsolidationProposal({ workspaceId: context.orgScope, orders, proposals: planning, actor: context.uid });
    await saveOrderConsolidationProposal(proposal);
    res.status(201).json({ proposal: verifyOrderConsolidationProposal(proposal) });
  });

  app.post("/api/orders/consolidation-proposals/:proposalId/decisions", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const decisionType = clean(req.body?.decision).toUpperCase() as "APPROVED" | "REJECTED";
    if (!(["APPROVED", "REJECTED"] as string[]).includes(decisionType)) { res.status(400).json({ error: "Decision must be APPROVED or REJECTED." }); return; }
    const proposals = await listOrderConsolidationProposals(context.orgScope);
    const proposal = proposals.find((item) => item.consolidationProposalId === req.params.proposalId);
    if (!proposal) { res.status(404).json({ error: "Consolidation proposal not found." }); return; }
    if (proposals[0]?.consolidationProposalId !== proposal.consolidationProposalId) { res.status(409).json({ error: "Only the latest consolidation proposal can be decided." }); return; }
    const existing = await getOrderConsolidationDecision(context.orgScope, proposal.consolidationProposalId);
    if (existing) {
      if (existing.decision !== decisionType) { res.status(409).json({ error: "This consolidation proposal already has a different decision." }); return; }
      res.json({ decision: existing, loads: [], idempotent: true }); return;
    }
    const orders = await list(context.orgScope, "orders", localOrders) as OrderRecord[];
    const includedOrderIds = new Set(proposal.groups.flatMap((group) => group.orderIds));
    const includedOrders = orders.filter((order) => includedOrderIds.has(order.orderId));
    if (includedOrders.length !== includedOrderIds.size || includedOrders.some((order) => order.status !== "READY_TO_PLAN")) { res.status(409).json({ error: "Every included order must still be ready to plan." }); return; }
    const latestPlanning = await listLatestOrderPlanningProposals(context.orgScope);
    const evidenceCurrent = proposal.groups.every((group) => group.orderIds.every((orderId, index) => {
      const current = latestPlanning.get(orderId);
      return Boolean(current && current.proposalId === group.sourceProposalIds[index] && current.contentHash === group.sourceProposalHashes[index] && current.integrity === "VERIFIED");
    }));
    if (!evidenceCurrent) { res.status(409).json({ error: "One or more orders have newer or invalid planning evidence. Build a new consolidation proposal." }); return; }
    try {
      const records = buildOrderConsolidationDecision({ proposal, decision: decisionType, reason: clean(req.body?.reason, 1000), actor: context.uid });
      if (!isFirestorePrimaryEnabled()) {
        registerLocalOrderConsolidationDecision(records.decision);
        registerLocalPlannedLoads(records.loads);
        for (const order of decisionType === "APPROVED" ? includedOrders : []) {
          const plannedLoadIds = records.loads.filter((load) => load.orderIds.includes(order.orderId)).map((load) => load.loadId);
          await save(context.orgScope, "orders", order.orderId, { ...order, status: "ASSIGNED_TO_LOAD", plannedLoadId: plannedLoadIds[0], plannedLoadIds, consolidationDecisionId: records.decision.decisionId, updatedAt: records.decision.decidedAt }, localOrders);
        }
      } else {
        const decisionRef = intakeCollection(context.orgScope, "orderConsolidationDecisions").doc(proposal.consolidationProposalId);
        await decisionRef.firestore.runTransaction(async (transaction) => {
          const orderRefs = includedOrders.map((order) => intakeCollection(context.orgScope, "orders").doc(order.orderId));
          const snapshots = await Promise.all([transaction.get(decisionRef), ...orderRefs.map((ref) => transaction.get(ref))]);
          if (snapshots[0].exists) throw new Error("This consolidation proposal has already been decided.");
          if (snapshots.slice(1).some((snapshot) => !snapshot.exists || snapshot.data()?.status !== "READY_TO_PLAN")) throw new Error("Every included order must still be ready to plan.");
          transaction.create(decisionRef, records.decision);
          records.loads.forEach((load) => transaction.create(intakeCollection(context.orgScope, "plannedLoads").doc(load.loadId), load));
          if (decisionType === "APPROVED") includedOrders.forEach((order, index) => {
            const plannedLoadIds = records.loads.filter((load) => load.orderIds.includes(order.orderId)).map((load) => load.loadId);
            transaction.update(orderRefs[index], { status: "ASSIGNED_TO_LOAD", plannedLoadId: plannedLoadIds[0], plannedLoadIds, consolidationDecisionId: records.decision.decisionId, updatedAt: records.decision.decidedAt });
          });
        });
      }
      res.status(201).json({ ...records, idempotent: false });
    } catch (error) {
      res.status(422).json({ error: error instanceof Error ? error.message : "The consolidation decision could not be recorded." });
    }
  });

  app.post("/api/orders/consolidation-proposals/:proposalId/assistant", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const proposals = await listOrderConsolidationProposals(context.orgScope);
    const proposal = proposals.find((item) => item.consolidationProposalId === req.params.proposalId);
    if (!proposal) { res.status(404).json({ error: "Consolidation proposal not found." }); return; }
    if (proposal.integrity !== "VERIFIED") { res.status(409).json({ error: "Verified consolidation evidence is required before assistant review." }); return; }
    try {
      const turn = await runConsolidationAssistant({ proposal, message: clean(req.body?.message, 4000), actor: context.uid, safetyIdentifier: safetyIdentifierFor(context.uid) });
      res.status(201).json({ turn });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "The consolidation assistant could not review this plan." });
    }
  });

  app.get("/api/orders", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const [orders, planning] = await Promise.all([
      list(context.orgScope, "orders", localOrders),
      listLatestOrderPlanningProposals(context.orgScope),
    ]);
    res.json({ orders: orders.filter((order) => order.status !== "REMOVED").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((order) => {
      const proposal = planning.get(order.orderId);
      return { ...order, planningSummary: proposal ? {
        proposalId: proposal.proposalId,
        outcome: proposal.outcome,
        integrity: proposal.integrity,
        blockerCount: proposal.recommendation?.blockerCount ?? (proposal.outcome === "NO_MATCH" ? 1 : 0),
        warningCount: proposal.recommendation?.warningCount ?? 0,
        createdAt: proposal.createdAt,
      } : null };
    }) });
  });

  app.delete("/api/orders", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const orderIds = [...new Set<string>((Array.isArray(req.body?.orderIds) ? req.body.orderIds : [])
      .map((value: unknown) => clean(value, 100)).filter(Boolean))];
    if (!orderIds.length || orderIds.length > 100) {
      res.status(400).json({ error: "Select between 1 and 100 orders to remove." });
      return;
    }

    const orders = await list(context.orgScope, "orders", localOrders) as OrderRecord[];
    const selected = orderIds.map((orderId) => orders.find((order) => order.orderId === orderId));
    if (selected.some((order) => !order)) {
      res.status(404).json({ error: "One or more selected orders were not found in this workspace." });
      return;
    }
    const removableStatuses = new Set<OrderStatus>(["DRAFT", "VALIDATION_REQUIRED", "READY_TO_PLAN"]);
    const protectedOrders = (selected as OrderRecord[]).filter((order) => !removableStatuses.has(order.status));
    if (protectedOrders.length) {
      res.status(409).json({ error: "Planned, tendered, or executed orders cannot be removed from the planning queue." });
      return;
    }

    const removedAt = new Date().toISOString();
    const reason = clean(req.body?.reason, 500) || "Removed from planning queue by user";
    const removalBase = {
      schemaVersion: "1.0",
      removalId: randomUUID(),
      workspaceId: context.orgScope,
      orderIds,
      priorStatuses: Object.fromEntries((selected as OrderRecord[]).map((order) => [order.orderId, order.status])),
      reason,
      removedBy: context.uid,
      removedAt,
    };
    const removal = { ...removalBase, contentHash: createHash("sha256").update(JSON.stringify(removalBase)).digest("hex") };
    const removedOrders = (selected as OrderRecord[]).map((order) => ({
      ...order,
      status: "REMOVED" as const,
      removedAt,
      removedBy: context.uid,
      removalId: removal.removalId,
      updatedAt: removedAt,
    }));

    if (isFirestorePrimaryEnabled()) {
      const ordersCollection = intakeCollection(context.orgScope, "orders");
      const batch = ordersCollection.firestore.batch();
      removedOrders.forEach((order) => batch.set(ordersCollection.doc(order.orderId), order));
      batch.create(intakeCollection(context.orgScope, "orderRemovalRecords").doc(removal.removalId), removal);
      await batch.commit();
    } else {
      for (const order of removedOrders) await save(context.orgScope, "orders", order.orderId, order, localOrders);
    }

    res.json({ removedCount: removedOrders.length, orderIds, removal });
  });

  app.post("/api/orders/journeys", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const orderIds: string[] = [...new Set<string>((Array.isArray(req.body?.orderIds) ? req.body.orderIds : []).map((value: unknown) => clean(value)).filter(Boolean))];
    if (orderIds.length < 2) { res.status(400).json({ error: "Select at least two matched orders to build a shipment journey." }); return; }
    const orders = await list(context.orgScope, "orders", localOrders);
    if (orderIds.some((orderId) => !orders.some((order) => order.orderId === orderId))) { res.status(404).json({ error: "One or more selected orders were not found in this workspace." }); return; }
    const proposals = (await Promise.all(orderIds.map((orderId) => getLatestOrderPlanningProposal(context.orgScope, orderId)))).filter(Boolean) as OrderPlanningProposal[];
    if (proposals.length !== orderIds.length) { res.status(409).json({ error: "Every selected order must be matched before building a route chain." }); return; }
    try {
      const journey = buildShipmentJourney({ workspaceId: context.orgScope, proposals, actor: context.uid });
      await saveShipmentJourney(journey);
      res.status(201).json({ journey: { ...journey, integrity: "VERIFIED" } });
    } catch (error) { res.status(422).json({ error: error instanceof Error ? error.message : "The shipment journey could not be built." }); }
  });

  app.get("/api/orders/:orderId/journey", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const journeys = await listShipmentJourneys(context.orgScope, req.params.orderId);
    if (!journeys.length) { res.status(404).json({ error: "No shipment journey includes this order." }); return; }
    res.json({ journey: journeys[0], historyCount: journeys.length });
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
    if (issues.some((issue) => issue.severity === "ERROR")) {
      res.status(422).json({ error: issues[0].message, issues, corrections: facilityReview.corrections });
      return;
    }
    const now = new Date().toISOString();
    const [silTestMeid] = await reserveSilTestMeids(context.orgScope, 1);
    const order: OrderRecord = { ...canonical, externalMeid: clean(canonical.meid) || null, meid: silTestMeid, silTestMeid, identifierType: "SIL_TEST_MEID", identifierSource: "SIL", environment: "TEST", orderId: randomUUID(), workspaceId: context.orgScope, primaryReference: clean(canonical.primaryReference), status: issues.some((i) => i.severity === "ERROR") ? "VALIDATION_REQUIRED" : "READY_TO_PLAN", issues, corrections: facilityReview.corrections, source: "MANUAL", createdBy: context.uid, createdAt: now, updatedAt: now } as OrderRecord;
    await save(context.orgScope, "orders", order.orderId, order, localOrders);
    const proposal = await createAutomaticPlanningProposal(context.orgScope, order, context.uid);
    const coordinatorRun = await coordinateAutomaticProposals(context.orgScope, [proposal], context.uid);
    res.status(201).json({ order, proposal, coordinatorRun });
  });

  app.patch("/api/orders/:orderId", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const orders = await list(context.orgScope, "orders", localOrders);
    const order = orders.find((item) => item.orderId === req.params.orderId);
    if (!order) { res.status(404).json({ error: "Order not found." }); return; }
    if (order.status !== "READY_TO_PLAN") { res.status(409).json({ error: "Only an order that is ready to plan can be corrected." }); return; }
    const editableFields = ["originId", "destinationId", "businessUnit", "earliestPickup", "latestDelivery", "eachQuantity", "caseQuantity", "palletQuantity", "weight", "weightUom", "equipmentType", "scac", "modeType", "orderType"] as const;
    const changes = Object.fromEntries(editableFields.filter((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field)).map((field) => [field, req.body[field]]));
    const canonical = canonicalizeOrder({ ...order, ...changes }, Object.fromEntries(fields.map((field) => [field, field])));
    const facilityReview = await resolveFacilities(context.orgScope, [canonical]);
    const issues = [...validateOrder(canonical, 1), ...facilityReview.issues];
    const businessUnits = await listLaneBusinessUnits(context.orgScope);
    if (!businessUnits.some((unit: any) => comparable(unit.name) === comparable(canonical.businessUnit) || comparable(unit.id) === comparable(canonical.businessUnit))) issues.push({ row: 1, field: "businessUnit", severity: "ERROR", code: "BUSINESS_UNIT_NOT_FOUND", message: "Select a configured organization business unit." });
    if (clean(canonical.scac)) {
      const partners = await listLanePartners(context.orgScope);
      if (!partners.some((partner: any) => comparable(partner.scac) === comparable(canonical.scac))) issues.push({ row: 1, field: "scac", severity: "ERROR", code: "SCAC_NOT_FOUND", message: "Select the SCAC of a registered external partner." });
    }
    if (issues.some((issue) => issue.severity === "ERROR")) { res.status(422).json({ error: issues[0].message, issues, corrections: facilityReview.corrections }); return; }
    const now = new Date().toISOString();
    const existingOverrides = order.planningOverrides && typeof order.planningOverrides === "object" ? order.planningOverrides as Record<string, any> : {};
    const overrideValues = { ...(existingOverrides.values ?? {}) };
    for (const field of Object.keys(changes)) delete overrideValues[field];
    const updated: OrderRecord = { ...order, ...canonical, planningOverrides: { ...existingOverrides, values: overrideValues, codes: Object.keys(changes).some((field) => ["latestDelivery", "earliestPickup"].includes(field)) ? [] : (existingOverrides.codes ?? []) }, issues, corrections: facilityReview.corrections, updatedAt: now } as OrderRecord;
    const changedFields = editableFields.filter((field) => JSON.stringify(order[field] ?? null) !== JSON.stringify(updated[field] ?? null));
    if (!changedFields.length) { res.status(200).json({ order, proposal: await getLatestOrderPlanningProposal(context.orgScope, order.orderId), revision: null }); return; }
    const revisionBase = { schemaVersion: "1.0", revisionId: randomUUID(), workspaceId: context.orgScope, orderId: order.orderId, changedFields, before: Object.fromEntries(changedFields.map((field) => [field, order[field] ?? null])), after: Object.fromEntries(changedFields.map((field) => [field, updated[field] ?? null])), reason: clean(req.body?.reason, 1000) || "Planner correction", createdBy: context.uid, createdAt: now };
    const revision = { ...revisionBase, contentHash: createHash("sha256").update(JSON.stringify(revisionBase)).digest("hex") };
    await save(context.orgScope, "orders", order.orderId, updated, localOrders);
    if (isFirestorePrimaryEnabled()) await intakeCollection(context.orgScope, "orderRevisions").doc(revision.revisionId).create(revision);
    const proposal = await createAutomaticPlanningProposal(context.orgScope, updated, context.uid);
    const coordinatorRun = await coordinateAutomaticProposals(context.orgScope, [proposal], context.uid);
    res.status(200).json({ order: updated, proposal, revision, coordinatorRun });
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
    const facilities = await listFacilitiesForWorkspace(context.orgScope);
    const proposal = buildOrderPlanningProposal({
      workspaceId: context.orgScope,
      order: effectivePlanningOrder(order),
      lanes: registry.lanes,
      eligibility: registry.eligibility,
      awards: registry.awards,
      partners: registry.partners,
      facilities,
      actor: context.uid,
      supersedesProposalId: previous?.proposalId ?? null,
    });
    await saveOrderPlanningProposal(proposal);
    res.status(201).json({ proposal: await getLatestOrderPlanningProposal(context.orgScope, order.orderId) });
  });

  app.get("/api/orders/:orderId/planning-resolution", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const proposal = await getLatestOrderPlanningProposal(context.orgScope, req.params.orderId);
    if (!proposal) { res.status(404).json({ error: "Run lane matching before requesting planning assistance." }); return; }
    const proposalDecision = (await listOrderPlanningDecisions(context.orgScope, req.params.orderId)).find((item) => item.proposalId === proposal.proposalId);
    if (proposalDecision) { res.status(409).json({ error: `This planning proposal was already ${proposalDecision.decision.toLowerCase()}. Run lane matching again to create a new proposal before requesting assistance.` }); return; }
    if (proposal.integrity !== "VERIFIED") { res.status(409).json({ error: "Planning evidence integrity must be verified before assistance can prepare a correction." }); return; }
    res.json(buildPlanningResolutionAnalysis(proposal));
  });

  app.post("/api/orders/:orderId/planning-resolution/drafts", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const proposal = await getLatestOrderPlanningProposal(context.orgScope, req.params.orderId);
    if (!proposal || proposal.integrity !== "VERIFIED") { res.status(409).json({ error: "Verified current planning evidence is required." }); return; }
    const proposalDecision = (await listOrderPlanningDecisions(context.orgScope, req.params.orderId)).find((item) => item.proposalId === proposal.proposalId);
    if (proposalDecision) { res.status(409).json({ error: `This planning proposal was already ${proposalDecision.decision.toLowerCase()}. Run lane matching again before preparing a correction.` }); return; }
    const analysis = buildPlanningResolutionAnalysis(proposal);
    const option = analysis.options.find((item) => item.optionId === clean(req.body?.optionId));
    if (!option) { res.status(400).json({ error: "Select a resolution produced from the current proposal." }); return; }
    const draft = await createPlanningResolutionDraft({ workspaceId: context.orgScope, actor: context.uid, proposal, option });
    res.status(201).json({ draft });
  });

  app.post("/api/orders/:orderId/planning-resolution/drafts/:draftId/decision", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const decision = clean(req.body?.decision).toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) { res.status(400).json({ error: "Decision must be APPROVED or REJECTED." }); return; }
    const [draft, latest, orders, proposalDecisions] = await Promise.all([getPlanningResolutionDraft(context.orgScope, req.params.draftId), getLatestOrderPlanningProposal(context.orgScope, req.params.orderId), list(context.orgScope, "orders", localOrders), listOrderPlanningDecisions(context.orgScope, req.params.orderId)]);
    if (!draft || draft.orderId !== req.params.orderId) { res.status(404).json({ error: "Resolution draft not found." }); return; }
    if (draft.integrity !== "VERIFIED" || !latest || latest.proposalId !== draft.proposalId || latest.contentHash !== draft.proposalContentHash) { res.status(409).json({ error: "This draft is not based on the current verified planning proposal." }); return; }
    const proposalDecision = proposalDecisions.find((item) => item.proposalId === draft.proposalId);
    if (proposalDecision) { res.status(409).json({ error: `This planning proposal was already ${proposalDecision.decision.toLowerCase()}. Its resolution drafts are closed.` }); return; }
    if (decision === 'REJECTED') {
      const record = await recordPlanningResolutionDecision({ workspaceId: context.orgScope, draftId: draft.draftId, decision: 'REJECTED', reason: clean(req.body?.reason, 1000), actor: context.uid });
      res.status(201).json({ decision: record, order: null, proposal: null }); return;
    }
    if (!draft.option.executable) { res.status(409).json({ error: "This option requires an additional workflow and cannot be executed automatically yet." }); return; }
    const order = orders.find((item) => item.orderId === req.params.orderId);
    if (!order || order.status !== "READY_TO_PLAN") { res.status(409).json({ error: "Only an order that is ready to plan can be corrected." }); return; }
    const now = new Date().toISOString();
    const currentOverrides = order.planningOverrides && typeof order.planningOverrides === "object" ? order.planningOverrides as Record<string, any> : {};
    const values = { ...(currentOverrides.values ?? {}) };
    const codes = [...new Set(Array.isArray(currentOverrides.codes) ? currentOverrides.codes.map(String) : [])];
    let overrideField = "";
    let overrideValue: unknown;
    if (draft.option.actionType === "CHANGE_ORDER_EQUIPMENT") { overrideField = "equipmentType"; overrideValue = clean(draft.option.parameters.equipmentType); values.equipmentType = overrideValue; }
    else if (draft.option.actionType === "CHANGE_ORDER_DELIVERY") { overrideField = "latestDelivery"; overrideValue = clean(draft.option.parameters.latestDelivery); values.latestDelivery = overrideValue; }
    else if (draft.option.actionType === "ALLOW_ORDER_DELIVERY_DAY") { overrideField = "deliverySchedule"; overrideValue = clean(draft.option.parameters.requestedDay); codes.push(`DELIVERY_DAY_MISMATCH:${clean(draft.option.parameters.laneId)}`); }
    else if (draft.option.actionType === "APPLY_CORRECTION_SET") {
      const changes = Array.isArray(draft.option.parameters.changes) ? draft.option.parameters.changes as Array<Record<string, unknown>> : [];
      const unresolved = Array.isArray(draft.option.parameters.unresolved) ? draft.option.parameters.unresolved : [];
      if (!changes.length || unresolved.length) { res.status(409).json({ error: "This correction package still requires planner input and cannot be applied automatically." }); return; }
      overrideField = "correctionSet";
      overrideValue = changes.map((change) => clean(change.label)).filter(Boolean);
      for (const change of changes) {
        if (change.kind === "ORDER_FIELD") {
          const field = clean(change.field);
          if (!["modeType", "equipmentType", "latestDelivery"].includes(field)) { res.status(409).json({ error: "The correction package contains an unsupported order field." }); return; }
          values[field] = change.value;
        } else if (change.kind === "SCHEDULE_EXCEPTION") {
          const findingCode = clean(change.findingCode);
          const laneId = clean(change.laneId);
          if (!["PICKUP_DAY_MISMATCH", "DELIVERY_DAY_MISMATCH"].includes(findingCode) || !laneId) { res.status(409).json({ error: "The correction package contains an invalid schedule exception." }); return; }
          codes.push(`${findingCode}:${laneId}`);
        } else { res.status(409).json({ error: "The correction package contains an unsupported action." }); return; }
      }
    }
    else { res.status(409).json({ error: "This correction does not have an approved execution handler." }); return; }
    const signalKey = `${overrideField}:${clean(draft.option.parameters.laneId) || "order"}`;
    let recurrenceCount = 1;
    if (isFirestorePrimaryEnabled()) recurrenceCount += (await intakeCollection(context.orgScope, "orderPlanningOverrides").where("signalKey", "==", signalKey).get()).docs.length;
    const overrideRecord = { schemaVersion: "1.0", overrideId: randomUUID(), workspaceId: context.orgScope, orderId: order.orderId, proposalId: latest.proposalId, draftId: draft.draftId, actionType: draft.option.actionType, field: overrideField, value: overrideValue, laneId: clean(draft.option.parameters.laneId) || null, signalKey, recurrenceCount, status: "ACTIVE", createdBy: context.uid, createdAt: now };
    const updated: OrderRecord = { ...order, planningOverrides: { values, codes: [...new Set(codes)], lastOverrideId: overrideRecord.overrideId, actionType: draft.option.actionType, field: overrideField, laneId: overrideRecord.laneId, recurrenceCount, updatedAt: now }, updatedAt: now };
    const [registry, facilities] = await Promise.all([listLanePlanningRegistry(context.orgScope), listFacilitiesForWorkspace(context.orgScope)]);
    const proposal = buildOrderPlanningProposal({ workspaceId: context.orgScope, order: effectivePlanningOrder(updated), lanes: registry.lanes, eligibility: registry.eligibility, awards: registry.awards, partners: registry.partners, facilities, actor: context.uid, supersedesProposalId: latest.proposalId });
    try {
      const record = await recordPlanningResolutionDecision({ workspaceId: context.orgScope, draftId: draft.draftId, decision: 'APPROVED', reason: clean(req.body?.reason, 1000), actor: context.uid, resultingProposalIds: [proposal.proposalId] });
      await save(context.orgScope, "orders", order.orderId, updated, localOrders);
      if (isFirestorePrimaryEnabled()) await intakeCollection(context.orgScope, "orderPlanningOverrides").doc(overrideRecord.overrideId).create(overrideRecord);
      await saveOrderPlanningProposal(proposal);
      res.status(201).json({ decision: record, order: updated, proposal, override: overrideRecord, dataQualitySignal: recurrenceCount >= 3 ? { signalKey, recurrenceCount, message: "This correction is recurring. Review the source data or reusable lane policy before making a permanent change." } : null });
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : "The resolution decision could not be recorded." });
    }
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
    const registry = await listLanePlanningRegistry(context.orgScope);
    const proposals: OrderPlanningProposal[] = [];
    for (const order of orders) {
      await save(context.orgScope, "orders", order.orderId, order, localOrders);
      proposals.push(await createAutomaticPlanningProposal(context.orgScope, order as OrderRecord, context.uid, registry));
    }
    const approved = { ...review, status: "APPROVED", approvedBy: context.uid, approvedAt: now, importedOrderIds: orders.map((order: any) => order.orderId) };
    await save(context.orgScope, "orderIntakeReviews", review.reviewId, approved, localReviews);
    const coordinatorRun = await coordinateAutomaticProposals(context.orgScope, proposals, context.uid);
    res.json({ importedCount: orders.length, rejectedCount: review.proposedRows.length - orders.length, orders, proposals, coordinatorRun });
  });
}
