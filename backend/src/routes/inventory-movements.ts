// backend/src/routes/inventory-movements.ts
import { Express, Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

const WAREHOUSE_LOCATIONS = [
  { code: "RECEIVING",        name: "Receiving Dock" },
  { code: "QUARANTINE",       name: "Quarantine (QC Hold)" },
  { code: "MAIN",             name: "Main Inventory" },
  { code: "PICKING",          name: "Picking/Wave Pick Stage" },
  { code: "SHIPPING_DESK",    name: "Shipping Desk (ready to pick)" },
  { code: "MANUFACTURING",    name: "Manufacturing/Production" },
  { code: "DAMAGED",          name: "Damaged/Return Stock" },
];

const MOVE_REASONS = [
  "QC_PASS",
  "QC_FAIL",
  "PICKING_PREP",
  "STAGING",
  "RECEIVE",
  "RETURN",
  "CYCLE_COUNT",
  "DAMAGED",
  "AUDIT",
  "MANUFACTURING_COMPLETE",
];

export function registerInventoryMovementRoutes(app: Express) {
  const router = Router();

  // GET /api/inventory/movements
  router.get("/movements", async (req: Request, res: Response) => {
    try {
      const filterLocation = req.query.location as string | undefined;
      const filterItem     = req.query.item     as string | undefined;
      const filterLot      = req.query.lot      as string | undefined;

      const where: Record<string, unknown> = {};
      if (filterLocation) {
        where.OR = [{ from_location: filterLocation }, { to_location: filterLocation }];
      }
      if (filterItem) where.item_number = { contains: filterItem.toUpperCase() };
      if (filterLot)  where.lot_number  = { contains: filterLot.toUpperCase() };

      const movements = await prisma.inventoryMovement.findMany({
        where,
        orderBy: { moved_timestamp: "desc" },
      });

      res.json({ total_movements: movements.length, movements });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inventory movements" });
    }
  });

  // GET /api/inventory/current-positions
  router.get("/current-positions", async (req: Request, res: Response) => {
    try {
      const movements = await prisma.inventoryMovement.findMany({ orderBy: { moved_timestamp: "asc" } });

      // Aggregate net quantity per item+lot+location from movement history
      const positions: Record<string, { item_number: string; item_description: string; lot_number: string; location: string; bin: string | null; quantity: number }> = {};

      for (const move of movements) {
        const toKey   = `${move.item_number}|${move.lot_number}|${move.to_location}`;
        const fromKey = `${move.item_number}|${move.lot_number}|${move.from_location}`;

        if (!positions[toKey]) {
          positions[toKey] = { item_number: move.item_number, item_description: move.item_description, lot_number: move.lot_number, location: move.to_location, bin: move.to_bin, quantity: 0 };
        }
        positions[toKey].quantity += move.quantity_moved;

        if (positions[fromKey]) {
          positions[fromKey].quantity -= move.quantity_moved;
        }
      }

      const currentInventory = Object.values(positions).filter((p) => p.quantity > 0);

      const byLocation: Record<string, typeof currentInventory> = {};
      for (const item of currentInventory) {
        if (!byLocation[item.location]) byLocation[item.location] = [];
        byLocation[item.location].push(item);
      }

      res.json({
        total_items_in_warehouse: currentInventory.length,
        by_location: byLocation,
        locations: WAREHOUSE_LOCATIONS,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch current inventory positions" });
    }
  });

  // GET /api/inventory/item-tracking/:item_number/:lot_number
  router.get("/item-tracking/:item_number/:lot_number", async (req: Request, res: Response) => {
    try {
      const { item_number, lot_number } = req.params;

      const itemMovements = await prisma.inventoryMovement.findMany({
        where: { item_number, lot_number },
        orderBy: { moved_timestamp: "asc" },
      });

      if (itemMovements.length === 0) {
        return res.status(404).json({ error: "Item lot not found" });
      }

      const lastMove = itemMovements[itemMovements.length - 1];
      const currentPosition = {
        item_number:      itemMovements[0].item_number,
        item_description: itemMovements[0].item_description,
        lot_number,
        current_location: lastMove.to_location,
        current_bin:      lastMove.to_bin,
        quantity_at_location: lastMove.quantity_moved,
      };

      res.json({
        current_position: currentPosition,
        total_moves: itemMovements.length,
        movement_history: itemMovements,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch item tracking" });
    }
  });

  // POST /api/inventory/movements
  router.post("/movements", async (req: Request, res: Response) => {
    try {
      const {
        item_number, item_description, lot_number, quantity_moved,
        from_location, to_location, from_bin, to_bin,
        moved_by, reason, unit_of_measure, notes,
      } = req.body;

      if (!item_number || !lot_number || quantity_moved === undefined || !from_location || !to_location || !moved_by || !reason) {
        return res.status(400).json({
          error: "Missing required fields: item_number, lot_number, quantity_moved, from_location, to_location, moved_by, reason",
        });
      }

      if (typeof quantity_moved !== "number" || quantity_moved < 0) {
        return res.status(400).json({ error: "Invalid quantity_moved: must be a non-negative number" });
      }

      if (!MOVE_REASONS.includes(reason)) {
        return res.status(400).json({ error: `Invalid reason. Must be one of: ${MOVE_REASONS.join(", ")}` });
      }

      const movement = await prisma.inventoryMovement.create({
        data: {
          item_number,
          item_description: item_description || "",
          lot_number,
          quantity_moved,
          from_location,
          to_location,
          from_bin:          from_bin   || null,
          to_bin:            to_bin     || null,
          moved_by,
          moved_timestamp:   new Date(),
          reason,
          unit_of_measure:   unit_of_measure || "each",
          transaction_status: "success",
          notes:             notes || null,
        },
      });

      res.status(201).json({ message: "Inventory movement recorded", movement });
    } catch (error) {
      res.status(500).json({ error: "Failed to record inventory movement" });
    }
  });

  app.use("/api/inventory", router);
}
