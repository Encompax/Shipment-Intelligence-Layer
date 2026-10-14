import type { Express, Request, Response } from "express";
import type { AuthenticatedSilRequest } from "../middleware/requireSilAuth";
import { issuePlannedLoadTender, listTenderQueue, TenderConflict, TenderValidationError } from "../services/tenderQueueService";
import { markLocalOrdersTendered } from "./orders";

const auth = (req: Request) => (req as AuthenticatedSilRequest).silAuth;
const clean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);

function requireWorkspace(req: Request, res: Response) {
  const context = auth(req);
  if (!context?.orgScope) { res.status(403).json({ error: "An authenticated client workspace is required." }); return null; }
  if (String(context.profile.userType || "customer_user") === "partner_user") { res.status(403).json({ error: "Partner accounts cannot administer the tender queue." }); return null; }
  return context;
}

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
      if (error instanceof TenderConflict) { res.status(409).json({ error: error.message }); return; }
      if (error instanceof TenderValidationError) { res.status(422).json({ error: error.message }); return; }
      throw error;
    }
  });
}
