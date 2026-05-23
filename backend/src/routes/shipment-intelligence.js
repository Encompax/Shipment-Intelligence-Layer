"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerShipmentIntelligenceRoutes = registerShipmentIntelligenceRoutes;
const express_1 = require("express");
const mockData_1 = require("../services/shipmentIntelligence/mockData");
const matchingEngine_1 = require("../services/shipmentIntelligence/matchingEngine");
const loadLifecycleService_1 = require("../services/shipmentIntelligence/loadLifecycleService");
const carrierProviderAdapter_1 = require("../services/shipmentIntelligence/carrierProviderAdapter");
const marketRateService_1 = require("../services/shipmentIntelligence/marketRateService");
const workflowEventService_1 = require("../services/shipmentIntelligence/workflowEventService");
function registerShipmentIntelligenceRoutes(app) {
    const router = (0, express_1.Router)();
    (0, workflowEventService_1.seedWorkflowEvents)();
    const findLaneForLoad = (load) => mockData_1.lanes.find((item) => item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType);
    const buildGeneratedGovernanceSignals = () => mockData_1.bids.flatMap((bid) => {
        const load = mockData_1.loads.find((item) => item.loadId === bid.loadId);
        if (!load)
            return [];
        const carrier = mockData_1.carriers.find((item) => item.carrierId === bid.carrierId);
        const posting = mockData_1.postings.find((item) => item.postingId === bid.postingId);
        const lane = findLaneForLoad(load);
        const score = (0, matchingEngine_1.scoreBidMatch)({ load, bid, carrier, lane, posting });
        return score.governanceSignalRequired
            ? [(0, matchingEngine_1.buildGovernanceSignalFromMatch)({ load, bid, carrier, lane, posting }, score)]
            : [];
    });
    router.get("/overview", (_req, res) => {
        const activeLoads = mockData_1.loads.filter((load) => !["CLOSED", "CANCELED"].includes(load.status)).length;
        const activePostings = mockData_1.postings.filter((posting) => posting.status === "POSTED").length;
        const openBids = mockData_1.bids.filter((bid) => ["RECEIVED", "SHORTLISTED"].includes(bid.status)).length;
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
    router.get("/loads", (_req, res) => {
        res.json({ count: mockData_1.loads.length, loads: mockData_1.loads });
    });
    router.get("/loads/:loadId", (req, res) => {
        var _a;
        const load = mockData_1.loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const posting = mockData_1.postings.find((item) => item.loadId === load.loadId);
        const recommendations = (0, matchingEngine_1.buildLoadRecommendations)({
            load,
            posting,
            bids: mockData_1.bids,
            carriers: mockData_1.carriers,
            lanes: mockData_1.lanes,
        });
        res.json({
            load,
            posting: posting !== null && posting !== void 0 ? posting : null,
            bids: recommendations,
            allowedTransitions: (0, loadLifecycleService_1.getAllowedLoadTransitions)(load.status),
            lane: (_a = findLaneForLoad(load)) !== null && _a !== void 0 ? _a : null,
        });
    });
    router.get("/loads/:loadId/transitions", (req, res) => {
        const load = mockData_1.loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        res.json({
            loadId: load.loadId,
            currentState: load.status,
            allowedTransitions: (0, loadLifecycleService_1.getAllowedLoadTransitions)(load.status),
        });
    });
    router.post("/loads/:loadId/transition", (req, res) => {
        var _a, _b, _c, _d;
        const load = mockData_1.loads.find((item) => item.loadId === req.params.loadId);
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
        }
        res.status(result.accepted ? 200 : 409).json(result);
    });
    router.get("/shipments", (_req, res) => {
        res.json({ count: mockData_1.shipments.length, shipments: mockData_1.shipments });
    });
    router.get("/carriers", (_req, res) => {
        res.json({ count: mockData_1.carriers.length, carriers: mockData_1.carriers });
    });
    router.get("/lanes", (_req, res) => {
        res.json({ count: mockData_1.lanes.length, lanes: mockData_1.lanes });
    });
    router.get("/load-board/postings", (_req, res) => {
        res.json({ count: mockData_1.postings.length, postings: mockData_1.postings });
    });
    router.get("/load-board/bids", (_req, res) => {
        const scoredBids = mockData_1.bids.map((bid) => {
            const load = mockData_1.loads.find((item) => item.loadId === bid.loadId);
            const carrier = mockData_1.carriers.find((item) => item.carrierId === bid.carrierId);
            const posting = mockData_1.postings.find((item) => item.postingId === bid.postingId);
            const lane = load ? findLaneForLoad(load) : undefined;
            if (!load)
                return bid;
            return { ...bid, score: (0, matchingEngine_1.scoreBidMatch)({ load, bid, carrier, lane, posting }) };
        });
        res.json({ count: scoredBids.length, bids: scoredBids });
    });
    router.get("/load-board/bids/:bidId/review", (req, res) => {
        const bid = mockData_1.bids.find((item) => item.bidId === req.params.bidId);
        if (!bid)
            return res.status(404).json({ error: "Bid not found" });
        const load = mockData_1.loads.find((item) => item.loadId === bid.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found for bid" });
        const carrier = mockData_1.carriers.find((item) => item.carrierId === bid.carrierId);
        const posting = mockData_1.postings.find((item) => item.postingId === bid.postingId);
        const lane = findLaneForLoad(load);
        const score = (0, matchingEngine_1.scoreBidMatch)({ load, bid, carrier, lane, posting });
        const governanceSignal = score.governanceSignalRequired
            ? (0, matchingEngine_1.buildGovernanceSignalFromMatch)({ load, bid, carrier, lane, posting }, score)
            : null;
        res.json({
            load,
            bid: { ...bid, score },
            carrier: carrier !== null && carrier !== void 0 ? carrier : null,
            lane: lane !== null && lane !== void 0 ? lane : null,
            posting: posting !== null && posting !== void 0 ? posting : null,
            governanceSignal,
        });
    });
    router.get("/matching/recommendations", (_req, res) => {
        const recommendations = mockData_1.loads.map((load) => {
            const posting = mockData_1.postings.find((item) => item.loadId === load.loadId);
            return {
                load,
                posting: posting !== null && posting !== void 0 ? posting : null,
                bids: (0, matchingEngine_1.buildLoadRecommendations)({ load, posting, bids: mockData_1.bids, carriers: mockData_1.carriers, lanes: mockData_1.lanes }),
            };
        });
        res.json({ count: recommendations.length, recommendations });
    });
    router.get("/carrier-quotes/:loadId", (req, res) => {
        var _a;
        const load = mockData_1.loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const provider = (_a = req.query.provider) !== null && _a !== void 0 ? _a : "MOCK";
        const quotes = (0, carrierProviderAdapter_1.requestCarrierQuotes)({ provider, load, carriers: mockData_1.carriers });
        res.json({ count: quotes.length, quotes });
    });
    router.get("/tracking/:shipmentId", (req, res) => {
        const shipment = mockData_1.shipments.find((item) => item.shipmentId === req.params.shipmentId);
        if (!shipment)
            return res.status(404).json({ error: "Shipment not found" });
        const provider = req.query.provider;
        const trackingUpdate = (0, carrierProviderAdapter_1.requestTrackingUpdate)({ provider, shipment });
        res.json({ trackingUpdate });
    });
    router.get("/market-rates", (_req, res) => {
        res.json({ count: mockData_1.marketRates.length, marketRates: mockData_1.marketRates });
    });
    router.get("/market-rates/analyze", (req, res) => {
        const load = mockData_1.loads.find((item) => item.loadId === req.query.loadId);
        if (!load)
            return res.status(404).json({ error: "Valid loadId query parameter is required" });
        const bid = req.query.bidId ? mockData_1.bids.find((item) => item.bidId === req.query.bidId) : undefined;
        const lane = findLaneForLoad(load);
        const analysis = (0, marketRateService_1.analyzeMarketRate)({ load, bid, lane, observations: mockData_1.marketRates });
        res.json({ analysis });
    });
    router.get("/governance-signals", (_req, res) => {
        const generatedSignals = buildGeneratedGovernanceSignals();
        const governanceSignals = generatedSignals.length > 0 ? generatedSignals : (0, mockData_1.getGovernanceSignals)();
        res.json({ count: governanceSignals.length, governanceSignals });
    });
    router.get("/workflow-events", (req, res) => {
        const events = (0, workflowEventService_1.listWorkflowEvents)({
            loadId: req.query.loadId,
            shipmentId: req.query.shipmentId,
            bidId: req.query.bidId,
        });
        res.json({ count: events.length, events });
    });
    app.use("/api/shipment-intelligence", router);
}
