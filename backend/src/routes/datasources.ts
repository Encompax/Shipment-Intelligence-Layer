import { Express, Request, Response, Router } from "express";
import { prisma } from "../lib/prisma"; // adjust path if needed
import { intakeWorkspace, requireIntakeWorkspace } from "../middleware/requireIntakeWorkspace";
export function registerDatasourceRoutes(app: Express) {
 const router = Router();
 router.use(requireIntakeWorkspace);
 // GET /api/datasources
 router.get("/", async (req: Request, res: Response) => {
   const list = await prisma.datasource.findMany({
     where: { orgScope: intakeWorkspace(req) },
     orderBy: { name: "asc" },
   });
   res.json(list);
 });
 // POST /api/datasources
 router.post("/", async (req: Request, res: Response) => {
   const { name, type, description } = req.body;
   if (!name || !type) {
     return res.status(400).json({ message: "Name and type are required" });
   }
   const created = await prisma.datasource.create({
     data: {
       orgScope: intakeWorkspace(req),
       name,
       type,
       description: description ?? null,
     },
   });
   res.status(201).json(created);
 });
 // Mount route
 app.use("/api/datasources", router);
}
