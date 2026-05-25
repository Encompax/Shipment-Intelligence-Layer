"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerShipmentIntelligenceRoutes = registerShipmentIntelligenceRoutes;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("../lib/config");
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
    const readinessOverrideError = (body) => {
        var _a, _b;
        if (!(body === null || body === void 0 ? void 0 : body.overrideReadiness))
            return null;
        const actorRole = String((_a = body.actorRole) !== null && _a !== void 0 ? _a : "").toUpperCase();
        const reason = String((_b = body.overrideReason) !== null && _b !== void 0 ? _b : "").trim();
        const evidence = Array.isArray(body.evidence) ? body.evidence.filter(Boolean) : [];
        if (!["ADMIN", "OPERATIONS_MANAGER", "ENTERPRISE_OPERATOR"].includes(actorRole)) {
            return "Dispatch readiness override requires ADMIN, OPERATIONS_MANAGER, or ENTERPRISE_OPERATOR actorRole.";
        }
        if (reason.length < 12) {
            return "Dispatch readiness override requires a reason of at least 12 characters.";
        }
        if (evidence.length === 0) {
            return "Dispatch readiness override requires at least one evidence entry.";
        }
        return null;
    };
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
    router.get("/appointments/calendar", async (req, res) => {
        const appointments = await (0, silPersistenceService_1.listSilAppointmentCalendar)({
            workspaceId: requestWorkspaceId(req),
            from: req.query.from,
            to: req.query.to,
        });
        res.json({ count: appointments.length, appointments });
    });
    router.patch("/shipments/:shipmentId/stops/:stopId/appointment", async (req, res) => {
        var _a, _b, _c, _d, _e, _f;
        const result = await (0, silPersistenceService_1.updateSilStopAppointment)({
            shipmentId: req.params.shipmentId,
            stopId: req.params.stopId,
            workspaceId: requestWorkspaceId(req),
            appointmentStart: (_a = req.body) === null || _a === void 0 ? void 0 : _a.appointmentStart,
            appointmentEnd: (_b = req.body) === null || _b === void 0 ? void 0 : _b.appointmentEnd,
            dockDoor: (_c = req.body) === null || _c === void 0 ? void 0 : _c.dockDoor,
            appointmentStatus: (_d = req.body) === null || _d === void 0 ? void 0 : _d.appointmentStatus,
            actor: (_e = req.body) === null || _e === void 0 ? void 0 : _e.actor,
            evidence: Array.isArray((_f = req.body) === null || _f === void 0 ? void 0 : _f.evidence) ? req.body.evidence : undefined,
        });
        if (!result)
            return res.status(404).json({ error: "Shipment stop not found" });
        res.json(result);
    });
    router.get("/shipments/:shipmentId/documents", async (req, res) => {
        const documents = await (0, silPersistenceService_1.listSilShipmentDocuments)({
            workspaceId: requestWorkspaceId(req),
            shipmentId: req.params.shipmentId,
        });
        const podPacket = documents.filter((document) => ["POD", "BOL", "LUMPER_RECEIPT", "DETENTION_EVIDENCE"].includes(document.documentType));
        res.json({
            count: documents.length,
            podPacketCount: podPacket.length,
            podReady: documents.some((document) => document.documentType === "POD" && document.status !== "REJECTED"),
            documents,
        });
    });
    router.post("/shipments/:shipmentId/documents", async (req, res) => {
        var _a, _b, _c, _d, _e;
        const workspaceId = requestWorkspaceId(req);
        const shipments = await (0, silPersistenceService_1.listSilShipments)({ workspaceId });
        const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
        if (!shipment)
            return res.status(404).json({ error: "Shipment not found" });
        if (!req.files || !("file" in req.files))
            return res.status(400).json({ error: "file is required" });
        const file = req.files.file;
        const safeName = path_1.default.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
        const documentType = String((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.documentType) !== null && _b !== void 0 ? _b : "POD").toUpperCase();
        const uploadDir = path_1.default.join(process.cwd(), config_1.config.uploadDir, "shipment-documents", shipment.shipmentId);
        if (!fs_1.default.existsSync(uploadDir))
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        const storedPath = path_1.default.join(uploadDir, `${Date.now()}_${safeName}`);
        await file.mv(storedPath);
        const result = await (0, silPersistenceService_1.persistSilShipmentDocument)({
            workspaceId: shipment.workspaceId,
            shipmentId: shipment.shipmentId,
            loadId: shipment.loadId,
            carrierId: shipment.carrierId,
            documentType,
            originalName: file.name,
            storedPath,
            contentType: file.mimetype,
            sizeBytes: file.size,
            uploadedBy: (_d = (_c = req.body) === null || _c === void 0 ? void 0 : _c.uploadedBy) !== null && _d !== void 0 ? _d : "operator",
            notes: (_e = req.body) === null || _e === void 0 ? void 0 : _e.notes,
        });
        res.status(201).json(result);
    });
    router.patch("/shipments/:shipmentId/progress", async (req, res) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const workspaceId = requestWorkspaceId(req);
        let dispatchReadiness = null;
        let dispatchOverrideGovernanceSignal = null;
        if (((_a = req.body) === null || _a === void 0 ? void 0 : _a.state) === "DISPATCHED") {
            const [shipments, loads, postings, bids, carriers, lanes] = await Promise.all([
                (0, silPersistenceService_1.listSilShipments)({ workspaceId }),
                (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
                (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
                (0, silPersistenceService_1.listSilBids)({ workspaceId }),
                (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
                (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
            ]);
            const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
            if (!shipment)
                return res.status(404).json({ error: "Shipment not found" });
            const load = shipment.loadId ? loads.find((item) => item.loadId === shipment.loadId) : undefined;
            if (load) {
                const posting = postings.find((item) => item.loadId === load.loadId);
                const candidateBids = (0, matchingEngine_1.buildLoadRecommendations)({ load, posting, bids, carriers, lanes }).filter((bid) => ["AWARDED", "SHORTLISTED", "RECEIVED"].includes(bid.status));
                const bid = (_b = candidateBids.find((item) => item.status === "AWARDED")) !== null && _b !== void 0 ? _b : candidateBids[0];
                const carrier = bid ? carriers.find((item) => item.carrierId === bid.carrierId) : undefined;
                const lane = lanes.find((item) => item.originRegion === load.origin.state &&
                    item.destinationRegion === load.destination.state &&
                    item.mode === load.mode &&
                    item.equipmentType === load.equipmentType);
                dispatchReadiness = (0, matchingEngine_1.buildDispatchReadiness)({ load, bid, carrier, lane, posting, shipment });
                if (dispatchReadiness.status === "HOLD" && !((_c = req.body) === null || _c === void 0 ? void 0 : _c.overrideReadiness)) {
                    return res.status(409).json({
                        error: "Dispatch readiness is HOLD. Route readiness review before dispatch.",
                        readiness: dispatchReadiness,
                    });
                }
                if (dispatchReadiness.status === "HOLD" && ((_d = req.body) === null || _d === void 0 ? void 0 : _d.overrideReadiness)) {
                    const overrideError = readinessOverrideError(req.body);
                    if (overrideError)
                        return res.status(403).json({ error: overrideError, readiness: dispatchReadiness });
                }
                if (dispatchReadiness.governanceSignal) {
                    await (0, silPersistenceService_1.persistSilGovernanceSignal)(dispatchReadiness.governanceSignal, "READY_FOR_ENCOMPAX");
                    dispatchOverrideGovernanceSignal = dispatchReadiness.governanceSignal;
                }
            }
        }
        const result = await (0, silPersistenceService_1.updateSilShipmentProgress)({
            ...req.body,
            shipmentId: req.params.shipmentId,
            workspaceId,
        });
        if (!result)
            return res.status(404).json({ error: "Shipment not found" });
        let overrideEvent = null;
        if (((_e = req.body) === null || _e === void 0 ? void 0 : _e.state) === "DISPATCHED" && ((_f = req.body) === null || _f === void 0 ? void 0 : _f.overrideReadiness) && dispatchReadiness) {
            overrideEvent = await (0, silPersistenceService_1.persistSilWorkflowEvent)({
                eventId: `sil_evt_dispatch_override_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                eventType: "DISPATCH_READINESS_CHECKED",
                occurredAt: new Date().toISOString(),
                actor: (_h = (_g = req.body) === null || _g === void 0 ? void 0 : _g.actor) !== null && _h !== void 0 ? _h : "operator",
                source: "USER",
                workspaceId,
                loadId: dispatchReadiness.loadId,
                shipmentId: req.params.shipmentId,
                bidId: dispatchReadiness.bidId,
                carrierId: dispatchReadiness.carrierId,
                summary: `Authorized dispatch readiness override recorded for ${dispatchReadiness.loadId}.`,
                evidence: [
                    `Override actor role: ${req.body.actorRole}`,
                    `Override reason: ${req.body.overrideReason}`,
                    `Readiness status: ${dispatchReadiness.status}`,
                    `Readiness score: ${dispatchReadiness.score}`,
                    ...dispatchReadiness.blockingReasons.map((reason) => `Blocking: ${reason}`),
                    ...dispatchReadiness.reviewReasons.map((reason) => `Review: ${reason}`),
                    ...(Array.isArray((_j = req.body) === null || _j === void 0 ? void 0 : _j.evidence) ? req.body.evidence : []),
                ],
                governanceSignal: dispatchOverrideGovernanceSignal !== null && dispatchOverrideGovernanceSignal !== void 0 ? dispatchOverrideGovernanceSignal : undefined,
            });
        }
        res.json({ ...result, readiness: dispatchReadiness, overrideEvent });
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
    router.patch("/load-board/postings/:postingId/visibility", async (req, res) => {
        var _a, _b, _c, _d, _e, _f;
        const workspaceId = requestWorkspaceId(req);
        const posting = (await (0, silPersistenceService_1.listSilPostings)({ workspaceId })).find((item) => item.postingId === req.params.postingId);
        if (!posting)
            return res.status(404).json({ error: "Posting not found" });
        const result = await (0, silPersistenceService_1.updateSilPostingVisibility)(req.params.postingId, {
            visibility: (_a = req.body) === null || _a === void 0 ? void 0 : _a.visibility,
            invitedCarrierIds: (_b = req.body) === null || _b === void 0 ? void 0 : _b.invitedCarrierIds,
            status: (_c = req.body) === null || _c === void 0 ? void 0 : _c.status,
            expiresAt: (_d = req.body) === null || _d === void 0 ? void 0 : _d.expiresAt,
            actor: (_e = req.body) === null || _e === void 0 ? void 0 : _e.actor,
            evidence: (_f = req.body) === null || _f === void 0 ? void 0 : _f.evidence,
        });
        if (!result)
            return res.status(404).json({ error: "Posting not found" });
        res.json(result);
    });
    router.post("/load-board/postings/:postingId/invites", async (req, res) => {
        var _a, _b, _c, _d, _e;
        const workspaceId = requestWorkspaceId(req);
        const posting = (await (0, silPersistenceService_1.listSilPostings)({ workspaceId })).find((item) => item.postingId === req.params.postingId);
        if (!posting)
            return res.status(404).json({ error: "Posting not found" });
        const result = await (0, silPersistenceService_1.sendSilCarrierInvites)(req.params.postingId, {
            carrierIds: Array.isArray((_a = req.body) === null || _a === void 0 ? void 0 : _a.carrierIds) ? req.body.carrierIds : undefined,
            channel: (_b = req.body) === null || _b === void 0 ? void 0 : _b.channel,
            message: (_c = req.body) === null || _c === void 0 ? void 0 : _c.message,
            expiresAt: (_d = req.body) === null || _d === void 0 ? void 0 : _d.expiresAt,
            actor: (_e = req.body) === null || _e === void 0 ? void 0 : _e.actor,
        });
        if (!result)
            return res.status(404).json({ error: "Posting not found" });
        res.json(result);
    });
    router.get("/load-board/bids", async (req, res) => {
        const workspaceId = requestWorkspaceId(req);
        const [bids, loads, carriers, postings, lanes, shipments] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
            (0, silPersistenceService_1.listSilShipments)({ workspaceId }),
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
        try {
            const result = await (0, silPersistenceService_1.createSilBid)({ ...req.body, workspaceId });
            res.status(201).json(result);
        }
        catch (error) {
            res.status(409).json({ error: error instanceof Error ? error.message : "Bid rejected by posting controls" });
        }
    });
    router.get("/load-board/bids/:bidId/review", async (req, res) => {
        const workspaceId = requestWorkspaceId(req);
        const [bids, loads, carriers, postings, lanes, shipments] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
            (0, silPersistenceService_1.listSilShipments)({ workspaceId }),
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
    router.patch("/load-board/bids/:bidId/commercials", async (req, res) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const workspaceId = requestWorkspaceId(req);
        const bid = (await (0, silPersistenceService_1.listSilBids)({ workspaceId })).find((item) => item.bidId === req.params.bidId);
        if (!bid)
            return res.status(404).json({ error: "Bid not found" });
        const result = await (0, silPersistenceService_1.updateSilBidCommercials)(req.params.bidId, {
            counterOfferRate: ((_a = req.body) === null || _a === void 0 ? void 0 : _a.counterOfferRate) === undefined ? undefined : Number(req.body.counterOfferRate),
            counterOfferStatus: (_b = req.body) === null || _b === void 0 ? void 0 : _b.counterOfferStatus,
            fuelSurcharge: ((_c = req.body) === null || _c === void 0 ? void 0 : _c.fuelSurcharge) === undefined ? undefined : Number(req.body.fuelSurcharge),
            accessorialTotal: ((_d = req.body) === null || _d === void 0 ? void 0 : _d.accessorialTotal) === undefined ? undefined : Number(req.body.accessorialTotal),
            lumperFee: ((_e = req.body) === null || _e === void 0 ? void 0 : _e.lumperFee) === undefined ? undefined : Number(req.body.lumperFee),
            detentionEstimate: ((_f = req.body) === null || _f === void 0 ? void 0 : _f.detentionEstimate) === undefined ? undefined : Number(req.body.detentionEstimate),
            expiresAt: (_g = req.body) === null || _g === void 0 ? void 0 : _g.expiresAt,
            message: (_h = req.body) === null || _h === void 0 ? void 0 : _h.message,
            status: (_j = req.body) === null || _j === void 0 ? void 0 : _j.status,
            actor: (_k = req.body) === null || _k === void 0 ? void 0 : _k.actor,
            evidence: (_l = req.body) === null || _l === void 0 ? void 0 : _l.evidence,
        });
        if (!result)
            return res.status(404).json({ error: "Bid not found" });
        res.json(result);
    });
    router.post("/load-board/bids/:bidId/tender-response", async (req, res) => {
        var _a, _b, _c, _d, _e, _f;
        const responseType = (_a = req.body) === null || _a === void 0 ? void 0 : _a.responseType;
        if (!["QUOTE", "ACCEPT_TENDER", "DECLINE_TENDER", "COUNTER", "REQUEST_MORE_INFO"].includes(responseType)) {
            return res.status(400).json({ error: "responseType must be QUOTE, ACCEPT_TENDER, DECLINE_TENDER, COUNTER, or REQUEST_MORE_INFO" });
        }
        const workspaceId = requestWorkspaceId(req);
        const bid = (await (0, silPersistenceService_1.listSilBids)({ workspaceId })).find((item) => item.bidId === req.params.bidId);
        if (!bid)
            return res.status(404).json({ error: "Bid not found" });
        const result = await (0, silPersistenceService_1.recordSilTenderResponse)(req.params.bidId, {
            responseType,
            status: (_b = req.body) === null || _b === void 0 ? void 0 : _b.status,
            rate: ((_c = req.body) === null || _c === void 0 ? void 0 : _c.rate) === undefined ? undefined : Number(req.body.rate),
            message: (_d = req.body) === null || _d === void 0 ? void 0 : _d.message,
            evidence: Array.isArray((_e = req.body) === null || _e === void 0 ? void 0 : _e.evidence) ? req.body.evidence : undefined,
            actor: (_f = req.body) === null || _f === void 0 ? void 0 : _f.actor,
        });
        if (!result)
            return res.status(404).json({ error: "Bid not found" });
        res.json(result);
    });
    router.post("/load-board/bids/:bidId/decision", async (req, res) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        const decision = (_a = req.body) === null || _a === void 0 ? void 0 : _a.decision;
        if (!decision || !["SHORTLISTED", "REJECTED", "AWARDED", "WITHDRAWN"].includes(decision)) {
            return res.status(400).json({ error: "decision must be SHORTLISTED, REJECTED, AWARDED, or WITHDRAWN" });
        }
        const workspaceId = requestWorkspaceId(req);
        const [bids, loads, carriers, postings, lanes, shipments] = await Promise.all([
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
            (0, silPersistenceService_1.listSilShipments)({ workspaceId }),
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
        const shipment = shipments.find((item) => item.loadId === load.loadId);
        const readiness = decision === "AWARDED" ? (0, matchingEngine_1.buildDispatchReadiness)({ load, bid, carrier, lane, posting, shipment }) : null;
        if ((readiness === null || readiness === void 0 ? void 0 : readiness.status) === "HOLD" && !((_b = req.body) === null || _b === void 0 ? void 0 : _b.overrideReadiness)) {
            return res.status(409).json({
                error: "Dispatch readiness is HOLD. Route readiness review before award.",
                readiness,
            });
        }
        if ((readiness === null || readiness === void 0 ? void 0 : readiness.status) === "HOLD" && ((_c = req.body) === null || _c === void 0 ? void 0 : _c.overrideReadiness)) {
            const overrideError = readinessOverrideError(req.body);
            if (overrideError)
                return res.status(403).json({ error: overrideError, readiness });
        }
        const updatedBid = await (0, silPersistenceService_1.updateSilBidStatus)(bid.bidId, decision);
        const governanceSignal = decision === "AWARDED" && ((readiness === null || readiness === void 0 ? void 0 : readiness.governanceSignal) || score.governanceSignalRequired)
            ? (_d = readiness === null || readiness === void 0 ? void 0 : readiness.governanceSignal) !== null && _d !== void 0 ? _d : (0, matchingEngine_1.buildGovernanceSignalFromMatch)({ load, bid, carrier, lane, posting }, score)
            : null;
        if (governanceSignal)
            await (0, silPersistenceService_1.persistSilGovernanceSignal)(governanceSignal, "READY_FOR_ENCOMPAX");
        const event = await (0, silPersistenceService_1.persistSilWorkflowEvent)({
            eventId: `sil_evt_bid_decision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            eventType: decision === "AWARDED" ? "CARRIER_AWARDED" : "BID_REVIEWED",
            occurredAt: new Date().toISOString(),
            actor: (_f = (_e = req.body) === null || _e === void 0 ? void 0 : _e.actor) !== null && _f !== void 0 ? _f : "operator",
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
                ...(readiness ? [`Dispatch readiness: ${readiness.status}`, `Readiness score: ${readiness.score}`] : []),
                ...(Array.isArray((_g = req.body) === null || _g === void 0 ? void 0 : _g.evidence) ? req.body.evidence : score.evidence),
            ],
            governanceSignal: governanceSignal !== null && governanceSignal !== void 0 ? governanceSignal : undefined,
        });
        if (decision === "AWARDED") {
            await (0, silPersistenceService_1.updateSilLoadStatus)(load.loadId, "CARRIER_SELECTED");
        }
        const overrideEvent = decision === "AWARDED" && ((_h = req.body) === null || _h === void 0 ? void 0 : _h.overrideReadiness) && readiness
            ? await (0, silPersistenceService_1.persistSilWorkflowEvent)({
                eventId: `sil_evt_award_override_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                eventType: "DISPATCH_READINESS_CHECKED",
                occurredAt: new Date().toISOString(),
                actor: (_k = (_j = req.body) === null || _j === void 0 ? void 0 : _j.actor) !== null && _k !== void 0 ? _k : "operator",
                source: "USER",
                workspaceId: bid.workspaceId,
                loadId: bid.loadId,
                bidId: bid.bidId,
                carrierId: bid.carrierId,
                previousState: bid.status,
                nextState: decision,
                summary: `Authorized award override recorded for ${bid.loadId}.`,
                evidence: [
                    `Override actor role: ${req.body.actorRole}`,
                    `Override reason: ${req.body.overrideReason}`,
                    `Readiness status: ${readiness.status}`,
                    `Readiness score: ${readiness.score}`,
                    ...readiness.blockingReasons.map((reason) => `Blocking: ${reason}`),
                    ...readiness.reviewReasons.map((reason) => `Review: ${reason}`),
                    ...(Array.isArray((_l = req.body) === null || _l === void 0 ? void 0 : _l.evidence) ? req.body.evidence : []),
                ],
                governanceSignal: governanceSignal !== null && governanceSignal !== void 0 ? governanceSignal : undefined,
            })
            : null;
        res.json({ bid: updatedBid, score, readiness, governanceSignal, event, overrideEvent });
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
    router.get("/matching/carrier-eligibility/:loadId", async (req, res) => {
        const workspaceId = requestWorkspaceId(req);
        const [loads, carriers, lanes] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
        ]);
        const load = loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const recommendations = (0, matchingEngine_1.buildCarrierEligibilityRecommendations)({ load, carriers, lanes });
        res.json({ count: recommendations.length, recommendations });
    });
    router.post("/matching/carrier-eligibility/:loadId/invite-packet", async (req, res) => {
        var _a, _b, _c, _d, _e;
        const workspaceId = requestWorkspaceId(req);
        const [loads, carriers, lanes, postings] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
        ]);
        const load = loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const recommendations = (0, matchingEngine_1.buildCarrierEligibilityRecommendations)({ load, carriers, lanes });
        const selectedRecommendations = recommendations.filter((carrier) => ["INVITE", "INVITE_WITH_REVIEW"].includes(carrier.inviteRecommendation));
        const invitedCarrierIds = selectedRecommendations.map((carrier) => carrier.carrierId);
        const governanceReasons = [
            ...selectedRecommendations
                .filter((carrier) => carrier.governanceReviewRequired)
                .map((carrier) => `${carrier.carrierName} requires governance review before invite.`),
            ...(selectedRecommendations.length < 2 ? ["Invite packet has fewer than two eligible carrier options."] : []),
            ...recommendations
                .filter((carrier) => carrier.blocked)
                .map((carrier) => `${carrier.carrierName} excluded because carrier is blocked.`),
        ];
        const primaryPosting = (_a = postings.find((posting) => posting.loadId === load.loadId)) !== null && _a !== void 0 ? _a : null;
        const severity = governanceReasons.length > 1 ? "HIGH" : governanceReasons.length === 1 ? "MEDIUM" : "LOW";
        const packet = {
            loadId: load.loadId,
            postingId: (_b = primaryPosting === null || primaryPosting === void 0 ? void 0 : primaryPosting.postingId) !== null && _b !== void 0 ? _b : null,
            invitedCarrierIds,
            selectedRecommendations,
            excludedCarrierIds: recommendations
                .filter((carrier) => !invitedCarrierIds.includes(carrier.carrierId))
                .map((carrier) => carrier.carrierId),
            governanceReviewRequired: governanceReasons.length > 0,
            governanceReasons,
            createdAt: new Date().toISOString(),
        };
        const governanceSignal = governanceReasons.length > 0
            ? {
                workspaceId,
                signalType: "CARRIER_INVITE_REVIEW",
                sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
                severity,
                confidenceScore: severity === "HIGH" ? 0.86 : 0.74,
                description: `Carrier invite packet for ${(_c = load.customerName) !== null && _c !== void 0 ? _c : load.customerId} requires governed review.`,
                businessDomains: ["TRANSPORTATION", "FREIGHT_BROKERAGE", "RISK"],
                affectedEntities: {
                    loads: [load.loadId],
                    carriers: invitedCarrierIds,
                    customers: [load.customerId],
                },
                metrics: {
                    invited_carrier_count: invitedCarrierIds.length,
                    excluded_carrier_count: packet.excludedCarrierIds.length,
                    governance_reason_count: governanceReasons.length,
                },
                tags: ["sil", "carrier-invite", "brokerage", severity.toLowerCase()],
                recommendedActions: [
                    {
                        actionType: "REVIEW_CARRIER_INVITE_PACKET",
                        targetModule: "PLATFORM_OVERVIEW",
                        priority: severity === "HIGH" ? "HIGH" : "MEDIUM",
                        description: "Review carrier invite list before posting outreach is committed.",
                    },
                ],
                rawPayloadRef: `sil:invite-packet:${load.loadId}`,
            }
            : null;
        if (governanceSignal)
            await (0, silPersistenceService_1.persistSilGovernanceSignal)(governanceSignal, "READY_FOR_ENCOMPAX");
        const event = await (0, silPersistenceService_1.persistSilWorkflowEvent)({
            eventId: `sil_evt_invite_packet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            eventType: governanceSignal ? "GOVERNANCE_SIGNAL_CREATED" : "LOAD_POSTED",
            occurredAt: packet.createdAt,
            actor: (_e = (_d = req.body) === null || _d === void 0 ? void 0 : _d.actor) !== null && _e !== void 0 ? _e : "operator",
            source: "USER",
            workspaceId,
            loadId: load.loadId,
            summary: `Carrier invite packet created for ${load.loadId}.`,
            evidence: [
                `Invited carriers: ${invitedCarrierIds.join(", ") || "none"}`,
                `Governance review required: ${packet.governanceReviewRequired}`,
                ...governanceReasons,
            ],
            governanceSignal: governanceSignal !== null && governanceSignal !== void 0 ? governanceSignal : undefined,
        });
        res.status(201).json({ packet, governanceSignal, event });
    });
    router.get("/dispatch/readiness/:loadId", async (req, res) => {
        var _a, _b;
        const workspaceId = requestWorkspaceId(req);
        const [loads, postings, bids, carriers, lanes, shipments] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
            (0, silPersistenceService_1.listSilShipments)({ workspaceId }),
        ]);
        const load = loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const posting = postings.find((item) => item.loadId === load.loadId);
        const candidateBids = (0, matchingEngine_1.buildLoadRecommendations)({ load, posting, bids, carriers, lanes }).filter((bid) => ["RECEIVED", "SHORTLISTED", "AWARDED"].includes(bid.status));
        const bid = (_b = (_a = (req.query.bidId ? candidateBids.find((item) => item.bidId === req.query.bidId) : undefined)) !== null && _a !== void 0 ? _a : candidateBids[0]) !== null && _b !== void 0 ? _b : bids.find((item) => item.loadId === load.loadId);
        const carrier = bid ? carriers.find((item) => item.carrierId === bid.carrierId) : undefined;
        const lane = lanes.find((item) => item.originRegion === load.origin.state &&
            item.destinationRegion === load.destination.state &&
            item.mode === load.mode &&
            item.equipmentType === load.equipmentType);
        const shipment = shipments.find((item) => item.loadId === load.loadId);
        const readiness = (0, matchingEngine_1.buildDispatchReadiness)({ load, bid, carrier, lane, posting, shipment });
        res.json({ readiness });
    });
    router.post("/dispatch/readiness/:loadId/review", async (req, res) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const workspaceId = requestWorkspaceId(req);
        const [loads, postings, bids, carriers, lanes, shipments] = await Promise.all([
            (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
            (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
            (0, silPersistenceService_1.listSilBids)({ workspaceId }),
            (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
            (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
            (0, silPersistenceService_1.listSilShipments)({ workspaceId }),
        ]);
        const load = loads.find((item) => item.loadId === req.params.loadId);
        if (!load)
            return res.status(404).json({ error: "Load not found" });
        const posting = postings.find((item) => item.loadId === load.loadId);
        const candidateBids = (0, matchingEngine_1.buildLoadRecommendations)({ load, posting, bids, carriers, lanes }).filter((bid) => ["RECEIVED", "SHORTLISTED", "AWARDED"].includes(bid.status));
        const bid = (_c = (_b = (((_a = req.body) === null || _a === void 0 ? void 0 : _a.bidId) ? candidateBids.find((item) => item.bidId === req.body.bidId) : undefined)) !== null && _b !== void 0 ? _b : candidateBids[0]) !== null && _c !== void 0 ? _c : bids.find((item) => item.loadId === load.loadId);
        const carrier = bid ? carriers.find((item) => item.carrierId === bid.carrierId) : undefined;
        const lane = lanes.find((item) => item.originRegion === load.origin.state &&
            item.destinationRegion === load.destination.state &&
            item.mode === load.mode &&
            item.equipmentType === load.equipmentType);
        const shipment = shipments.find((item) => item.loadId === load.loadId);
        const readiness = (0, matchingEngine_1.buildDispatchReadiness)({ load, bid, carrier, lane, posting, shipment });
        const governanceSignal = (_d = readiness.governanceSignal) !== null && _d !== void 0 ? _d : null;
        if (governanceSignal)
            await (0, silPersistenceService_1.persistSilGovernanceSignal)(governanceSignal, "READY_FOR_ENCOMPAX");
        const event = await (0, silPersistenceService_1.persistSilWorkflowEvent)({
            eventId: `sil_evt_dispatch_readiness_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            eventType: "DISPATCH_READINESS_CHECKED",
            occurredAt: new Date().toISOString(),
            actor: (_f = (_e = req.body) === null || _e === void 0 ? void 0 : _e.actor) !== null && _f !== void 0 ? _f : "operator",
            source: "USER",
            workspaceId: load.workspaceId,
            loadId: load.loadId,
            shipmentId: shipment === null || shipment === void 0 ? void 0 : shipment.shipmentId,
            bidId: bid === null || bid === void 0 ? void 0 : bid.bidId,
            carrierId: bid === null || bid === void 0 ? void 0 : bid.carrierId,
            summary: `Dispatch readiness for ${load.loadId} returned ${readiness.status}.`,
            evidence: [
                `Readiness score: ${readiness.score}`,
                ...readiness.blockingReasons.map((reason) => `Blocking: ${reason}`),
                ...readiness.reviewReasons.map((reason) => `Review: ${reason}`),
                ...(Array.isArray((_g = req.body) === null || _g === void 0 ? void 0 : _g.evidence) ? req.body.evidence : readiness.evidence),
            ],
            governanceSignal: governanceSignal !== null && governanceSignal !== void 0 ? governanceSignal : undefined,
        });
        res.status(governanceSignal ? 201 : 200).json({ readiness, governanceSignal, event });
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
