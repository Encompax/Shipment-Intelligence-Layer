import { Express, Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

export function registerLotTrackingRoutes(app: Express) {
  const router = Router();

  // GET /api/inventory/lot-tracking
  router.get("/", async (req: Request, res: Response) => {
    try {
      const filterPriority =
        req.query.priority === "true" ||
        req.query.special === "true" ||
        req.query.sysmex === "true";

      const where = filterPriority ? { is_sysmex: true } : {};
      const lots = await prisma.lotTrackingItem.findMany({ where, orderBy: { received_date: "desc" } });

      const now = Date.now();
      const lotsNearExpiration = lots.filter((l) => {
        const daysUntilExpiry = Math.ceil((l.expiration_date.getTime() - now) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry < 30 && daysUntilExpiry > 0;
      }).length;

      const mappedLots = lots.map(({ is_sysmex, ...rest }) => ({
        ...rest,
        is_priority: is_sysmex,
      }));

      res.json({
        total_active_lots: lots.length,
        priority_lots: lots.filter((l) => l.is_sysmex).length,
        lots_near_expiration: lotsNearExpiration,
        total_quantity_in_stock: lots.reduce((sum, l) => sum + l.quantity_total, 0),
        lots: mappedLots,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch lot tracking data" });
    }
  });

  // GET /api/inventory/lot-tracking/:lot_number
  router.get("/:lot_number", async (req: Request, res: Response) => {
    try {
      const { lot_number } = req.params;

      const lot = await prisma.lotTrackingItem.findUnique({ where: { lot_number } });

      if (!lot) {
        return res.status(404).json({ error: "Lot not found" });
      }

      res.json(lot);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch lot details" });
    }
  });

  // POST /api/inventory/lot-tracking
  router.post("/", async (req: Request, res: Response) => {
    try {
      const { lot_number, item_number, item_description, quantity_total, location, status, expiration_date, received_date, is_priority, priority, is_sysmex, order_reference } = req.body;

      if (!lot_number || !item_number || quantity_total === undefined || quantity_total === null || !location) {
        return res.status(400).json({
          error: "Missing required fields: lot_number, item_number, quantity_total, location",
        });
      }

      if (typeof quantity_total !== "number" || quantity_total < 0) {
        return res.status(400).json({
          error: "Invalid quantity_total: must be a non-negative number",
        });
      }

      const newLot = await prisma.lotTrackingItem.create({
        data: {
          lot_number,
          item_number,
          item_description: item_description || "TBD",
          quantity_total,
          quantity_picked: 0,
          quantity_available: quantity_total,
          location,
          status: status || "available",
          received_date: received_date ? new Date(received_date) : new Date(),
          expiration_date: expiration_date ? new Date(expiration_date) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          is_sysmex: is_priority === true || priority === true || is_sysmex === true,
          order_reference: order_reference || null,
        },
      });

      res.status(201).json(newLot);
    } catch (error) {
      res.status(500).json({ error: "Failed to create lot tracking record" });
    }
  });

  app.use("/api/inventory/lot-tracking", router);
}
