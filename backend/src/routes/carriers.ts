import { Express, Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getTenantConfig } from "../config/tenant-config";

// Mock data generator for development
const generateMockCarrierMetrics = () => {
  const { carriers: carrierConfig } = getTenantConfig();
  const carriers = (carrierConfig.length ? carrierConfig : [{ name: "Carrier A" }]).map((carrier, idx) => {
    const baseCount = 60 + idx * 25;
    const baseCost = 4200 + idx * 1800;
    const baseWeight = 6 + idx * 4;
    const onTime = Math.max(0.9, 0.98 - idx * 0.01);
    const exception = Math.min(0.06, 0.02 + idx * 0.005);

    const trend = Array.from({ length: 7 }, (_, day) => ({
      date: new Date(Date.now() - (6 - day) * 24 * 60 * 60 * 1000),
      count: Math.max(5, Math.round(baseCount / 7 + (day - 3) * 2 + idx)),
    }));

    return {
      carrier_name: carrier.name,
      shipment_count: baseCount,
      total_cost: baseCost,
      avg_weight_lbs: Number(baseWeight.toFixed(1)),
      on_time_rate: Number(onTime.toFixed(3)),
      exception_rate: Number(exception.toFixed(3)),
      trend,
    };
  });

  const totalShipments = carriers.reduce((sum, c) => sum + c.shipment_count, 0);
  const totalCost = carriers.reduce((sum, c) => sum + c.total_cost, 0);

  return {
    total_shipments: totalShipments,
    total_cost: Number(totalCost.toFixed(2)),
    avg_shipment_cost: totalShipments ? Number((totalCost / totalShipments).toFixed(2)) : 0,
    carriers,
    cost_by_carrier: carriers.map((c) => ({
      name: c.carrier_name,
      value: Math.round(c.total_cost),
    })),
    volume_by_carrier: carriers.map((c) => ({
      name: c.carrier_name,
      value: c.shipment_count,
    })),
  };
};

// MOCK DATA — awaiting SIL SQLite (sil.db) integration.
// Replace with queries against the 'shipments' table populated by the SIL workers.
export function registerCarrierRoutes(app: Express) {
  const router = Router();

  // GET /api/shipment/carriers/metrics
  // Returns carrier breakdown by volume, cost, performance metrics
  router.get("/metrics", async (req: Request, res: Response) => {
    try {
      // TODO: Query shipments from database
      // In Phase 2, this will connect to SIL worker data in sil.db
      // For now, return mock data with realistic structure
      const metrics = generateMockCarrierMetrics();
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch carrier metrics" });
    }
  });

  // GET /api/shipment/carriers/performance
  // Returns detailed performance by carrier (on-time, exceptions, etc.)
  router.get("/performance", async (req: Request, res: Response) => {
    try {
      const carrierData = generateMockCarrierMetrics();
      const performanceData = carrierData.carriers.map((c) => ({
        carrier: c.carrier_name,
        shipments: c.shipment_count,
        on_time_rate: c.on_time_rate,
        exception_rate: c.exception_rate,
        avg_weight: c.avg_weight_lbs,
        avg_cost: c.total_cost / c.shipment_count,
      }));
      res.json(performanceData);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch performance data" });
    }
  });

  app.use("/api/shipment/carriers", router);
}
