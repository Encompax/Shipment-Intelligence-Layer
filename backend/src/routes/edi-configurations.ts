import type { Express, Request, Response } from "express";
import type { AuthenticatedSilRequest } from "../middleware/requireSilAuth";
import { createEdiConfiguration, listEdiConfigurations, type EdiStewardshipModel, type EdiTransport } from "../services/ediConfigurationService";

const clean = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);
function workspace(req: Request, res: Response) {
  const context = (req as AuthenticatedSilRequest).silAuth;
  if (!context?.orgScope || context.partnerContext) { res.status(403).json({ error: "An authenticated client workspace is required." }); return null; }
  return context;
}

export function registerEdiConfigurationRoutes(app: Express) {
  app.get("/api/edi/configurations", async (req, res) => {
    const context = workspace(req, res); if (!context) return;
    res.json({ configurations: await listEdiConfigurations(context.orgScope) });
  });
  app.post("/api/edi/configurations", async (req, res) => {
    const context = workspace(req, res); if (!context) return;
    const transport = clean(req.body?.transport) as EdiTransport;
    const stewardshipModel = clean(req.body?.stewardshipModel) as EdiStewardshipModel;
    const partnerName = clean(req.body?.partnerName);
    const partnerCode = clean(req.body?.partnerCode, 50);
    const interchangeId = clean(req.body?.interchangeId, 80);
    const interchangeQualifier = clean(req.body?.interchangeQualifier, 4);
    const stewardEmail = clean(req.body?.stewardEmail, 254);
    if (!partnerName || !partnerCode || !interchangeId || !interchangeQualifier) return res.status(400).json({ error: "Partner name, code, interchange ID, and qualifier are required." });
    if (!(["SFTP", "AS2", "MANAGED_API"] as string[]).includes(transport)) return res.status(400).json({ error: "Select a supported EDI transport." });
    if (!(["MARENGO", "EXTERNAL_PARTY", "INTERNAL_DATA_STEWARD"] as string[]).includes(stewardshipModel)) return res.status(400).json({ error: "Select an accountable stewardship model." });
    if (stewardshipModel !== "MARENGO" && (!clean(req.body?.stewardName) || !stewardEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stewardEmail))) return res.status(400).json({ error: "A valid steward name and email are required for human-managed EDI." });
    const configuration = await createEdiConfiguration({ workspaceId: context.orgScope, actor: context.uid, partnerName, partnerCode, interchangeId, interchangeQualifier, transport, connectionReference: clean(req.body?.connectionReference, 300), stewardshipModel, stewardName: clean(req.body?.stewardName), stewardEmail });
    res.status(201).json({ configuration });
  });
}
