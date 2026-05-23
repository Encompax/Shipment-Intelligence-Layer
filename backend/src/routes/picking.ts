// backend/src/routes/picking.ts
import { Express, Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";

export function registerPickingRoutes(app: Express) {
  const router = Router();

  // GET /api/picking/tickets
  router.get("/tickets", async (req: Request, res: Response) => {
    try {
      const filterStatus   = req.query.status   as string | undefined;
      const filterOperator = req.query.operator as string | undefined;

      const where: Record<string, unknown> = {};
      if (filterStatus)   where.status      = filterStatus;
      if (filterOperator) where.assigned_to  = filterOperator;

      const tickets = await prisma.pickingTicket.findMany({ where, orderBy: { assigned_time: "desc" } });

      res.json({
        total_picking_tickets: tickets.length,
        total_items_to_pick:   tickets.reduce((sum, t) => sum + t.quantity_to_pick, 0),
        pending_picks:         tickets.filter((t) => t.status === "pending").length,
        in_progress_picks:     tickets.filter((t) => t.status === "in-progress").length,
        completed_picks:       tickets.filter((t) => t.status === "completed").length,
        picking_tasks: tickets,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch picking tickets" });
    }
  });

  // GET /api/picking/tickets/:ticket_id
  router.get("/tickets/:ticket_id", async (req: Request, res: Response) => {
    try {
      const { ticket_id } = req.params;

      const ticket = await prisma.pickingTicket.findUnique({ where: { picking_ticket_id: ticket_id } });

      if (!ticket) {
        return res.status(404).json({ error: "Picking ticket not found" });
      }

      res.json(ticket);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch picking ticket details" });
    }
  });

  // POST /api/picking/tickets/:ticket_id/scan
  // Records a scanner scan event (Datalogic Skorpio X5)
  router.post("/tickets/:ticket_id/scan", async (req: Request, res: Response) => {
    try {
      const { ticket_id } = req.params;
      const { scanner_id, lot_number, quantity_scanned } = req.body;

      if (!scanner_id || !lot_number || quantity_scanned === undefined || quantity_scanned === null) {
        return res.status(400).json({
          error: "Missing required fields: scanner_id, lot_number, quantity_scanned",
        });
      }

      if (typeof quantity_scanned !== "number" || quantity_scanned < 0) {
        return res.status(400).json({
          error: "Invalid quantity_scanned: must be a non-negative number",
        });
      }

      const updated = await prisma.pickingTicket.update({
        where: { picking_ticket_id: ticket_id },
        data: {
          scanner_id,
          scanned_timestamp: new Date(),
          quantity_picked: quantity_scanned,
        },
      });

      res.json({
        message: "Scan recorded successfully",
        scan_event: {
          picking_ticket_id: ticket_id,
          scanner_id,
          lot_number,
          quantity_scanned,
          scanned_at: updated.scanned_timestamp,
          success: true,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to record scanner scan" });
    }
  });

  // PATCH /api/picking/tickets/:ticket_id/status
  router.patch("/tickets/:ticket_id/status", async (req: Request, res: Response) => {
    try {
      const { ticket_id } = req.params;
      const { status, quantity_picked } = req.body;

      if (!status || !["pending", "in-progress", "completed"].includes(status)) {
        return res.status(400).json({
          error: "Invalid status. Must be: pending, in-progress, or completed",
        });
      }

      if (quantity_picked !== undefined && quantity_picked !== null) {
        if (typeof quantity_picked !== "number" || quantity_picked < 0) {
          return res.status(400).json({
            error: "Invalid quantity_picked: must be a non-negative number",
          });
        }
      }

      const data: Record<string, unknown> = { status };
      if (quantity_picked !== undefined && quantity_picked !== null) {
        data.quantity_picked = quantity_picked;
      }

      const updated = await prisma.pickingTicket.update({
        where: { picking_ticket_id: ticket_id },
        data,
      });

      res.json({ message: "Ticket status updated", ticket: updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to update ticket status" });
    }
  });

  app.use("/api/picking", router);
}
