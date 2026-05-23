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
import { BidState, BrokerageLoadState, SilCarrierProvider, SilGovernanceSignalDraft } from "../services/shipmentIntelligence/types";
import {
  createSilBid,
  createSilLeanRecord,
  createSilLoad,
  createSilPosting,
  getSilWorkspace,
  listSilLeanRecords,
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
  updateSilBidCommercials,
  updateSilBidStatus,
  updateSilLoadStatus,
  updateSilShipmentProgress,
  upsertSilCarrier,
  upsertSilWorkspace,
} from "../services/shipmentIntelligence/silPersistenceService";

export function registerShipmentIntelligenceRoutes(app: Express) {
  const router = Router();
  seedWorkflowEvents();
  seedSilPersistence().catch((error) => {
    console.error("SIL persistence seed failed", error);
  });

  const requestWorkspaceId = (req: Request) =>
    (req.query.workspaceId as string | undefined) ?? (req.body?.workspaceId as string | undefined);

  const findLaneForLoad = async (load: Awaited<ReturnType<typeof listSilLoads>>[number]) => {
    const lanes = await listSilLanes({ workspaceId: load.workspaceId });
    return lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
  };

  const buildGeneratedGovernanceSignals = async (workspaceId?: string) => {
    const [bids, loads, carriers, postings] = await Promise.all([
      listSilBids({ workspaceId }),
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilPostings({ workspaceId }),
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

  router.get("/overview", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, postings, bids] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilBids({ workspaceId }),
    ]);
    const activeLoads = loads.filter((load) => !["CLOSED", "CANCELED"].includes(load.status)).length;
    const activePostings = postings.filter((posting) => posting.status === "POSTED").length;
    const openBids = bids.filter((bid) => ["RECEIVED", "SHORTLISTED"].includes(bid.status)).length;
    const governanceSignals = await buildGeneratedGovernanceSignals(workspaceId);

    res.json({
      activeLoads,
      activePostings,
      openBids,
      governanceSignalCount: governanceSignals.length,
      loadsAtRisk: governanceSignals.filter((signal) => ["HIGH", "CRITICAL"].includes(signal.severity)).length,
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/workspace", async (req: Request, res: Response) => {
    const workspace = await getSilWorkspace(req.query.workspace as string | undefined);
    res.json({ workspace });
  });

  router.put("/workspace", async (req: Request, res: Response) => {
    const required = ["organization", "workspaceName", "selectedProductIds", "modules"];
    const missing = required.filter((field) => req.body?.[field] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required workspace fields: ${missing.join(", ")}` });
    }

    const result = await upsertSilWorkspace(req.body);
    res.json(result);
  });

  router.get("/loads", async (req: Request, res: Response) => {
    const loads = await listSilLoads({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: loads.length, loads });
  });

  router.post("/loads", async (req: Request, res: Response) => {
    const required = ["customerId", "origin", "destination", "mode", "equipmentType"];
    const missing = required.filter((field) => req.body?.[field] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required load fields: ${missing.join(", ")}` });
    }

    const result = await createSilLoad({ ...req.body, workspaceId: requestWorkspaceId(req) });
    res.status(201).json(result);
  });

  router.get("/loads/:loadId", async (req: Request, res: Response) => {
    const [loads, postings, bids, carriers, lanes] = await Promise.all([
      listSilLoads({ workspaceId: requestWorkspaceId(req) }),
      listSilPostings({ workspaceId: requestWorkspaceId(req) }),
      listSilBids({ workspaceId: requestWorkspaceId(req) }),
      listSilCarriers({ workspaceId: requestWorkspaceId(req) }),
      listSilLanes({ workspaceId: requestWorkspaceId(req) }),
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
    const loads = await listSilLoads({ workspaceId: requestWorkspaceId(req) });
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    res.json({
      loadId: load.loadId,
      currentState: load.status,
      allowedTransitions: getAllowedLoadTransitions(load.status),
    });
  });

  router.post("/loads/:loadId/transition", async (req: Request, res: Response) => {
    const loads = await listSilLoads({ workspaceId: requestWorkspaceId(req) });
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
    await persistSilWorkflowEvent({ ...result.event, workspaceId: load.workspaceId });

    res.status(result.accepted ? 200 : 409).json(result);
  });

  router.get("/shipments", async (req: Request, res: Response) => {
    const shipments = await listSilShipments({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: shipments.length, shipments });
  });

  router.patch("/shipments/:shipmentId/progress", async (req: Request, res: Response) => {
    const result = await updateSilShipmentProgress({
      ...req.body,
      shipmentId: req.params.shipmentId,
      workspaceId: requestWorkspaceId(req),
    });
    if (!result) return res.status(404).json({ error: "Shipment not found" });
    res.json(result);
  });

  router.get("/carriers", async (req: Request, res: Response) => {
    const carriers = await listSilCarriers({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: carriers.length, carriers });
  });

  router.post("/carriers", async (req: Request, res: Response) => {
    if (!req.body?.carrierName) return res.status(400).json({ error: "carrierName is required" });
    const result = await upsertSilCarrier({ ...req.body, workspaceId: requestWorkspaceId(req) });
    res.status(201).json(result);
  });

  router.patch("/carriers/:carrierId", async (req: Request, res: Response) => {
    const carrier = (await listSilCarriers({ workspaceId: requestWorkspaceId(req) })).find(
      (item) => item.carrierId === req.params.carrierId
    );
    if (!carrier) return res.status(404).json({ error: "Carrier not found" });

    const result = await upsertSilCarrier({
      ...carrier,
      ...req.body,
      carrierId: carrier.carrierId,
      carrierName: req.body?.carrierName ?? carrier.carrierName,
      workspaceId: carrier.workspaceId,
    });
    res.json(result);
  });

  router.get("/lanes", async (req: Request, res: Response) => {
    const lanes = await listSilLanes({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: lanes.length, lanes });
  });

  router.get("/load-board/postings", async (req: Request, res: Response) => {
    const postings = await listSilPostings({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: postings.length, postings });
  });

  router.post("/load-board/postings", async (req: Request, res: Response) => {
    if (!req.body?.loadId) return res.status(400).json({ error: "loadId is required" });
    const load = (await listSilLoads({ workspaceId: requestWorkspaceId(req) })).find((item) => item.loadId === req.body.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const result = await createSilPosting({ ...req.body, workspaceId: requestWorkspaceId(req) });
    res.status(201).json(result);
  });

  router.get("/load-board/bids", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [bids, loads, carriers, postings, lanes] = await Promise.all([
      listSilBids({ workspaceId }),
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilLanes({ workspaceId }),
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

  router.post("/load-board/bids", async (req: Request, res: Response) => {
    const required = ["loadId", "carrierId", "bidRate"];
    const missing = required.filter((field) => req.body?.[field] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required bid fields: ${missing.join(", ")}` });
    }

    const workspaceId = requestWorkspaceId(req);
    const [loads, postings, carriers] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilCarriers({ workspaceId }),
    ]);
    if (!loads.some((load) => load.loadId === req.body.loadId)) return res.status(404).json({ error: "Load not found" });
    if (req.body.postingId && !postings.some((posting) => posting.postingId === req.body.postingId)) {
      return res.status(404).json({ error: "Posting not found" });
    }
    if (!carriers.some((carrier) => carrier.carrierId === req.body.carrierId)) {
      return res.status(404).json({ error: "Carrier not found" });
    }

    const result = await createSilBid({ ...req.body, workspaceId });
    res.status(201).json(result);
  });

  router.get("/load-board/bids/:bidId/review", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [bids, loads, carriers, postings, lanes] = await Promise.all([
      listSilBids({ workspaceId }),
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilLanes({ workspaceId }),
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

  router.patch("/load-board/bids/:bidId/commercials", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const bid = (await listSilBids({ workspaceId })).find((item) => item.bidId === req.params.bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    const result = await updateSilBidCommercials(req.params.bidId, {
      counterOfferRate:
        req.body?.counterOfferRate === undefined ? undefined : Number(req.body.counterOfferRate),
      counterOfferStatus: req.body?.counterOfferStatus,
      expiresAt: req.body?.expiresAt,
      message: req.body?.message,
      status: req.body?.status,
      actor: req.body?.actor,
      evidence: req.body?.evidence,
    });
    if (!result) return res.status(404).json({ error: "Bid not found" });
    res.json(result);
  });

  router.post("/load-board/bids/:bidId/decision", async (req: Request, res: Response) => {
    const decision = req.body?.decision as BidState | undefined;
    if (!decision || !["SHORTLISTED", "REJECTED", "AWARDED", "WITHDRAWN"].includes(decision)) {
      return res.status(400).json({ error: "decision must be SHORTLISTED, REJECTED, AWARDED, or WITHDRAWN" });
    }

    const workspaceId = requestWorkspaceId(req);
    const [bids, loads, carriers, postings, lanes] = await Promise.all([
      listSilBids({ workspaceId }),
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilLanes({ workspaceId }),
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
    const updatedBid = await updateSilBidStatus(bid.bidId, decision);
    const governanceSignal =
      decision === "AWARDED" && score.governanceSignalRequired
        ? buildGovernanceSignalFromMatch({ load, bid, carrier, lane, posting }, score)
        : null;
    if (governanceSignal) await persistSilGovernanceSignal(governanceSignal, "READY_FOR_ENCOMPAX");

    const event = await persistSilWorkflowEvent({
      eventId: `sil_evt_bid_decision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType: decision === "AWARDED" ? "CARRIER_AWARDED" : "BID_REVIEWED",
      occurredAt: new Date().toISOString(),
      actor: req.body?.actor ?? "operator",
      source: "USER",
      workspaceId: bid.workspaceId,
      loadId: bid.loadId,
      bidId: bid.bidId,
      carrierId: bid.carrierId,
      previousState: bid.status,
      nextState: decision,
      summary: `Bid ${bid.bidId} moved from ${bid.status} to ${decision}.`,
      evidence: [
        `Decision: ${decision}`,
        `Score: ${score.score}`,
        ...(Array.isArray(req.body?.evidence) ? req.body.evidence : score.evidence),
      ],
      governanceSignal: governanceSignal ?? undefined,
    });

    if (decision === "AWARDED") {
      await updateSilLoadStatus(load.loadId, "CARRIER_SELECTED");
    }

    res.json({ bid: updatedBid, score, governanceSignal, event });
  });

  router.get("/matching/recommendations", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, postings, bids, carriers, lanes] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilBids({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilLanes({ workspaceId }),
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
    const workspaceId = requestWorkspaceId(req);
    const [loads, carriers] = await Promise.all([listSilLoads({ workspaceId }), listSilCarriers({ workspaceId })]);
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const provider = (req.query.provider as SilCarrierProvider | undefined) ?? "MOCK";
    const quotes = requestCarrierQuotes({ provider, load, carriers });
    res.json({ count: quotes.length, quotes });
  });

  router.get("/tracking/:shipmentId", async (req: Request, res: Response) => {
    const shipments = await listSilShipments({ workspaceId: requestWorkspaceId(req) });
    const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const provider = req.query.provider as SilCarrierProvider | undefined;
    const trackingUpdate = requestTrackingUpdate({ provider, shipment });
    res.json({ trackingUpdate });
  });

  router.get("/market-rates", async (req: Request, res: Response) => {
    const marketRates = await listSilMarketRates({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: marketRates.length, marketRates });
  });

  router.get("/market-rates/analyze", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, bids, lanes, marketRates] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilBids({ workspaceId }),
      listSilLanes({ workspaceId }),
      listSilMarketRates({ workspaceId }),
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

  router.get("/governance-signals", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    await buildGeneratedGovernanceSignals(workspaceId);
    const persistedSignals = await listSilGovernanceSignals({ workspaceId });
    const governanceSignals = persistedSignals;
    res.json({ count: governanceSignals.length, governanceSignals });
  });

  router.get("/workflow-events", async (req: Request, res: Response) => {
    const memoryEvents = listWorkflowEvents({
      loadId: req.query.loadId as string | undefined,
      shipmentId: req.query.shipmentId as string | undefined,
      bidId: req.query.bidId as string | undefined,
      workspaceId: requestWorkspaceId(req),
    });
    await Promise.all(memoryEvents.map((event) => persistSilWorkflowEvent(event)));
    const events = await listPersistedWorkflowEvents({
      loadId: req.query.loadId as string | undefined,
      shipmentId: req.query.shipmentId as string | undefined,
      bidId: req.query.bidId as string | undefined,
      workspaceId: requestWorkspaceId(req),
    });
    res.json({ count: events.length, events });
  });

  router.get("/lean/templates", async (_req: Request, res: Response) => {
    const templates = await listSilLeanTemplates();
    res.json({ count: templates.length, templates });
  });

  router.get("/lean/records", async (req: Request, res: Response) => {
    const records = await listSilLeanRecords({
      organization: req.query.organization as string | undefined,
      templateId: req.query.templateId as string | undefined,
      status: req.query.status as string | undefined,
      workspaceId: requestWorkspaceId(req),
    });
    res.json({ count: records.length, records });
  });

  router.post("/lean/records", async (req: Request, res: Response) => {
    const required = ["templateId", "organization", "program"];
    const missing = required.filter((field) => req.body?.[field] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required LEAN record fields: ${missing.join(", ")}` });
    }

    const result = await createSilLeanRecord({ ...req.body, workspaceId: requestWorkspaceId(req) });
    res.status(201).json(result);
  });

  app.use("/api/shipment-intelligence", router);
}
