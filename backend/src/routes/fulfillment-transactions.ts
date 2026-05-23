// backend/src/routes/fulfillment-transactions.ts
import { Express, Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getTenantConfig } from "../config/tenant-config";

// Mock data representing real fulfillment workflow
const generateMockFulfillmentOrders = () => {
  const { customers, items, operators, locations } = getTenantConfig();
  const resolvedOperators = operators.length ? operators : ["Operator A", "Operator B", "Operator C"];
  const resolvedCustomers = customers.length ? customers : ["Customer Alpha", "Customer Beta", "Customer Gamma"];
  const resolvedItems = items.length
    ? items
    : [
        { sku: "SKU-1001", description: "Sample Item A" },
        { sku: "SKU-1002", description: "Sample Item B" },
        { sku: "SKU-2001", description: "Sample Item C" },
        { sku: "SKU-3001", description: "Sample Item D" },
      ];
  const resolvedLocations = locations.length ? locations : ["Site A", "Site B", "Site C"];

  const orders = [
    {
      sales_order_number: "ORD-001842",
      created_date: new Date(Date.now() - 4 * 60 * 60 * 1000),
      customer: resolvedCustomers[0],
      business_unit: "External",
      destination: resolvedLocations[0],
      line_items: [
        {
          line_number: 1,
          item_number: resolvedItems[0].sku,
          item_description: resolvedItems[0].description,
          quantity_requested: 12,
          quantity_allocated: 12,
          picking: {
            quantity_picked: 12,
            lot_number: "LOT-202603-SP5740-001",
            picked_by: resolvedOperators[0],
            picked_timestamp: new Date(Date.now() - 3.5 * 60 * 60 * 1000),
            status: "picked",
          },
          verification: {
            quantity_verified: 12,
            verified_by: resolvedOperators[1] || resolvedOperators[0],
            verified_timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
            status: "verified",
          },
        },
      ],
    },
    {
      sales_order_number: "ORD-001843",
      created_date: new Date(Date.now() - 3.8 * 60 * 60 * 1000),
      customer: resolvedCustomers[1] || resolvedCustomers[0],
      business_unit: "External",
      destination: resolvedLocations[1] || resolvedLocations[0],
      line_items: [
        {
          line_number: 1,
          item_number: resolvedItems[1]?.sku || resolvedItems[0].sku,
          item_description: resolvedItems[1]?.description || resolvedItems[0].description,
          quantity_requested: 8,
          quantity_allocated: 8,
          picking: {
            quantity_picked: 8,
            lot_number: "LOT-202603-SP5741-001",
            picked_by: resolvedOperators[0],
            picked_timestamp: new Date(Date.now() - 3.2 * 60 * 60 * 1000),
            status: "picked",
          },
          verification: {
            quantity_verified: 8,
            verified_by: resolvedOperators[2] || resolvedOperators[0],
            verified_timestamp: new Date(Date.now() - 2.9 * 60 * 60 * 1000),
            status: "verified",
          },
        },
      ],
    },
    {
      sales_order_number: "ORD-001844",
      created_date: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
      customer: resolvedCustomers[1] || resolvedCustomers[0],
      business_unit: "External",
      destination: resolvedLocations[2] || resolvedLocations[0],
      line_items: [
        {
          line_number: 1,
          item_number: resolvedItems[2]?.sku || resolvedItems[0].sku,
          item_description: resolvedItems[2]?.description || resolvedItems[0].description,
          quantity_requested: 24,
          quantity_allocated: 24,
          picking: {
            quantity_picked: 24,
            lot_number: "LOT-202603-FG5001-050",
            picked_by: resolvedOperators[1] || resolvedOperators[0],
            picked_timestamp: new Date(Date.now() - 2.2 * 60 * 60 * 1000),
            status: "picked",
          },
          verification: null, // Not yet verified
        },
      ],
    },
    {
      sales_order_number: "ORD-001845",
      created_date: new Date(Date.now() - 1.8 * 60 * 60 * 1000),
      customer: resolvedCustomers[0],
      business_unit: "External",
      destination: resolvedLocations[0],
      line_items: [
        {
          line_number: 1,
          item_number: resolvedItems[3]?.sku || resolvedItems[0].sku,
          item_description: resolvedItems[3]?.description || resolvedItems[0].description,
          quantity_requested: 36,
          quantity_allocated: 36,
          picking: {
            quantity_picked: 36,
            lot_number: "LOT-202603-RM2401-012",
            picked_by: resolvedOperators[2] || resolvedOperators[0],
            picked_timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
            status: "picked",
          },
          verification: null, // Not yet verified
        },
      ],
    },
    {
      sales_order_number: "ORD-001846",
      created_date: new Date(Date.now() - 1.2 * 60 * 60 * 1000),
      customer: resolvedCustomers[2] || resolvedCustomers[0],
      business_unit: "Internal",
      destination: "In-house staging",
      line_items: [
        {
          line_number: 1,
          item_number: resolvedItems[0].sku,
          item_description: resolvedItems[0].description,
          quantity_requested: 4,
          quantity_allocated: 4,
          picking: { status: "pending" }, // Not yet picked
          verification: null,
        },
      ],
    },
    // Backorder scenario: Original ORD-001829 had 16 units allocated, 8 shipped earlier
    // Now picking remaining 8 units on a new order for same customer
    {
      sales_order_number: "ORD-001847",
      created_date: new Date(Date.now() - 55 * 60 * 1000),
      customer: resolvedCustomers[1] || resolvedCustomers[0],
      business_unit: "External",
      destination: resolvedLocations[1] || resolvedLocations[0],
      backorder_reference: "ORD-001829",
      backorder_note: "Partial shipment from ORD-001829 (8 units shipped 3/15, 8 units backlog)",
      line_items: [
        {
          line_number: 1,
          item_number: resolvedItems[0].sku,
          item_description: resolvedItems[0].description,
          quantity_requested: 8, // This is just the backlog portion
          quantity_allocated: 8,
          picking: {
            quantity_picked: 8,
            lot_number: "LOT-202602-SP5740-056",
            picked_by: resolvedOperators[0],
            picked_timestamp: new Date(Date.now() - 50 * 60 * 1000),
            status: "picked",
            notes: "Backlog from ORD-001829 (8 of 16 units)",
          },
          verification: null, // In verification queue
        },
      ],
    },
  ];

  return orders;
};

export function registerFulfillmentRoutes(app: Express) {
  const router = Router();

  // GET /api/fulfillment/orders
  // MOCK DATA — no SalesOrder model in Prisma schema.
  // Replace with real query once a SalesOrder/FulfillmentOrder model is added (Phase 2).
  router.get("/orders", async (req: Request, res: Response) => {
    try {
      const filterStatus = req.query.status as string; // pending, picked, verified
      const filterCustomer = req.query.customer as string;

      const orders = generateMockFulfillmentOrders();

      let filtered: any[] = orders;

      if (filterCustomer) {
        filtered = filtered.filter((o) => o.customer.toLowerCase().includes(filterCustomer.toLowerCase()));
      }

      if (filterStatus) {
        filtered = filtered
          .map((order) => {
            const line_items = order.line_items.filter((line: any) => {
              if (filterStatus === "pending") {
                return !line.picking || line.picking.status === "pending";
              } else if (filterStatus === "picked") {
                return line.picking && line.picking.status === "picked" && !line.verification;
              } else if (filterStatus === "verified") {
                return line.verification && line.verification.status === "verified";
              }
              return true;
            });
            const filtered_order: typeof order = {
              ...order,
              line_items,
            };
            return filtered_order;
          })
          .filter((o) => o.line_items.length > 0);
      }

      res.json({
        total_orders: filtered.length,
        pending_picks: filtered.reduce((sum, o) => sum + o.line_items.filter((l: any) => !l.picking || l.picking.status === "pending").length, 0),
        picked_awaiting_verification: filtered.reduce((sum, o) => sum + o.line_items.filter((l: any) => l.picking && !l.verification).length, 0),
        fully_verified: filtered.reduce((sum, o) => sum + o.line_items.filter((l: any) => l.verification && l.verification.status === "verified").length, 0),
        orders: filtered,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch fulfillment orders" });
    }
  });

  // GET /api/fulfillment/orders/:sales_order_number
  // MOCK DATA — no SalesOrder model in Prisma schema. See GET /orders above.
  router.get("/orders/:sales_order_number", async (req: Request, res: Response) => {
    try {
      const { sales_order_number } = req.params;

      const orders = generateMockFulfillmentOrders();
      const order = orders.find((o) => o.sales_order_number === sales_order_number);

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json(order);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order details" });
    }
  });

  // POST /api/fulfillment/orders/:sales_order_number/pick
  // Record a picking transaction for a line item
  router.post(
    "/orders/:sales_order_number/pick",
    async (req: Request, res: Response) => {
      try {
        const { sales_order_number } = req.params;
        const { line_number, quantity_picked, lot_number, picked_by, scanner_id, notes } = req.body;

        if (!line_number || quantity_picked === undefined || !picked_by) {
          return res.status(400).json({
            error: "Missing required fields: line_number, quantity_picked, picked_by",
          });
        }

        if (typeof quantity_picked !== "number" || quantity_picked < 0) {
          return res.status(400).json({
            error: "Invalid quantity_picked: must be a non-negative number",
          });
        }

        // Find or create the OrderLineItem for this order + line
        const lineItem = await prisma.orderLineItem.upsert({
          where: { sales_order_number_line_number: { sales_order_number, line_number } },
          create: {
            sales_order_number,
            line_number,
            item_number: "UNKNOWN",
            item_description: "Created via pick endpoint",
            quantity_requested: quantity_picked,
            quantity_allocated: quantity_picked,
          },
          update: {},
        });

        const pickingTransaction = await prisma.pickingTransaction.create({
          data: {
            line_item_id:      lineItem.id,
            sales_order_number,
            quantity_picked,
            lot_number:        lot_number    || null,
            picked_by,
            picked_timestamp:  new Date(),
            scanner_id:        scanner_id    || null,
            notes:             notes         || null,
          },
        });

        res.status(201).json({
          message: "Picking transaction recorded",
          transaction: pickingTransaction,
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to record picking transaction" });
      }
    }
  );

  // POST /api/fulfillment/orders/:sales_order_number/verify
  // Record a verification transaction for a line item
  router.post(
    "/orders/:sales_order_number/verify",
    async (req: Request, res: Response) => {
      try {
        const { sales_order_number } = req.params;
        const { line_number, quantity_verified, verified_by, variance_notes } = req.body;

        if (!line_number || quantity_verified === undefined || !verified_by) {
          return res.status(400).json({
            error: "Missing required fields: line_number, quantity_verified, verified_by",
          });
        }

        if (typeof quantity_verified !== "number" || quantity_verified < 0) {
          return res.status(400).json({
            error: "Invalid quantity_verified: must be a non-negative number",
          });
        }

        // Find or create the OrderLineItem for this order + line
        const lineItem = await prisma.orderLineItem.upsert({
          where: { sales_order_number_line_number: { sales_order_number, line_number } },
          create: {
            sales_order_number,
            line_number,
            item_number: "UNKNOWN",
            item_description: "Created via verify endpoint",
            quantity_requested: quantity_verified,
            quantity_allocated: quantity_verified,
          },
          update: {},
        });

        const verificationTransaction = await prisma.verificationTransaction.create({
          data: {
            line_item_id:         lineItem.id,
            sales_order_number,
            quantity_verified,
            verified_by,
            verified_timestamp:   new Date(),
            verification_status:  variance_notes ? "variance" : "passed",
            variance_notes:       variance_notes || null,
          },
        });

        res.status(201).json({
          message: "Verification transaction recorded",
          transaction: verificationTransaction,
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to record verification transaction" });
      }
    }
  );

  app.use("/api/fulfillment", router);
}
