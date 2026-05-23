import { Express, Request, Response, Router } from "express";
import {
  buildGovernanceSignalFromMatch,
  buildLoadRecommendations,
  scoreBidMatch,
} from "../services/shipmentIntelligence/matchingEngine";
import {
  getAllowedLoadTransitions,
  transitionLoadState,
} from "../services/shipmentIntelligence/loadLifecycleService";
import {
  requestCarrierQuotes,
  requestTrackingUpdate,
} from "../services/shipmentIntelligence/carrierProviderAdapter";
import { analyzeMarketRate } from "../services/shipmentIntelligence/marketRateService";
import {
  listWorkflowEvents,
  seedWorkflowEvents,
} from "../services/shipmentIntelligence/workflowEventService";
import { BrokerageLoadState, SilCarrierProvider, SilGovernanceSignalDraft } from "../services/shipmentIntelligence/types";
import {
  listPersistedWorkflowEvents,
  listSilBids,
  listSilCarriers,
  listSilGovernanceSignals,
  listSilLanes,
  listSilLeanTemplates,
  listSilLoads,
  listSilMarketRates,
  listSilPostings,
  listSilShipments,
  persistSilGovernanceSignal,
  persistSilWorkflowEvent,
  seedSilPersistence,
  updateSilLoadStatus,
} from "../services/shipmentIntelligence/silPersistenceService";

export function registerShipmentIntelligenceRoutes(app: Express) {
  const router = Router();
  seedWorkflowEvents();
  seedSilPersistence().catch((error) => {
    console.error("SIL persistence seed failed", error);
  });

  const findLaneForLoad = async (load: Awaited<ReturnType<typeof listSilLoads>>[number]) => {
    const lanes = await listSilLanes();
    return lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
  };

  const buildGeneratedGovernanceSignals = async () => {
    const [bids, loads, carriers, postings] = await Promise.all([
      listSilBids(),
      listSilLoads(),
      listSilCarriers(),
      listSilPostings(),
    ]);

    const generatedSignals = await Promise.all(
      bids.map(async (bid) => {
        const load = loads.find((item) => item.loadId === bid.loadId);
        if (!load) return null;
        const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
        const posting = postings.find((item) => item.postingId === bid.postingId);
        const lane = await findLaneForLoad(load);
        const score = scoreBidMatch({ load, bid, carrier, lane, posting });
        if (!score.governanceSignalRequired) return null;

        const signal = buildGovernanceSignalFromMatch({ load, bid, carrier, lane, posting }, score);
        await persistSilGovernanceSignal(signal);
        return signal;
      })
    );

    return generatedSignals.filter((signal): signal is SilGovernanceSignalDraft => Boolean(signal));
  };

  router.get("/overview", async (_req: Request, res: Response) => {
    const [loads, postings, bids] = await Promise.all([listSilLoads(), listSilPostings(), listSilBids()]);
    const activeLoads = loads.filter((load) => !["CLOSED", "CANCELED"].includes(load.status)).length;
    const activePostings = postings.filter((posting) => posting.status === "POSTED").length;
    const openBids = bids.filter((bid) => ["RECEIVED", "SHORTLISTED"].includes(bid.status)).length;
    const governanceSignals = await buildGeneratedGovernanceSignals();

    res.json({
      activeLoads,
      activePostings,
      openBids,
      governanceSignalCount: governanceSignals.length,
      loadsAtRisk: governanceSignals.filter((signal) => ["HIGH", "CRITICAL"].includes(signal.severity)).length,
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/loads", async (_req: Request, res: Response) => {
    const loads = await listSilLoads();
    res.json({ count: loads.length, loads });
  });

  router.get("/loads/:loadId", async (req: Request, res: Response) => {
    const [loads, postings, bids, carriers, lanes] = await Promise.all([
      listSilLoads(),
      listSilPostings(),
      listSilBids(),
      listSilCarriers(),
      listSilLanes(),
    ]);
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const posting = postings.find((item) => item.loadId === load.loadId);
    const recommendations = buildLoadRecommendations({
      load,
      posting,
      bids,
      carriers,
      lanes,
    });

    res.json({
      load,
      posting: posting ?? null,
      bids: recommendations,
      allowedTransitions: getAllowedLoadTransitions(load.status),
      lane: lanes.find(
        (item) =>
          item.originRegion === load.origin.state &&
          item.destinationRegion === load.destination.state &&
          item.mode === load.mode &&
          item.equipmentType === load.equipmentType
      ) ?? null,
    });
  });

  router.get("/loads/:loadId/transitions", async (req: Request, res: Response) => {
    const loads = await listSilLoads();
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    res.json({
      loadId: load.loadId,
      currentState: load.status,
      allowedTransitions: getAllowedLoadTransitions(load.status),
    });
  });

  router.post("/loads/:loadId/transition", async (req: Request, res: Response) => {
    const loads = await listSilLoads();
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const nextState = req.body?.nextState as BrokerageLoadState | undefined;
    if (!nextState) return res.status(400).json({ error: "nextState is required" });

    const result = transitionLoadState({
      load,
      nextState,
      actor: req.body?.actor ?? "operator",
      evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : undefined,
    });

    if (result.accepted) {
      load.status = result.nextState;
      await updateSilLoadStatus(load.loadId, result.nextState);
    }
    await persistSilWorkflowEvent(result.event);

    res.status(result.accepted ? 200 : 409).json(result);
  });

  router.get("/shipments", async (_req: Request, res: Response) => {
    const shipments = await listSilShipments();
    res.json({ count: shipments.length, shipments });
  });

  router.get("/carriers", async (_req: Request, res: Response) => {
    const carriers = await listSilCarriers();
    res.json({ count: carriers.length, carriers });
  });

  router.get("/lanes", async (_req: Request, res: Response) => {
    const lanes = await listSilLanes();
    res.json({ count: lanes.length, lanes });
  });

  router.get("/load-board/postings", async (_req: Request, res: Response) => {
    const postings = await listSilPostings();
    res.json({ count: postings.length, postings });
  });

  router.get("/load-board/bids", async (_req: Request, res: Response) => {
    const [bids, loads, carriers, postings, lanes] = await Promise.all([
      listSilBids(),
      listSilLoads(),
      listSilCarriers(),
      listSilPostings(),
      listSilLanes(),
    ]);
    const scoredBids = bids.map((bid) => {
      const load = loads.find((item) => item.loadId === bid.loadId);
      const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
      const posting = postings.find((item) => item.postingId === bid.postingId);
      const lane = load
        ? lanes.find(
            (item) =>
              item.originRegion === load.origin.state &&
              item.destinationRegion === load.destination.state &&
              item.mode === load.mode &&
              item.equipmentType === load.equipmentType
          )
        : undefined;

      if (!load) return bid;
      return { ...bid, score: scoreBidMatch({ load, bid, carrier, lane, posting }) };
    });

    res.json({ count: scoredBids.length, bids: scoredBids });
  });

  router.get("/load-board/bids/:bidId/review", async (req: Request, res: Response) => {
    const [bids, loads, carriers, postings, lanes] = await Promise.all([
      listSilBids(),
      listSilLoads(),
      listSilCarriers(),
      listSilPostings(),
      listSilLanes(),
    ]);
    const bid = bids.find((item) => item.bidId === req.params.bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    const load = loads.find((item) => item.loadId === bid.loadId);
    if (!load) return res.status(404).json({ error: "Load not found for bid" });

    const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
    const posting = postings.find((item) => item.postingId === bid.postingId);
    const lane = lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
    const score = scoreBidMatch({ load, bid, carrier, lane, posting });
    const governanceSignal = score.governanceSignalRequired
      ? buildGovernanceSignalFromMatch({ load, bid, carrier, lane, posting }, score)
      : null;
    if (governanceSignal) await persistSilGovernanceSignal(governanceSignal);

    res.json({
      load,
      bid: { ...bid, score },
      carrier: carrier ?? null,
      lane: lane ?? null,
      posting: posting ?? null,
      governanceSignal,
    });
  });

  router.get("/matching/recommendations", async (_req: Request, res: Response) => {
    const [loads, postings, bids, carriers, lanes] = await Promise.all([
      listSilLoads(),
      listSilPostings(),
      listSilBids(),
      listSilCarriers(),
      listSilLanes(),
    ]);
    const recommendations = loads.map((load) => {
      const posting = postings.find((item) => item.loadId === load.loadId);
      return {
        load,
        posting: posting ?? null,
        bids: buildLoadRecommendations({ load, posting, bids, carriers, lanes }),
      };
    });

    res.json({ count: recommendations.length, recommendations });
  });

  router.get("/carrier-quotes/:loadId", async (req: Request, res: Response) => {
    const [loads, carriers] = await Promise.all([listSilLoads(), listSilCarriers()]);
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const provider = (req.query.provider as SilCarrierProvider | undefined) ?? "MOCK";
    const quotes = requestCarrierQuotes({ provider, load, carriers });
    res.json({ count: quotes.length, quotes });
  });

  router.get("/tracking/:shipmentId", async (req: Request, res: Response) => {
    const shipments = await listSilShipments();
    const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const provider = req.query.provider as SilCarrierProvider | undefined;
    const trackingUpdate = requestTrackingUpdate({ provider, shipment });
    res.json({ trackingUpdate });
  });

  router.get("/market-rates", async (_req: Request, res: Response) => {
    const marketRates = await listSilMarketRates();
    res.json({ count: marketRates.length, marketRates });
  });

  router.get("/market-rates/analyze", async (req: Request, res: Response) => {
    const [loads, bids, lanes, marketRates] = await Promise.all([
      listSilLoads(),
      listSilBids(),
      listSilLanes(),
      listSilMarketRates(),
    ]);
    const load = loads.find((item) => item.loadId === req.query.loadId);
    if (!load) return res.status(404).json({ error: "Valid loadId query parameter is required" });

    const bid = req.query.bidId ? bids.find((item) => item.bidId === req.query.bidId) : undefined;
    const lane = lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
    const analysis = analyzeMarketRate({ load, bid, lane, observations: marketRates });
    if (analysis.governanceSignal) await persistSilGovernanceSignal(analysis.governanceSignal);

    res.json({ analysis });
  });

  router.get("/governance-signals", async (_req: Request, res: Response) => {
    await buildGeneratedGovernanceSignals();
    const persistedSignals = await listSilGovernanceSignals();
    const governanceSignals = persistedSignals;
    res.json({ count: governanceSignals.length, governanceSignals });
  });

  router.get("/workflow-events", async (req: Request, res: Response) => {
    const memoryEvents = listWorkflowEvents({
      loadId: req.query.loadId as string | undefined,
      shipmentId: req.query.shipmentId as string | undefined,
      bidId: req.query.bidId as string | undefined,
    });
    await Promise.all(memoryEvents.map((event) => persistSilWorkflowEvent(event)));
    const events = await listPersistedWorkflowEvents({
      loadId: req.query.loadId as string | undefined,
      shipmentId: req.query.shipmentId as string | undefined,
      bidId: req.query.bidId as string | undefined,
    });
    res.json({ count: events.length, events });
  });

  router.get("/lean/templates", async (_req: Request, res: Response) => {
    const templates = await listSilLeanTemplates();
    res.json({ count: templates.length, templates });
  });

  app.use("/api/shipment-intelligence", router);
}
