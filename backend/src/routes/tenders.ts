import type { Express, Request, Response } from "express";
import type { AuthenticatedSilRequest } from "../middleware/requireSilAuth";
import { issuePlannedLoadTender, listTenderQueue, respondToTender, retenderPlannedLoad, TenderConflict, TenderValidationError } from "../services/tenderQueueService";
import { markLocalOrdersTendered } from "./orders";

const auth = (req: Request) => (req as AuthenticatedSilRequest).silAuth;
const clean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);

function requireWorkspace(req: Request, res: Response) {
  const context = auth(req);
  if (!context?.orgScope) { res.status(403).json({ error: "An authenticated client workspace is required." }); return null; }
  if (context.partnerContext) { res.status(403).json({ error: "Partner relationships cannot administer the client tender queue." }); return null; }
  if (String(context.profile.userType || "customer_user") === "partner_user") { res.status(403).json({ error: "Partner accounts cannot administer the tender queue." }); return null; }
  return context;
}

function requirePartner(req: Request, res: Response) {
  const context = auth(req);
  const relationship = context?.partnerContext;
  if (!context || !relationship?.clientOrgScope || !relationship?.externalPartnerId) { res.status(403).json({ error: "An authenticated external partner relationship is required." }); return null; }
  if (!relationship.accessScopes.includes("tenders")) { res.status(403).json({ error: "Tender access is not authorized for this partner relationship." }); return null; }
  return { ...context, clientOrgScope: relationship.clientOrgScope, externalPartnerId: relationship.externalPartnerId };
}

const handleError = (error: unknown, res: Response) => {
  if (error instanceof TenderConflict) { res.status(409).json({ error: error.message }); return true; }
  if (error instanceof TenderValidationError) { res.status(422).json({ error: error.message }); return true; }
  return false;
};

export function registerTenderRoutes(app: Express) {
  app.get("/api/tenders", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    const queue = await listTenderQueue(context.orgScope);
    res.json({ count: queue.length, queue });
  });

  app.post("/api/tenders/:loadId/issue", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    try {
      const result = await issuePlannedLoadTender({ workspaceId: context.orgScope, loadId: req.params.loadId, actor: context.uid, responseDueAt: clean(req.body?.responseDueAt, 100), note: clean(req.body?.note) });
      if (!result.idempotent) await markLocalOrdersTendered(context.orgScope, result.tender.orderIds, result.tender.tenderId, result.tender.issuedAt);
      res.status(result.idempotent ? 200 : 201).json(result);
    } catch (error) {
      if (handleError(error, res)) return;
      throw error;
    }
  });

  app.post("/api/tenders/:tenderId/expire", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    try { res.status(201).json(await respondToTender({ workspaceId: context.orgScope, tenderId: req.params.tenderId, response: "EXPIRED", reason: clean(req.body?.reason), actor: context.uid })); }
    catch (error) { if (handleError(error, res)) return; throw error; }
  });

  app.post("/api/tenders/:loadId/retender", async (req, res) => {
    const context = requireWorkspace(req, res); if (!context) return;
    try { res.status(201).json(await retenderPlannedLoad({ workspaceId: context.orgScope, loadId: req.params.loadId, actor: context.uid, reason: clean(req.body?.reason), responseDueAt: clean(req.body?.responseDueAt, 100), note: clean(req.body?.note) })); }
    catch (error) { if (handleError(error, res)) return; throw error; }
  });

  app.get("/api/partner/tenders", async (req, res) => {
    const context = requirePartner(req, res); if (!context) return;
    const queue = await listTenderQueue(context.clientOrgScope);
    const assigned = queue.filter((item) => item.load.carrier.externalPartnerId === context.externalPartnerId && item.tenders.length);
    res.json({ count: assigned.length, queue: assigned });
  });

  app.post("/api/partner/tenders/:tenderId/respond", async (req, res) => {
    const context = requirePartner(req, res); if (!context) return;
    const response = clean(req.body?.response).toUpperCase();
    if (!["ACCEPTED", "REJECTED"].includes(response)) { res.status(400).json({ error: "Response must be ACCEPTED or REJECTED." }); return; }
    try { res.status(201).json(await respondToTender({ workspaceId: context.clientOrgScope, tenderId: req.params.tenderId, externalPartnerId: context.externalPartnerId, response: response as "ACCEPTED" | "REJECTED", reason: clean(req.body?.reason), actor: context.uid })); }
    catch (error) { if (handleError(error, res)) return; throw error; }
  });
}
