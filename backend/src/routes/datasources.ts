import { Express, Request, Response, Router } from "express";
import { createIntakeSource, listIntakeSources } from "../services/intake/intakeStore";
import { intakeWorkspace, requireIntakeWorkspace } from "../middleware/requireIntakeWorkspace";
export function registerDatasourceRoutes(app: Express) {
 const router = Router();
 router.use(requireIntakeWorkspace);
 // GET /api/datasources
 router.get("/", async (req: Request, res: Response) => {
   const list = await listIntakeSources(intakeWorkspace(req));
   res.json(list);
 });
 // POST /api/datasources
 router.post("/", async (req: Request, res: Response) => {
   const { name, type, description } = req.body;
   if (typeof name !== 'string' || !name.trim() || name.length > 200 || typeof type !== 'string' || !type.trim() || type.length > 100
     || (description != null && (typeof description !== 'string' || description.length > 2000))) {
     return res.status(400).json({ message: "Name and type are required" });
   }
   const created = await createIntakeSource(intakeWorkspace(req), { name: name.trim(), type: type.trim(), description: description ?? null });
   res.status(201).json(created);
 });
 // Mount route
 app.use("/api/datasources", router);
}
