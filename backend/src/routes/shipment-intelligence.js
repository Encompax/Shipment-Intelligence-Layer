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
    const requestWorkspaceId = (req) => { var _a, _b; return (_a = req.query.workspaceId) !== null && _a !== void 0 ? _a : (_b = req.body) === null || _b === void 0 ? void 0 : _b.workspaceId; };
    const findLaneForLoad = async (load) => {
        const lanes = await (0, silPersistenceService_1.listSilLanes)({ workspaceId: load.workspaceId });
        return lanes.find((item) => item.originRegion === load.origin.state &&
            item.destinationRegion === load.destination.state &&
            item.mode === load.mode &&
            item.equipmentType === load.equipmentType);
    };
    const buildGeneratedGovernanceSignals = async (workspaceId) => {
        const [bids, loads, carriers, postings] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
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
    router.get("/overview", async (req, res) => {
        const workspaceId = requestWorkspaceId(req);
        const [loads, postings, bids] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
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
    router.get("/workspace", async (req, res) => {
        const workspace = await (0, silPersistenceService_1.getSilWorkspace)(req.query.workspace);
        res.json({ workspace });
    });
    router.put("/workspace", async (req, res) => {
        const required = ["organization", "workspaceName", "selectedProductIds", "modules"];
        const missing = required.filter((field) => { var _a; return ((_a = req.body) === null || _a === void 0 ? void 0 : _a[field]) === undefined; });
        if (missing.length > 0) {
            return res.status(400).json({ error: `Missing required workspace fields: ${missing.join(", ")}` });
        }
        const result = await (0, silPersistenceService_1.upsertSilWorkspace)(req.body);
        res.json(result);
    });
    router.get("/loads", async (req, res) => {
        const loads = await (0, silPersistenceService_1.listSilLoads)({ workspaceId: requestWorkspaceId(req) });
        res.json({ count: loads.length, loads });
    });
    router.post("/loads", async (req, res) => {
        const required = ["customerId", "origin", "destination", "mode", "equipmentType"];
        const missing = required.filter((field) => { var _a; return ((_a = req.body) === null || _a === void 0 ? void 0 : _a[field]) === undefined; });
        if (missing.length > 0) {
            return res.status(400).json({ error: `Missing required load fields: ${missing.join(", ")}` });
        }
        const result = await (0, silPersistenceService_1.createSilLoad)({ ...req.body, workspaceId: requestWorkspaceId(req) });
        res.status(201).json(result);
    });
    router.get("/loads/:loadId", async (req, res) => {
        var _a;
        const [loads, postings, bids, carriers, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)({ workspaceId: requestWorkspaceId(req) }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId: requestWorkspaceId(req) }),
            (0, silPersistenceService_1.listSilBids)({ workspaceId: requestWorkspaceId(req) }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId: requestWorkspaceId(req) }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId: requestWorkspaceId(req) }),
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
        const loads = await (0, silPersistenceService_1.listSilLoads)({ workspaceId: requestWorkspaceId(req) });
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
        const loads = await (0, silPersistenceService_1.listSilLoads)({ workspaceId: requestWorkspaceId(req) });
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
        await (0, silPersistenceService_1.persistSilWorkflowEvent)({ ...result.event, workspaceId: load.workspaceId });
        res.status(result.accepted ? 200 : 409).json(result);
    });
    router.get("/shipments", async (req, res) => {
        const shipments = await (0, silPersistenceService_1.listSilShipments)({ workspaceId: requestWorkspaceId(req) });
        res.json({ count: shipments.length, shipments });
    });
    router.patch("/shipments/:shipmentId/progress", async (req, res) => {
        const result = await (0, silPersistenceService_1.updateSilShipmentProgress)({
            ...req.body,
            shipmentId: req.params.shipmentId,
            workspaceId: requestWorkspaceId(req),
        });
        if (!result)
            return res.status(404).json({ error: "Shipment not found" });
        res.json(result);
    });
    router.get("/carriers", async (req, res) => {
        const carriers = await (0, silPersistenceService_1.listSilCarriers)({ workspaceId: requestWorkspaceId(req) });
        res.json({ count: carriers.length, carriers });
    });
    router.post("/carriers", async (req, res) => {
        var _a;
        if (!((_a = req.body) === null || _a === void 0 ? void 0 : _a.carrierName))
            return res.status(400).json({ error: "carrierName is required" });
        const result = await (0, silPersistenceService_1.upsertSilCarrier)({ ...req.body, workspaceId: requestWorkspaceId(req) });
        res.status(201).json(result);
    });
    router.patch("/carriers/:carrierId", async (req, res) => {
        var _a, _b;
        const carrier = (await (0, silPersistenceService_1.listSilCarriers)({ workspaceId: requestWorkspaceId(req) })).find((item) => item.carrierId === req.params.carrierId);
        if (!carrier)
            return res.status(404).json({ error: "Carrier not found" });
        const result = await (0, silPersistenceService_1.upsertSilCarrier)({
            ...carrier,
            ...req.body,
            carrierId: carrier.carrierId,
            carrierName: (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.carrierName) !== null && _b !== void 0 ? _b : carrier.carrierName,
            workspaceId: carrier.workspaceId,
        });
        res.json(result);
    });
    router.get("/lanes", async (req, res) => {
        const lanes = await (0, silPersistenceService_1.listSilLanes)({ workspaceId: requestWorkspaceId(req) });
        res.json({ count: lanes.length, lanes });
    });
    router.get("/load-board/postings", async (req, res) => {
        const postings = await (0, silPersistenceService_1.listSilPostings)({ workspaceId: requestWorkspaceId(req) });
        res.json({ count: postings.length, postings });
    });
    router.post("/load-board/postings", async (req, res) => {
        var _a;
        if (!((_a = req.body) === null || _a === void 0 ? void 0 : _a.loadId))
            return res.status(400).json({ error: "loadId is required" });
        const load = (await (0, silPersistenceService_1.listSilLoads)({ workspaceId: requestWorkspaceId(req) })).find((item) => item.loadId === req.body.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const result = await (0, silPersistenceService_1.createSilPosting)({ ...req.body, workspaceId: requestWorkspaceId(req) });
        res.status(201).json(result);
    });
    router.get("/load-board/bids", async (req, res) => {
        const workspaceId = requestWorkspaceId(req);
        const [bids, loads, carriers, postings, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
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
    router.post("/load-board/bids", async (req, res) => {
        const required = ["loadId", "carrierId", "bidRate"];
        const missing = required.filter((field) => { var _a; return ((_a = req.body) === null || _a === void 0 ? void 0 : _a[field]) === undefined; });
        if (missing.length > 0) {
            return res.status(400).json({ error: `Missing required bid fields: ${missing.join(", ")}` });
        }
        const workspaceId = requestWorkspaceId(req);
        const [loads, postings, carriers] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
        ]);
        if (!loads.some((load) => load.loadId === req.body.loadId))
            return res.status(404).json({ error: "Load not found" });
        if (req.body.postingId && !postings.some((posting) => posting.postingId === req.body.postingId)) {
            return res.status(404).json({ error: "Posting not found" });
        }
        if (!carriers.some((carrier) => carrier.carrierId === req.body.carrierId)) {
            return res.status(404).json({ error: "Carrier not found" });
        }
        const result = await (0, silPersistenceService_1.createSilBid)({ ...req.body, workspaceId });
        res.status(201).json(result);
    });
    router.get("/load-board/bids/:bidId/review", async (req, res) => {
        const workspaceId = requestWorkspaceId(req);
        const [bids, loads, carriers, postings, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
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
    router.post("/load-board/bids/:bidId/decision", async (req, res) => {
        var _a, _b, _c, _d;
        const decision = (_a = req.body) === null || _a === void 0 ? void 0 : _a.decision;
        if (!decision || !["SHORTLISTED", "REJECTED", "AWARDED", "WITHDRAWN"].includes(decision)) {
            return res.status(400).json({ error: "decision must be SHORTLISTED, REJECTED, AWARDED, or WITHDRAWN" });
        }
        const workspaceId = requestWorkspaceId(req);
        const [bids, loads, carriers, postings, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
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
        const updatedBid = await (0, silPersistenceService_1.updateSilBidStatus)(bid.bidId, decision);
        const governanceSignal = decision === "AWARDED" && score.governanceSignalRequired
            ? (0, matchingEngine_1.buildGovernanceSignalFromMatch)({ load, bid, carrier, lane, posting }, score)
            : null;
        if (governanceSignal)
            await (0, silPersistenceService_1.persistSilGovernanceSignal)(governanceSignal, "READY_FOR_ENCOMPAX");
        const event = await (0, silPersistenceService_1.persistSilWorkflowEvent)({
            eventId: `sil_evt_bid_decision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            eventType: decision === "AWARDED" ? "CARRIER_AWARDED" : "BID_REVIEWED",
            occurredAt: new Date().toISOString(),
            actor: (_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.actor) !== null && _c !== void 0 ? _c : "operator",
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
                ...(Array.isArray((_d = req.body) === null || _d === void 0 ? void 0 : _d.evidence) ? req.body.evidence : score.evidence),
            ],
            governanceSignal: governanceSignal !== null && governanceSignal !== void 0 ? governanceSignal : undefined,
        });
        if (decision === "AWARDED") {
            await (0, silPersistenceService_1.updateSilLoadStatus)(load.loadId, "CARRIER_SELECTED");
        }
        res.json({ bid: updatedBid, score, governanceSignal, event });
    });
    router.get("/matching/recommendations", async (req, res) => {
        const workspaceId = requestWorkspaceId(req);
        const [loads, postings, bids, carriers, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
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
        const workspaceId = requestWorkspaceId(req);
        const [loads, carriers] = await Promise.all([(0, silPersistenceService_1.listSilLoads)({ workspaceId }), (0, silPersistenceService_1.listSilCarriers)({ workspaceId })]);
        const load = loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const provider = (_a = req.query.provider) !== null && _a !== void 0 ? _a : "MOCK";
        const quotes = (0, carrierProviderAdapter_1.requestCarrierQuotes)({ provider, load, carriers });
        res.json({ count: quotes.length, quotes });
    });
    router.get("/tracking/:shipmentId", async (req, res) => {
        const shipments = await (0, silPersistenceService_1.listSilShipments)({ workspaceId: requestWorkspaceId(req) });
        const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
        if (!shipment)
            return res.status(404).json({ error: "Shipment not found" });
        const provider = req.query.provider;
        const trackingUpdate = (0, carrierProviderAdapter_1.requestTrackingUpdate)({ provider, shipment });
        res.json({ trackingUpdate });
    });
    router.get("/market-rates", async (req, res) => {
        const marketRates = await (0, silPersistenceService_1.listSilMarketRates)({ workspaceId: requestWorkspaceId(req) });
        res.json({ count: marketRates.length, marketRates });
    });
    router.get("/market-rates/analyze", async (req, res) => {
        const workspaceId = requestWorkspaceId(req);
        const [loads, bids, lanes, marketRates] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
            (0, silPersistenceService_1.listSilMarketRates)({ workspaceId }),
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
    router.get("/governance-signals", async (req, res) => {
        const workspaceId = requestWorkspaceId(req);
        await buildGeneratedGovernanceSignals(workspaceId);
        const persistedSignals = await (0, silPersistenceService_1.listSilGovernanceSignals)({ workspaceId });
        const governanceSignals = persistedSignals;
        res.json({ count: governanceSignals.length, governanceSignals });
    });
    router.get("/workflow-events", async (req, res) => {
        const memoryEvents = (0, workflowEventService_1.listWorkflowEvents)({
            loadId: req.query.loadId,
            shipmentId: req.query.shipmentId,
            bidId: req.query.bidId,
            workspaceId: requestWorkspaceId(req),
        });
        await Promise.all(memoryEvents.map((event) => (0, silPersistenceService_1.persistSilWorkflowEvent)(event)));
        const events = await (0, silPersistenceService_1.listPersistedWorkflowEvents)({
            loadId: req.query.loadId,
            shipmentId: req.query.shipmentId,
            bidId: req.query.bidId,
            workspaceId: requestWorkspaceId(req),
        });
        res.json({ count: events.length, events });
    });
    router.get("/lean/templates", async (_req, res) => {
        const templates = await (0, silPersistenceService_1.listSilLeanTemplates)();
        res.json({ count: templates.length, templates });
    });
    router.get("/lean/records", async (req, res) => {
        const records = await (0, silPersistenceService_1.listSilLeanRecords)({
            organization: req.query.organization,
            templateId: req.query.templateId,
            status: req.query.status,
            workspaceId: requestWorkspaceId(req),
        });
        res.json({ count: records.length, records });
    });
    router.post("/lean/records", async (req, res) => {
        const required = ["templateId", "organization", "program"];
        const missing = required.filter((field) => { var _a; return ((_a = req.body) === null || _a === void 0 ? void 0 : _a[field]) === undefined; });
        if (missing.length > 0) {
            return res.status(400).json({ error: `Missing required LEAN record fields: ${missing.join(", ")}` });
        }
        const result = await (0, silPersistenceService_1.createSilLeanRecord)({ ...req.body, workspaceId: requestWorkspaceId(req) });
        res.status(201).json(result);
    });
    app.use("/api/shipment-intelligence", router);
}
