"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerShipmentIntelligenceRoutes = registerShipmentIntelligenceRoutes;
const express_1 = require("express");
const matchingEngine_1 = require("../services/shipmentIntelligence/matchingEngine");
const loadLifecycleService_1 = require("../services/shipmentIntelligence/loadLifecycleService");
const carrierProviderAdapter_1 = require("../services/shipmentIntelligence/carrierProviderAdapter");
const marketRateService_1 = require("../services/shipmentIntelligence/marketRateService");
const workflowEventService_1 = require("../services/shipmentIntelligence/workflowEventService");
const silPersistenceService_1 = require("../services/shipmentIntelligence/silPersistenceService");
function registerShipmentIntelligenceRoutes(app) {
    const router = (0, express_1.Router)();
    (0, workflowEventService_1.seedWorkflowEvents)();
    (0, silPersistenceService_1.seedSilPersistence)().catch((error) => {
        console.error("SIL persistence seed failed", error);
    });
    const findLaneForLoad = async (load) => {
        const lanes = await (0, silPersistenceService_1.listSilLanes)();
        return lanes.find((item) => item.originRegion === load.origin.state &&
            item.destinationRegion === load.destination.state &&
            item.mode === load.mode &&
            item.equipmentType === load.equipmentType);
    };
    const buildGeneratedGovernanceSignals = async () => {
        const [bids, loads, carriers, postings] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)(),
            (0, silPersistenceService_1.listSilLoads)(),
            (0, silPersistenceService_1.listSilCarriers)(),
            (0, silPersistenceService_1.listSilPostings)(),
        ]);
        const generatedSignals = await Promise.all(bids.map(async (bid) => {
            const load = loads.find((item) => item.loadId === bid.loadId);
            if (!load)
                return null;
            const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
            const posting = postings.find((item) => item.postingId === bid.postingId);
            const lane = await findLaneForLoad(load);
            const score = (0, matchingEngine_1.scoreBidMatch)({ load, bid, carrier, lane, posting });
            if (!score.governanceSignalRequired)
                return null;
            const signal = (0, matchingEngine_1.buildGovernanceSignalFromMatch)({ load, bid, carrier, lane, posting }, score);
            await (0, silPersistenceService_1.persistSilGovernanceSignal)(signal);
            return signal;
        }));
        return generatedSignals.filter((signal) => Boolean(signal));
    };
    router.get("/overview", async (_req, res) => {
        const [loads, postings, bids] = await Promise.all([(0, silPersistenceService_1.listSilLoads)(), (0, silPersistenceService_1.listSilPostings)(), (0, silPersistenceService_1.listSilBids)()]);
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
    router.get("/loads", async (_req, res) => {
        const loads = await (0, silPersistenceService_1.listSilLoads)();
        res.json({ count: loads.length, loads });
    });
    router.get("/loads/:loadId", async (req, res) => {
        var _a;
        const [loads, postings, bids, carriers, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)(),
            (0, silPersistenceService_1.listSilPostings)(),
            (0, silPersistenceService_1.listSilBids)(),
            (0, silPersistenceService_1.listSilCarriers)(),
            (0, silPersistenceService_1.listSilLanes)(),
        ]);
        const load = loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const posting = postings.find((item) => item.loadId === load.loadId);
        const recommendations = (0, matchingEngine_1.buildLoadRecommendations)({
            load,
            posting,
            bids,
            carriers,
            lanes,
        });
        res.json({
            load,
            posting: posting !== null && posting !== void 0 ? posting : null,
            bids: recommendations,
            allowedTransitions: (0, loadLifecycleService_1.getAllowedLoadTransitions)(load.status),
            lane: (_a = lanes.find((item) => item.originRegion === load.origin.state &&
                item.destinationRegion === load.destination.state &&
                item.mode === load.mode &&
                item.equipmentType === load.equipmentType)) !== null && _a !== void 0 ? _a : null,
        });
    });
    router.get("/loads/:loadId/transitions", async (req, res) => {
        const loads = await (0, silPersistenceService_1.listSilLoads)();
        const load = loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        res.json({
            loadId: load.loadId,
            currentState: load.status,
            allowedTransitions: (0, loadLifecycleService_1.getAllowedLoadTransitions)(load.status),
        });
    });
    router.post("/loads/:loadId/transition", async (req, res) => {
        var _a, _b, _c, _d;
        const loads = await (0, silPersistenceService_1.listSilLoads)();
        const load = loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const nextState = (_a = req.body) === null || _a === void 0 ? void 0 : _a.nextState;
        if (!nextState)
            return res.status(400).json({ error: "nextState is required" });
        const result = (0, loadLifecycleService_1.transitionLoadState)({
            load,
            nextState,
            actor: (_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.actor) !== null && _c !== void 0 ? _c : "operator",
            evidence: Array.isArray((_d = req.body) === null || _d === void 0 ? void 0 : _d.evidence) ? req.body.evidence : undefined,
        });
        if (result.accepted) {
            load.status = result.nextState;
            await (0, silPersistenceService_1.updateSilLoadStatus)(load.loadId, result.nextState);
        }
        await (0, silPersistenceService_1.persistSilWorkflowEvent)(result.event);
        res.status(result.accepted ? 200 : 409).json(result);
    });
    router.get("/shipments", async (_req, res) => {
        const shipments = await (0, silPersistenceService_1.listSilShipments)();
        res.json({ count: shipments.length, shipments });
    });
    router.get("/carriers", async (_req, res) => {
        const carriers = await (0, silPersistenceService_1.listSilCarriers)();
        res.json({ count: carriers.length, carriers });
    });
    router.get("/lanes", async (_req, res) => {
        const lanes = await (0, silPersistenceService_1.listSilLanes)();
        res.json({ count: lanes.length, lanes });
    });
    router.get("/load-board/postings", async (_req, res) => {
        const postings = await (0, silPersistenceService_1.listSilPostings)();
        res.json({ count: postings.length, postings });
    });
    router.get("/load-board/bids", async (_req, res) => {
        const [bids, loads, carriers, postings, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)(),
            (0, silPersistenceService_1.listSilLoads)(),
            (0, silPersistenceService_1.listSilCarriers)(),
            (0, silPersistenceService_1.listSilPostings)(),
            (0, silPersistenceService_1.listSilLanes)(),
        ]);
        const scoredBids = bids.map((bid) => {
            const load = loads.find((item) => item.loadId === bid.loadId);
            const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
            const posting = postings.find((item) => item.postingId === bid.postingId);
            const lane = load
                ? lanes.find((item) => item.originRegion === load.origin.state &&
                    item.destinationRegion === load.destination.state &&
                    item.mode === load.mode &&
                    item.equipmentType === load.equipmentType)
                : undefined;
            if (!load)
                return bid;
            return { ...bid, score: (0, matchingEngine_1.scoreBidMatch)({ load, bid, carrier, lane, posting }) };
        });
        res.json({ count: scoredBids.length, bids: scoredBids });
    });
    router.get("/load-board/bids/:bidId/review", async (req, res) => {
        const [bids, loads, carriers, postings, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)(),
            (0, silPersistenceService_1.listSilLoads)(),
            (0, silPersistenceService_1.listSilCarriers)(),
            (0, silPersistenceService_1.listSilPostings)(),
            (0, silPersistenceService_1.listSilLanes)(),
        ]);
        const bid = bids.find((item) => item.bidId === req.params.bidId);
        if (!bid)
            return res.status(404).json({ error: "Bid not found" });
        const load = loads.find((item) => item.loadId === bid.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found for bid" });
        const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
        const posting = postings.find((item) => item.postingId === bid.postingId);
        const lane = lanes.find((item) => item.originRegion === load.origin.state &&
            item.destinationRegion === load.destination.state &&
            item.mode === load.mode &&
            item.equipmentType === load.equipmentType);
        const score = (0, matchingEngine_1.scoreBidMatch)({ load, bid, carrier, lane, posting });
        const governanceSignal = score.governanceSignalRequired
            ? (0, matchingEngine_1.buildGovernanceSignalFromMatch)({ load, bid, carrier, lane, posting }, score)
            : null;
        if (governanceSignal)
            await (0, silPersistenceService_1.persistSilGovernanceSignal)(governanceSignal);
        res.json({
            load,
            bid: { ...bid, score },
            carrier: carrier !== null && carrier !== void 0 ? carrier : null,
            lane: lane !== null && lane !== void 0 ? lane : null,
            posting: posting !== null && posting !== void 0 ? posting : null,
            governanceSignal,
        });
    });
    router.get("/matching/recommendations", async (_req, res) => {
        const [loads, postings, bids, carriers, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)(),
            (0, silPersistenceService_1.listSilPostings)(),
            (0, silPersistenceService_1.listSilBids)(),
            (0, silPersistenceService_1.listSilCarriers)(),
            (0, silPersistenceService_1.listSilLanes)(),
        ]);
        const recommendations = loads.map((load) => {
            const posting = postings.find((item) => item.loadId === load.loadId);
            return {
                load,
                posting: posting !== null && posting !== void 0 ? posting : null,
                bids: (0, matchingEngine_1.buildLoadRecommendations)({ load, posting, bids, carriers, lanes }),
            };
        });
        res.json({ count: recommendations.length, recommendations });
    });
    router.get("/carrier-quotes/:loadId", async (req, res) => {
        var _a;
        const [loads, carriers] = await Promise.all([(0, silPersistenceService_1.listSilLoads)(), (0, silPersistenceService_1.listSilCarriers)()]);
        const load = loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const provider = (_a = req.query.provider) !== null && _a !== void 0 ? _a : "MOCK";
        const quotes = (0, carrierProviderAdapter_1.requestCarrierQuotes)({ provider, load, carriers });
        res.json({ count: quotes.length, quotes });
    });
    router.get("/tracking/:shipmentId", async (req, res) => {
        const shipments = await (0, silPersistenceService_1.listSilShipments)();
        const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
        if (!shipment)
            return res.status(404).json({ error: "Shipment not found" });
        const provider = req.query.provider;
        const trackingUpdate = (0, carrierProviderAdapter_1.requestTrackingUpdate)({ provider, shipment });
        res.json({ trackingUpdate });
    });
    router.get("/market-rates", async (_req, res) => {
        const marketRates = await (0, silPersistenceService_1.listSilMarketRates)();
        res.json({ count: marketRates.length, marketRates });
    });
    router.get("/market-rates/analyze", async (req, res) => {
        const [loads, bids, lanes, marketRates] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)(),
            (0, silPersistenceService_1.listSilBids)(),
            (0, silPersistenceService_1.listSilLanes)(),
            (0, silPersistenceService_1.listSilMarketRates)(),
        ]);
        const load = loads.find((item) => item.loadId === req.query.loadId);
        if (!load)
            return res.status(404).json({ error: "Valid loadId query parameter is required" });
        const bid = req.query.bidId ? bids.find((item) => item.bidId === req.query.bidId) : undefined;
        const lane = lanes.find((item) => item.originRegion === load.origin.state &&
            item.destinationRegion === load.destination.state &&
            item.mode === load.mode &&
            item.equipmentType === load.equipmentType);
        const analysis = (0, marketRateService_1.analyzeMarketRate)({ load, bid, lane, observations: marketRates });
        if (analysis.governanceSignal)
            await (0, silPersistenceService_1.persistSilGovernanceSignal)(analysis.governanceSignal);
        res.json({ analysis });
    });
    router.get("/governance-signals", async (_req, res) => {
        await buildGeneratedGovernanceSignals();
        const persistedSignals = await (0, silPersistenceService_1.listSilGovernanceSignals)();
        const governanceSignals = persistedSignals;
        res.json({ count: governanceSignals.length, governanceSignals });
    });
    router.get("/workflow-events", async (req, res) => {
        const memoryEvents = (0, workflowEventService_1.listWorkflowEvents)({
            loadId: req.query.loadId,
            shipmentId: req.query.shipmentId,
            bidId: req.query.bidId,
        });
        await Promise.all(memoryEvents.map((event) => (0, silPersistenceService_1.persistSilWorkflowEvent)(event)));
        const events = await (0, silPersistenceService_1.listPersistedWorkflowEvents)({
            loadId: req.query.loadId,
            shipmentId: req.query.shipmentId,
            bidId: req.query.bidId,
        });
        res.json({ count: events.length, events });
    });
    router.get("/lean/templates", async (_req, res) => {
        const templates = await (0, silPersistenceService_1.listSilLeanTemplates)();
        res.json({ count: templates.length, templates });
    });
    app.use("/api/shipment-intelligence", router);
}
