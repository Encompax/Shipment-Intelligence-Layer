import { Express, Request, Response, Router } from "express";
import {
  bids,
  carriers,
  getGovernanceSignals,
  lanes,
  loads,
  marketRates,
  postings,
  shipments,
} from "../services/shipmentIntelligence/mockData";
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
import { BrokerageLoadState, SilCarrierProvider } from "../services/shipmentIntelligence/types";

export function registerShipmentIntelligenceRoutes(app: Express) {
  const router = Router();
  seedWorkflowEvents();

  const findLaneForLoad = (load: (typeof loads)[number]) =>
    lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );

  const buildGeneratedGovernanceSignals = () =>
    bids.flatMap((bid) => {
      const load = loads.find((item) => item.loadId === bid.loadId);
      if (!load) return [];
      const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
      const posting = postings.find((item) => item.postingId === bid.postingId);
      const lane = findLaneForLoad(load);
      const score = scoreBidMatch({ load, bid, carrier, lane, posting });
      return score.governanceSignalRequired
        ? [buildGovernanceSignalFromMatch({ load, bid, carrier, lane, posting }, score)]
        : [];
    });

  router.get("/overview", (_req: Request, res: Response) => {
    const activeLoads = loads.filter((load) => !["CLOSED", "CANCELED"].includes(load.status)).length;
    const activePostings = postings.filter((posting) => posting.status === "POSTED").length;
    const openBids = bids.filter((bid) => ["RECEIVED", "SHORTLISTED"].includes(bid.status)).length;
    const governanceSignals = buildGeneratedGovernanceSignals();

    res.json({
      activeLoads,
      activePostings,
      openBids,
      governanceSignalCount: governanceSignals.length,
      loadsAtRisk: governanceSignals.filter((signal) => ["HIGH", "CRITICAL"].includes(signal.severity)).length,
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/loads", (_req: Request, res: Response) => {
    res.json({ count: loads.length, loads });
  });

  router.get("/loads/:loadId", (req: Request, res: Response) => {
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
      lane: findLaneForLoad(load) ?? null,
    });
  });

  router.get("/loads/:loadId/transitions", (req: Request, res: Response) => {
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    res.json({
      loadId: load.loadId,
      currentState: load.status,
      allowedTransitions: getAllowedLoadTransitions(load.status),
    });
  });

  router.post("/loads/:loadId/transition", (req: Request, res: Response) => {
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
    }

    res.status(result.accepted ? 200 : 409).json(result);
  });

  router.get("/shipments", (_req: Request, res: Response) => {
    res.json({ count: shipments.length, shipments });
  });

  router.get("/carriers", (_req: Request, res: Response) => {
    res.json({ count: carriers.length, carriers });
  });

  router.get("/lanes", (_req: Request, res: Response) => {
    res.json({ count: lanes.length, lanes });
  });

  router.get("/load-board/postings", (_req: Request, res: Response) => {
    res.json({ count: postings.length, postings });
  });

  router.get("/load-board/bids", (_req: Request, res: Response) => {
    const scoredBids = bids.map((bid) => {
      const load = loads.find((item) => item.loadId === bid.loadId);
      const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
      const posting = postings.find((item) => item.postingId === bid.postingId);
      const lane = load ? findLaneForLoad(load) : undefined;

      if (!load) return bid;
      return { ...bid, score: scoreBidMatch({ load, bid, carrier, lane, posting }) };
    });

    res.json({ count: scoredBids.length, bids: scoredBids });
  });

  router.get("/load-board/bids/:bidId/review", (req: Request, res: Response) => {
    const bid = bids.find((item) => item.bidId === req.params.bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    const load = loads.find((item) => item.loadId === bid.loadId);
    if (!load) return res.status(404).json({ error: "Load not found for bid" });

    const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
    const posting = postings.find((item) => item.postingId === bid.postingId);
    const lane = findLaneForLoad(load);
    const score = scoreBidMatch({ load, bid, carrier, lane, posting });
    const governanceSignal = score.governanceSignalRequired
      ? buildGovernanceSignalFromMatch({ load, bid, carrier, lane, posting }, score)
      : null;

    res.json({
      load,
      bid: { ...bid, score },
      carrier: carrier ?? null,
      lane: lane ?? null,
      posting: posting ?? null,
      governanceSignal,
    });
  });

  router.get("/matching/recommendations", (_req: Request, res: Response) => {
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

  router.get("/carrier-quotes/:loadId", (req: Request, res: Response) => {
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const provider = (req.query.provider as SilCarrierProvider | undefined) ?? "MOCK";
    const quotes = requestCarrierQuotes({ provider, load, carriers });
    res.json({ count: quotes.length, quotes });
  });

  router.get("/tracking/:shipmentId", (req: Request, res: Response) => {
    const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const provider = req.query.provider as SilCarrierProvider | undefined;
    const trackingUpdate = requestTrackingUpdate({ provider, shipment });
    res.json({ trackingUpdate });
  });

  router.get("/market-rates", (_req: Request, res: Response) => {
    res.json({ count: marketRates.length, marketRates });
  });

  router.get("/market-rates/analyze", (req: Request, res: Response) => {
    const load = loads.find((item) => item.loadId === req.query.loadId);
    if (!load) return res.status(404).json({ error: "Valid loadId query parameter is required" });

    const bid = req.query.bidId ? bids.find((item) => item.bidId === req.query.bidId) : undefined;
    const lane = findLaneForLoad(load);
    const analysis = analyzeMarketRate({ load, bid, lane, observations: marketRates });

    res.json({ analysis });
  });

  router.get("/governance-signals", (_req: Request, res: Response) => {
    const generatedSignals = buildGeneratedGovernanceSignals();
    const governanceSignals = generatedSignals.length > 0 ? generatedSignals : getGovernanceSignals();
    res.json({ count: governanceSignals.length, governanceSignals });
  });

  router.get("/workflow-events", (req: Request, res: Response) => {
    const events = listWorkflowEvents({
      loadId: req.query.loadId as string | undefined,
      shipmentId: req.query.shipmentId as string | undefined,
      bidId: req.query.bidId as string | undefined,
    });
    res.json({ count: events.length, events });
  });

  app.use("/api/shipment-intelligence", router);
}
