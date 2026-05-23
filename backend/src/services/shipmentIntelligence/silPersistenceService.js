"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedSilPersistence = seedSilPersistence;
exports.listSilLoads = listSilLoads;
exports.getSilLoad = getSilLoad;
exports.updateSilLoadStatus = updateSilLoadStatus;
exports.createSilLoad = createSilLoad;
exports.listSilShipments = listSilShipments;
exports.updateSilShipmentProgress = updateSilShipmentProgress;
exports.listSilCarriers = listSilCarriers;
exports.upsertSilCarrier = upsertSilCarrier;
exports.listSilLanes = listSilLanes;
exports.listSilPostings = listSilPostings;
exports.createSilPosting = createSilPosting;
exports.listSilBids = listSilBids;
exports.createSilBid = createSilBid;
exports.updateSilBidCommercials = updateSilBidCommercials;
exports.updateSilBidStatus = updateSilBidStatus;
exports.listSilMarketRates = listSilMarketRates;
exports.listSilGovernanceSignals = listSilGovernanceSignals;
exports.persistSilGovernanceSignal = persistSilGovernanceSignal;
exports.persistSilWorkflowEvent = persistSilWorkflowEvent;
exports.listPersistedWorkflowEvents = listPersistedWorkflowEvents;
exports.listSilLeanTemplates = listSilLeanTemplates;
exports.createSilLeanRecord = createSilLeanRecord;
exports.listSilLeanRecords = listSilLeanRecords;
exports.getSilWorkspace = getSilWorkspace;
exports.upsertSilWorkspace = upsertSilWorkspace;
const prisma_1 = require("../../lib/prisma");
const mockData_1 = require("./mockData");
const leanTemplates_1 = require("./leanTemplates");
let seeded = false;
const DEFAULT_WORKSPACE_ID = "workspace-shipment-operations";
const json = (value) => JSON.stringify(value);
const fromRecord = (record) => JSON.parse(record.data);
const signalId = (signal) => {
    var _a, _b, _c, _d, _e, _f;
    return [
        signal.sourceModule.toLowerCase(),
        signal.signalType.toLowerCase(),
        (_d = (_b = (_a = signal.affectedEntities.loads) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : (_c = signal.affectedEntities.shipments) === null || _c === void 0 ? void 0 : _c[0]) !== null && _d !== void 0 ? _d : "general",
        (_f = (_e = signal.affectedEntities.carriers) === null || _e === void 0 ? void 0 : _e[0]) !== null && _f !== void 0 ? _f : "system",
    ].join(":");
};
const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const normalizeIdPart = (value, fallback) => (value !== null && value !== void 0 ? value : fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || fallback;
const withWorkspace = (record, workspaceId = DEFAULT_WORKSPACE_ID) => {
    var _a;
    return ({
        ...record,
        workspaceId: (_a = record.workspaceId) !== null && _a !== void 0 ? _a : workspaceId,
    });
};
const matchesWorkspace = (record, workspaceId) => { var _a; return !workspaceId || ((_a = record.workspaceId) !== null && _a !== void 0 ? _a : DEFAULT_WORKSPACE_ID) === workspaceId; };
async function ensureSilWorkspaceTable() {
    await prisma_1.prisma.$executeRaw `
    CREATE TABLE IF NOT EXISTS "SilWorkspaceRecord" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL UNIQUE,
      "organization" TEXT NOT NULL,
      "ownerEmail" TEXT,
      "status" TEXT NOT NULL DEFAULT 'ACTIVE',
      "data" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `;
    await prisma_1.prisma.$executeRaw `CREATE INDEX IF NOT EXISTS "SilWorkspaceRecord_organization_idx" ON "SilWorkspaceRecord"("organization")`;
    await prisma_1.prisma.$executeRaw `CREATE INDEX IF NOT EXISTS "SilWorkspaceRecord_status_idx" ON "SilWorkspaceRecord"("status")`;
}
const defaultWorkspace = {
    workspaceId: DEFAULT_WORKSPACE_ID,
    organization: "Example Organization",
    workspaceName: "Shipment Operations",
    ownerEmail: "operator@example.com",
    status: "TRIAL",
    selectedProductIds: ["sil"],
    governanceMode: "SIGNAL_ONLY",
    monthlyTokenBudget: 250000,
    monthlySpendLimitUsd: 25,
    enabledAgentProviders: ["MANUAL"],
    modules: [
        {
            productId: "sil",
            status: "ACTIVE",
            enabled: true,
            connectedAt: new Date(0).toISOString(),
            governanceRoute: "platform_overview",
        },
        {
            productId: "marengo",
            status: "AVAILABLE",
            enabled: false,
            governanceRoute: "governance_council",
        },
        {
            productId: "kardia",
            status: "PLANNED",
            enabled: false,
            governanceRoute: "ethos_sentinel_review",
        },
        {
            productId: "encompax",
            status: "AVAILABLE",
            enabled: false,
            governanceRoute: "platform_overview",
        },
    ],
    teamMembers: [
        {
            email: "operator@example.com",
            role: "OWNER",
            status: "ACTIVE",
        },
    ],
};
async function seedSilPersistence() {
    var _a, _b;
    if (seeded)
        return;
    await ensureSilWorkspaceTable();
    await Promise.all([
        ...mockData_1.loads.map((load) => prisma_1.prisma.silLoadRecord.upsert({
            where: { loadId: load.loadId },
            update: {
                customerId: load.customerId,
                status: load.status,
                source: load.source,
                data: json(withWorkspace(load)),
            },
            create: {
                loadId: load.loadId,
                customerId: load.customerId,
                status: load.status,
                source: load.source,
                data: json(withWorkspace(load)),
            },
        })),
        ...mockData_1.shipments.map((shipment) => prisma_1.prisma.silShipmentRecord.upsert({
            where: { shipmentId: shipment.shipmentId },
            update: {
                loadId: shipment.loadId,
                state: shipment.state,
                source: shipment.source,
                data: json(withWorkspace(shipment)),
            },
            create: {
                shipmentId: shipment.shipmentId,
                loadId: shipment.loadId,
                state: shipment.state,
                source: shipment.source,
                data: json(withWorkspace(shipment)),
            },
        })),
        ...mockData_1.carriers.map((carrier) => {
            var _a, _b;
            return prisma_1.prisma.silCarrierRecord.upsert({
                where: { carrierId: carrier.carrierId },
                update: {
                    carrierName: carrier.carrierName,
                    status: carrier.blocked ? "BLOCKED" : (_a = carrier.creditStatus) !== null && _a !== void 0 ? _a : "UNKNOWN",
                    data: json(withWorkspace(carrier)),
                },
                create: {
                    carrierId: carrier.carrierId,
                    carrierName: carrier.carrierName,
                    status: carrier.blocked ? "BLOCKED" : (_b = carrier.creditStatus) !== null && _b !== void 0 ? _b : "UNKNOWN",
                    data: json(withWorkspace(carrier)),
                },
            });
        }),
        ...mockData_1.lanes.map((lane) => prisma_1.prisma.silLaneRecord.upsert({
            where: { laneId: lane.laneId },
            update: {
                origin: lane.originRegion,
                destination: lane.destinationRegion,
                mode: lane.mode,
                equipment: lane.equipmentType,
                data: json(withWorkspace(lane)),
            },
            create: {
                laneId: lane.laneId,
                origin: lane.originRegion,
                destination: lane.destinationRegion,
                mode: lane.mode,
                equipment: lane.equipmentType,
                data: json(withWorkspace(lane)),
            },
        })),
        ...mockData_1.postings.map((posting) => prisma_1.prisma.silLoadPostingRecord.upsert({
            where: { postingId: posting.postingId },
            update: {
                loadId: posting.loadId,
                status: posting.status,
                board: posting.board,
                data: json(withWorkspace(posting)),
            },
            create: {
                postingId: posting.postingId,
                loadId: posting.loadId,
                status: posting.status,
                board: posting.board,
                data: json(withWorkspace(posting)),
            },
        })),
        ...mockData_1.bids.map((bid) => prisma_1.prisma.silBidRecord.upsert({
            where: { bidId: bid.bidId },
            update: {
                postingId: bid.postingId,
                loadId: bid.loadId,
                carrierId: bid.carrierId,
                status: bid.status,
                bidRate: bid.bidRate,
                data: json(withWorkspace(bid)),
            },
            create: {
                bidId: bid.bidId,
                postingId: bid.postingId,
                loadId: bid.loadId,
                carrierId: bid.carrierId,
                status: bid.status,
                bidRate: bid.bidRate,
                data: json(withWorkspace(bid)),
            },
        })),
        ...mockData_1.marketRates.map((rate) => prisma_1.prisma.silMarketRateRecord.upsert({
            where: { observationId: rate.observationId },
            update: {
                laneId: rate.laneId,
                source: rate.source,
                observedAt: new Date(rate.observedAt),
                data: json(withWorkspace(rate)),
            },
            create: {
                observationId: rate.observationId,
                laneId: rate.laneId,
                source: rate.source,
                observedAt: new Date(rate.observedAt),
                data: json(withWorkspace(rate)),
            },
        })),
        ...(0, mockData_1.getGovernanceSignals)().map((signal) => prisma_1.prisma.silGovernanceSignalRecord.upsert({
            where: { signalId: signalId(signal) },
            update: {
                signalType: signal.signalType,
                severity: signal.severity,
                sourceModule: signal.sourceModule,
                data: json(withWorkspace(signal)),
            },
            create: {
                signalId: signalId(signal),
                signalType: signal.signalType,
                severity: signal.severity,
                sourceModule: signal.sourceModule,
                data: json(withWorkspace(signal)),
            },
        })),
        ...leanTemplates_1.leanTemplates.map((template) => prisma_1.prisma.silLeanTemplateRecord.upsert({
            where: { templateId: template.templateId },
            update: {
                title: template.title,
                category: template.category,
                owner: template.owner,
                data: json(template),
            },
            create: {
                templateId: template.templateId,
                title: template.title,
                category: template.category,
                owner: template.owner,
                data: json(template),
            },
        })),
    ]);
    const existingWorkspace = await prisma_1.prisma.$queryRaw `
    SELECT "workspaceId" FROM "SilWorkspaceRecord" WHERE "workspaceId" = ${defaultWorkspace.workspaceId} LIMIT 1
  `;
    if (existingWorkspace.length === 0) {
        await prisma_1.prisma.$executeRaw `
      INSERT INTO "SilWorkspaceRecord" ("id", "workspaceId", "organization", "ownerEmail", "status", "data", "updatedAt")
      VALUES (${makeId("sil_workspace")}, ${defaultWorkspace.workspaceId}, ${defaultWorkspace.organization}, ${(_a = defaultWorkspace.ownerEmail) !== null && _a !== void 0 ? _a : null}, ${(_b = defaultWorkspace.status) !== null && _b !== void 0 ? _b : "TRIAL"}, ${json(defaultWorkspace)}, ${new Date()})
    `;
    }
    seeded = true;
}
async function listSilLoads(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silLoadRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => withWorkspace(fromRecord(record))).filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
async function getSilLoad(loadId) {
    await seedSilPersistence();
    const record = await prisma_1.prisma.silLoadRecord.findUnique({ where: { loadId } });
    return record ? withWorkspace(fromRecord(record)) : null;
}
async function updateSilLoadStatus(loadId, status) {
    const load = await getSilLoad(loadId);
    if (!load)
        return null;
    const updatedLoad = withWorkspace({ ...load, status });
    await prisma_1.prisma.silLoadRecord.update({
        where: { loadId },
        data: { status, data: json(updatedLoad) },
    });
    return updatedLoad;
}
async function createSilLoad(input) {
    var _a, _b, _c, _d, _e;
    await seedSilPersistence();
    const workspaceId = (_a = input.workspaceId) !== null && _a !== void 0 ? _a : DEFAULT_WORKSPACE_ID;
    const loadId = (_b = input.loadId) !== null && _b !== void 0 ? _b : `load-${normalizeIdPart(input.customerId, "customer")}-${normalizeIdPart(input.origin.state, "origin")}-${normalizeIdPart(input.destination.state, "dest")}-${Date.now()}`;
    const load = {
        workspaceId,
        loadId,
        customerId: input.customerId,
        customerName: input.customerName,
        origin: input.origin,
        destination: input.destination,
        pickupWindowStart: input.pickupWindowStart,
        pickupWindowEnd: input.pickupWindowEnd,
        deliveryWindowStart: input.deliveryWindowStart,
        deliveryWindowEnd: input.deliveryWindowEnd,
        mode: input.mode,
        equipmentType: input.equipmentType,
        weightLbs: input.weightLbs,
        handlingRequirements: input.handlingRequirements,
        hazmat: input.hazmat,
        temperatureControlled: input.temperatureControlled,
        status: (_c = input.status) !== null && _c !== void 0 ? _c : "LOAD_CREATED",
        targetSellRate: input.targetSellRate,
        targetBuyRate: input.targetBuyRate,
        marginTarget: input.marginTarget,
        source: (_d = input.source) !== null && _d !== void 0 ? _d : "manual",
    };
    await prisma_1.prisma.silLoadRecord.create({
        data: {
            loadId: load.loadId,
            customerId: load.customerId,
            status: load.status,
            source: load.source,
            data: json(load),
        },
    });
    const event = await persistSilWorkflowEvent({
        eventId: makeId("sil_evt_load_created"),
        eventType: "LOAD_CREATED",
        occurredAt: new Date().toISOString(),
        actor: "operator",
        source: "USER",
        workspaceId,
        loadId: load.loadId,
        nextState: load.status,
        summary: `Load created for ${(_e = load.customerName) !== null && _e !== void 0 ? _e : load.customerId}.`,
        evidence: ["Manual load creation", `Mode: ${load.mode}`, `Equipment: ${load.equipmentType}`],
    });
    return { load, event };
}
async function listSilShipments(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silShipmentRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => withWorkspace(fromRecord(record))).filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
function buildShipmentExecutionSignal(input) {
    var _a, _b, _c, _d;
    const { shipment, occurredAt, previousState, evidence } = input;
    const reasons = [];
    const deliveryDue = (_b = (_a = shipment.stops.find((stop) => stop.type === "DELIVERY")) === null || _a === void 0 ? void 0 : _a.appointmentEnd) !== null && _b !== void 0 ? _b : shipment.estimatedDelivery;
    const dueTime = deliveryDue ? new Date(deliveryDue).getTime() : null;
    const eventTime = new Date(occurredAt).getTime();
    const incompleteStops = shipment.stops.filter((stop) => stop.status !== "COMPLETED" && stop.status !== "CANCELED");
    if (shipment.state === "EXCEPTION" || shipment.exception)
        reasons.push("Shipment exception recorded.");
    if (!shipment.trackingNumber && ["DISPATCHED", "AT_PICKUP", "IN_TRANSIT", "AT_DELIVERY"].includes(shipment.state)) {
        reasons.push("Shipment is executing without a tracking number.");
    }
    if (dueTime && eventTime > dueTime && shipment.state !== "DELIVERED") {
        reasons.push("Shipment is past delivery commitment without delivery confirmation.");
    }
    if (shipment.state === "DELIVERED" && incompleteStops.length > 0) {
        reasons.push("Shipment marked delivered while stop evidence remains incomplete.");
    }
    if (shipment.state === "IN_TRANSIT" && shipment.stops.some((stop) => stop.type === "PICKUP" && stop.status !== "COMPLETED")) {
        reasons.push("Shipment is in transit without completed pickup evidence.");
    }
    if (reasons.length === 0)
        return null;
    const severity = shipment.state === "EXCEPTION" || reasons.some((reason) => reason.includes("past delivery")) ? "CRITICAL" : "HIGH";
    return {
        workspaceId: shipment.workspaceId,
        signalType: shipment.state === "EXCEPTION" ? "SHIPMENT_EXECUTION_EXCEPTION" : "CUSTOMER_DELIVERY_COMMITMENT_RISK",
        sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
        severity,
        confidenceScore: severity === "CRITICAL" ? 0.9 : 0.78,
        description: `${(_d = (_c = shipment.carrierName) !== null && _c !== void 0 ? _c : shipment.carrierId) !== null && _d !== void 0 ? _d : "Carrier"} shipment execution requires governed review.`,
        businessDomains: ["TRANSPORTATION", "SHIPMENT_VISIBILITY", "CUSTOMER_SERVICE", "RISK"],
        affectedEntities: {
            shipments: [shipment.shipmentId],
            loads: shipment.loadId ? [shipment.loadId] : [],
            carriers: shipment.carrierId ? [shipment.carrierId] : [],
        },
        metrics: {
            reason_count: reasons.length,
            incomplete_stop_count: incompleteStops.length,
            has_tracking_number: Boolean(shipment.trackingNumber),
            previous_state: previousState,
            current_state: shipment.state,
            delivery_due_at: deliveryDue !== null && deliveryDue !== void 0 ? deliveryDue : null,
        },
        tags: ["sil", "shipment-execution", "visibility", severity.toLowerCase()],
        recommendedActions: [
            {
                actionType: "ROUTE_SHIPMENT_EXECUTION_FOR_REVIEW",
                targetModule: "PLATFORM_OVERVIEW",
                priority: severity,
                description: "Route shipment execution drift to Encompax before customer commitment updates are made.",
            },
        ],
        rawPayloadRef: `sil:shipment:${shipment.shipmentId}`,
    };
}
async function updateSilShipmentProgress(input) {
    var _a, _b, _c, _d, _e, _f;
    await seedSilPersistence();
    const record = await prisma_1.prisma.silShipmentRecord.findUnique({ where: { shipmentId: input.shipmentId } });
    if (!record)
        return null;
    const current = withWorkspace(fromRecord(record));
    if (!matchesWorkspace(current, input.workspaceId))
        return null;
    const occurredAt = (_a = input.occurredAt) !== null && _a !== void 0 ? _a : new Date().toISOString();
    const updatedStops = current.stops.map((stop) => {
        var _a;
        if (stop.stopId !== input.stopId)
            return stop;
        return {
            ...stop,
            status: (_a = input.stopStatus) !== null && _a !== void 0 ? _a : stop.status,
            ...(input.timestampField ? { [input.timestampField]: occurredAt } : {}),
        };
    });
    const updatedShipment = {
        ...current,
        state: (_b = input.state) !== null && _b !== void 0 ? _b : current.state,
        trackingNumber: (_c = input.trackingNumber) !== null && _c !== void 0 ? _c : current.trackingNumber,
        exception: input.exception === null ? undefined : (_d = input.exception) !== null && _d !== void 0 ? _d : current.exception,
        actualDelivery: input.state === "DELIVERED" ? occurredAt : current.actualDelivery,
        stops: input.stopId ? updatedStops : current.stops,
    };
    await prisma_1.prisma.silShipmentRecord.update({
        where: { shipmentId: input.shipmentId },
        data: {
            state: updatedShipment.state,
            data: json(updatedShipment),
        },
    });
    const event = await persistSilWorkflowEvent({
        eventId: makeId("sil_evt_shipment_progress_updated"),
        eventType: "SHIPMENT_PROGRESS_UPDATED",
        occurredAt,
        actor: (_e = input.actor) !== null && _e !== void 0 ? _e : "operator",
        source: "USER",
        workspaceId: updatedShipment.workspaceId,
        loadId: updatedShipment.loadId,
        shipmentId: updatedShipment.shipmentId,
        previousState: current.state,
        nextState: updatedShipment.state,
        shipmentState: updatedShipment.state,
        summary: `Shipment ${updatedShipment.shipmentId} moved from ${current.state} to ${updatedShipment.state}.`,
        evidence: (_f = input.evidence) !== null && _f !== void 0 ? _f : [
            `Shipment state: ${updatedShipment.state}`,
            input.stopId ? `Stop updated: ${input.stopId}` : "Shipment header updated",
        ],
    });
    const governanceSignal = buildShipmentExecutionSignal({
        shipment: updatedShipment,
        occurredAt,
        previousState: current.state,
        evidence: event.evidence,
    });
    const persistedGovernanceSignal = governanceSignal
        ? await persistSilGovernanceSignal(governanceSignal, "READY_FOR_ENCOMPAX")
        : null;
    return { shipment: updatedShipment, event, governanceSignal, persistedGovernanceSignal };
}
async function listSilCarriers(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silCarrierRecord.findMany({ orderBy: { carrierName: "asc" } });
    return records.map((record) => withWorkspace(fromRecord(record))).filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
async function upsertSilCarrier(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    await seedSilPersistence();
    const workspaceId = (_a = input.workspaceId) !== null && _a !== void 0 ? _a : DEFAULT_WORKSPACE_ID;
    const carrier = {
        workspaceId,
        carrierId: (_b = input.carrierId) !== null && _b !== void 0 ? _b : `carrier-${normalizeIdPart(input.carrierName, "carrier")}`,
        carrierName: input.carrierName,
        mcNumber: input.mcNumber,
        dotNumber: input.dotNumber,
        insuranceStatus: (_c = input.insuranceStatus) !== null && _c !== void 0 ? _c : "UNKNOWN",
        safetyStatus: (_d = input.safetyStatus) !== null && _d !== void 0 ? _d : "UNKNOWN",
        creditStatus: (_e = input.creditStatus) !== null && _e !== void 0 ? _e : "UNKNOWN",
        serviceScore: input.serviceScore,
        falloffRate: input.falloffRate,
        onTimeRate: input.onTimeRate,
        blocked: (_f = input.blocked) !== null && _f !== void 0 ? _f : false,
        preferred: (_g = input.preferred) !== null && _g !== void 0 ? _g : false,
    };
    const status = carrier.blocked ? "BLOCKED" : (_h = carrier.creditStatus) !== null && _h !== void 0 ? _h : "UNKNOWN";
    await prisma_1.prisma.silCarrierRecord.upsert({
        where: { carrierId: carrier.carrierId },
        update: {
            carrierName: carrier.carrierName,
            status,
            data: json(carrier),
        },
        create: {
            carrierId: carrier.carrierId,
            carrierName: carrier.carrierName,
            status,
            data: json(carrier),
        },
    });
    const event = await persistSilWorkflowEvent({
        eventId: makeId("sil_evt_carrier_profile_updated"),
        eventType: "CARRIER_PROFILE_UPDATED",
        occurredAt: new Date().toISOString(),
        actor: "operator",
        source: "USER",
        workspaceId,
        carrierId: carrier.carrierId,
        summary: `Carrier profile updated for ${carrier.carrierName}.`,
        evidence: [`Credit: ${carrier.creditStatus}`, `Safety: ${carrier.safetyStatus}`, `Preferred: ${carrier.preferred}`],
    });
    return { carrier, event };
}
async function listSilLanes(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silLaneRecord.findMany({ orderBy: [{ origin: "asc" }, { destination: "asc" }] });
    return records.map((record) => withWorkspace(fromRecord(record))).filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
async function listSilPostings(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silLoadPostingRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => withWorkspace(fromRecord(record))).filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
async function createSilPosting(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    await seedSilPersistence();
    const load = await getSilLoad(input.loadId);
    const workspaceId = (_b = (_a = input.workspaceId) !== null && _a !== void 0 ? _a : load === null || load === void 0 ? void 0 : load.workspaceId) !== null && _b !== void 0 ? _b : DEFAULT_WORKSPACE_ID;
    const posting = {
        workspaceId,
        postingId: (_c = input.postingId) !== null && _c !== void 0 ? _c : `posting-${normalizeIdPart(input.loadId, "load")}-${Date.now()}`,
        loadId: input.loadId,
        board: (_d = input.board) !== null && _d !== void 0 ? _d : "INTERNAL",
        postedRate: input.postedRate,
        visibility: (_e = input.visibility) !== null && _e !== void 0 ? _e : "INVITED_CARRIERS",
        status: (_f = input.status) !== null && _f !== void 0 ? _f : "POSTED",
        postedAt: (_g = input.postedAt) !== null && _g !== void 0 ? _g : new Date().toISOString(),
        expiresAt: input.expiresAt,
        bidCount: (_h = input.bidCount) !== null && _h !== void 0 ? _h : 0,
        bestBidRate: input.bestBidRate,
        bestCarrierId: input.bestCarrierId,
    };
    await prisma_1.prisma.silLoadPostingRecord.create({
        data: {
            postingId: posting.postingId,
            loadId: posting.loadId,
            status: posting.status,
            board: posting.board,
            data: json(posting),
        },
    });
    await updateSilLoadStatus(posting.loadId, posting.status === "POSTED" ? "POSTED" : "READY_TO_POST");
    const event = await persistSilWorkflowEvent({
        eventId: makeId("sil_evt_load_posted"),
        eventType: "LOAD_POSTED",
        occurredAt: new Date().toISOString(),
        actor: "operator",
        source: "USER",
        workspaceId,
        loadId: posting.loadId,
        nextState: posting.status,
        summary: `Load posted to ${posting.board}.`,
        evidence: [`Visibility: ${posting.visibility}`, `Posted rate: ${(_j = posting.postedRate) !== null && _j !== void 0 ? _j : "not set"}`],
    });
    return { posting, event };
}
async function listSilBids(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silBidRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => withWorkspace(fromRecord(record))).filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
async function createSilBid(input) {
    var _a, _b, _c, _d, _e, _f;
    await seedSilPersistence();
    const load = await getSilLoad(input.loadId);
    const workspaceId = (_b = (_a = input.workspaceId) !== null && _a !== void 0 ? _a : load === null || load === void 0 ? void 0 : load.workspaceId) !== null && _b !== void 0 ? _b : DEFAULT_WORKSPACE_ID;
    let postingId = input.postingId;
    if (!postingId) {
        const activePosting = (await listSilPostings({ workspaceId })).find((posting) => posting.loadId === input.loadId && ["POSTED", "DRAFT"].includes(posting.status));
        if (activePosting) {
            postingId = activePosting.postingId;
        }
        else {
            const createdPosting = await createSilPosting({
                workspaceId,
                loadId: input.loadId,
                board: "INTERNAL",
                visibility: "INVITED_CARRIERS",
                status: "POSTED",
            });
            postingId = createdPosting.posting.postingId;
        }
    }
    const bid = {
        workspaceId,
        bidId: (_c = input.bidId) !== null && _c !== void 0 ? _c : `bid-${normalizeIdPart(input.carrierId, "carrier")}-${normalizeIdPart(input.loadId, "load")}-${Date.now()}`,
        postingId,
        loadId: input.loadId,
        carrierId: input.carrierId,
        bidRate: input.bidRate,
        currency: "USD",
        estimatedPickupCommitment: input.estimatedPickupCommitment,
        estimatedDeliveryCommitment: input.estimatedDeliveryCommitment,
        expiresAt: input.expiresAt,
        counterOfferRate: input.counterOfferRate,
        counterOfferStatus: (_d = input.counterOfferStatus) !== null && _d !== void 0 ? _d : "NONE",
        message: input.message,
        status: (_e = input.status) !== null && _e !== void 0 ? _e : "RECEIVED",
        receivedAt: (_f = input.receivedAt) !== null && _f !== void 0 ? _f : new Date().toISOString(),
        score: input.score,
    };
    await prisma_1.prisma.silBidRecord.create({
        data: {
            bidId: bid.bidId,
            postingId: bid.postingId,
            loadId: bid.loadId,
            carrierId: bid.carrierId,
            status: bid.status,
            bidRate: bid.bidRate,
            data: json(bid),
        },
    });
    const event = await persistSilWorkflowEvent({
        eventId: makeId("sil_evt_bid_received"),
        eventType: "BID_RECEIVED",
        occurredAt: new Date().toISOString(),
        actor: "carrier",
        source: "USER",
        workspaceId,
        loadId: bid.loadId,
        bidId: bid.bidId,
        carrierId: bid.carrierId,
        nextState: bid.status,
        summary: `Bid received for ${bid.loadId}.`,
        evidence: [`Carrier: ${bid.carrierId}`, `Bid rate: ${bid.bidRate}`],
    });
    return { bid, event };
}
async function updateSilBidCommercials(bidId, input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    await seedSilPersistence();
    const record = await prisma_1.prisma.silBidRecord.findUnique({ where: { bidId } });
    if (!record)
        return null;
    const bid = withWorkspace(fromRecord(record));
    const updatedBid = withWorkspace({
        ...bid,
        counterOfferRate: (_a = input.counterOfferRate) !== null && _a !== void 0 ? _a : bid.counterOfferRate,
        counterOfferStatus: (_c = (_b = input.counterOfferStatus) !== null && _b !== void 0 ? _b : bid.counterOfferStatus) !== null && _c !== void 0 ? _c : "NONE",
        expiresAt: (_d = input.expiresAt) !== null && _d !== void 0 ? _d : bid.expiresAt,
        message: (_e = input.message) !== null && _e !== void 0 ? _e : bid.message,
        status: (_f = input.status) !== null && _f !== void 0 ? _f : bid.status,
    });
    await prisma_1.prisma.silBidRecord.update({
        where: { bidId },
        data: { status: updatedBid.status, data: json(updatedBid) },
    });
    const eventType = input.counterOfferRate !== undefined ? "BID_COUNTERED" : "BID_REVIEWED";
    const event = await persistSilWorkflowEvent({
        eventId: makeId(`sil_evt_${eventType.toLowerCase()}`),
        eventType,
        occurredAt: new Date().toISOString(),
        actor: (_g = input.actor) !== null && _g !== void 0 ? _g : "operator",
        source: "USER",
        workspaceId: updatedBid.workspaceId,
        loadId: updatedBid.loadId,
        bidId: updatedBid.bidId,
        carrierId: updatedBid.carrierId,
        previousState: bid.status,
        nextState: updatedBid.status,
        summary: eventType === "BID_COUNTERED"
            ? `Counteroffer recorded for ${updatedBid.bidId}.`
            : `Bid commercial controls updated for ${updatedBid.bidId}.`,
        evidence: (_h = input.evidence) !== null && _h !== void 0 ? _h : [
            `Bid rate: ${updatedBid.bidRate}`,
            `Counteroffer: ${(_j = updatedBid.counterOfferRate) !== null && _j !== void 0 ? _j : "none"}`,
            `Expires at: ${(_k = updatedBid.expiresAt) !== null && _k !== void 0 ? _k : "not set"}`,
        ],
    });
    return { bid: updatedBid, event };
}
async function updateSilBidStatus(bidId, status) {
    await seedSilPersistence();
    const record = await prisma_1.prisma.silBidRecord.findUnique({ where: { bidId } });
    if (!record)
        return null;
    const bid = withWorkspace(fromRecord(record));
    const updatedBid = withWorkspace({ ...bid, status });
    await prisma_1.prisma.silBidRecord.update({
        where: { bidId },
        data: { status, data: json(updatedBid) },
    });
    return updatedBid;
}
async function listSilMarketRates(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silMarketRateRecord.findMany({ orderBy: { observedAt: "desc" } });
    return records.map((record) => withWorkspace(fromRecord(record))).filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
async function listSilGovernanceSignals(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silGovernanceSignalRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => withWorkspace(fromRecord(record))).filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
async function persistSilGovernanceSignal(signal, status = "DRAFT") {
    await seedSilPersistence();
    const scopedSignal = withWorkspace(signal);
    const id = signalId(scopedSignal);
    await prisma_1.prisma.silGovernanceSignalRecord.upsert({
        where: { signalId: id },
        update: {
            signalType: signal.signalType,
            severity: signal.severity,
            sourceModule: signal.sourceModule,
            status,
            data: json(scopedSignal),
        },
        create: {
            signalId: id,
            signalType: signal.signalType,
            severity: signal.severity,
            sourceModule: signal.sourceModule,
            status,
            data: json(scopedSignal),
        },
    });
    return { signalId: id, signal: scopedSignal };
}
async function persistSilWorkflowEvent(event) {
    await seedSilPersistence();
    const scopedEvent = withWorkspace(event);
    await prisma_1.prisma.silWorkflowEventRecord.upsert({
        where: { eventId: scopedEvent.eventId },
        update: {
            eventType: scopedEvent.eventType,
            loadId: scopedEvent.loadId,
            shipmentId: scopedEvent.shipmentId,
            bidId: scopedEvent.bidId,
            carrierId: scopedEvent.carrierId,
            occurredAt: new Date(scopedEvent.occurredAt),
            data: json(scopedEvent),
        },
        create: {
            eventId: scopedEvent.eventId,
            eventType: scopedEvent.eventType,
            loadId: scopedEvent.loadId,
            shipmentId: scopedEvent.shipmentId,
            bidId: scopedEvent.bidId,
            carrierId: scopedEvent.carrierId,
            occurredAt: new Date(scopedEvent.occurredAt),
            data: json(scopedEvent),
        },
    });
    return scopedEvent;
}
async function listPersistedWorkflowEvents(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silWorkflowEventRecord.findMany({
        where: {
            loadId: filters === null || filters === void 0 ? void 0 : filters.loadId,
            shipmentId: filters === null || filters === void 0 ? void 0 : filters.shipmentId,
            bidId: filters === null || filters === void 0 ? void 0 : filters.bidId,
        },
        orderBy: { occurredAt: "desc" },
    });
    return records.map((record) => withWorkspace(fromRecord(record))).filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
async function listSilLeanTemplates() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silLeanTemplateRecord.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }] });
    return records.map((record) => fromRecord(record));
}
async function createSilLeanRecord(input) {
    var _a, _b, _c, _d, _e, _f;
    await seedSilPersistence();
    const recordId = (_a = input.recordId) !== null && _a !== void 0 ? _a : `lean-${normalizeIdPart(input.organization, "org")}-${normalizeIdPart(input.templateId, "template")}-${Date.now()}`;
    const record = {
        workspaceId: (_b = input.workspaceId) !== null && _b !== void 0 ? _b : DEFAULT_WORKSPACE_ID,
        recordId,
        templateId: input.templateId,
        organization: input.organization,
        program: input.program,
        owner: (_c = input.owner) !== null && _c !== void 0 ? _c : "operator",
        title: input.title,
        status: (_d = input.status) !== null && _d !== void 0 ? _d : "SUBMITTED",
        evidence: (_e = input.evidence) !== null && _e !== void 0 ? _e : [],
        outputs: (_f = input.outputs) !== null && _f !== void 0 ? _f : [],
        notes: input.notes,
        governanceTrigger: input.governanceTrigger,
        sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
        createdAt: new Date().toISOString(),
    };
    await prisma_1.prisma.silLeanRecord.create({
        data: {
            recordId,
            templateId: record.templateId,
            organization: record.organization,
            program: record.program,
            status: record.status,
            data: json(record),
        },
    });
    const event = await persistSilWorkflowEvent({
        eventId: makeId("sil_evt_lean_record_created"),
        eventType: "LEAN_RECORD_CREATED",
        occurredAt: new Date().toISOString(),
        actor: record.owner,
        source: "USER",
        workspaceId: record.workspaceId,
        summary: `LEAN record submitted for ${record.organization}.`,
        evidence: record.evidence,
    });
    return { record, event };
}
async function listSilLeanRecords(filters) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silLeanRecord.findMany({
        where: {
            organization: filters === null || filters === void 0 ? void 0 : filters.organization,
            templateId: filters === null || filters === void 0 ? void 0 : filters.templateId,
            status: filters === null || filters === void 0 ? void 0 : filters.status,
        },
        orderBy: { updatedAt: "desc" },
    });
    return records
        .map((record) => withWorkspace(fromRecord(record)))
        .filter((record) => matchesWorkspace(record, filters === null || filters === void 0 ? void 0 : filters.workspaceId));
}
async function getSilWorkspace(workspaceId = defaultWorkspace.workspaceId) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.$queryRaw `
    SELECT "data" FROM "SilWorkspaceRecord" WHERE "workspaceId" = ${workspaceId} LIMIT 1
  `;
    return records[0] ? fromRecord(records[0]) : defaultWorkspace;
}
async function upsertSilWorkspace(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    await seedSilPersistence();
    const workspaceId = (_a = input.workspaceId) !== null && _a !== void 0 ? _a : defaultWorkspace.workspaceId;
    const now = new Date().toISOString();
    const selectedProductIds = Array.from(new Set(["sil", ...input.selectedProductIds]));
    const modules = input.modules.map((module) => {
        var _a;
        return ({
            ...module,
            enabled: selectedProductIds.includes(module.productId) && module.status !== "PLANNED",
            connectedAt: selectedProductIds.includes(module.productId) && module.status !== "PLANNED"
                ? (_a = module.connectedAt) !== null && _a !== void 0 ? _a : now
                : module.connectedAt,
        });
    });
    const workspace = {
        ...input,
        workspaceId,
        selectedProductIds,
        modules,
        status: (_b = input.status) !== null && _b !== void 0 ? _b : "TRIAL",
        governanceMode: (_c = input.governanceMode) !== null && _c !== void 0 ? _c : "SIGNAL_ONLY",
        teamMembers: (_d = input.teamMembers) !== null && _d !== void 0 ? _d : [],
        monthlyTokenBudget: (_e = input.monthlyTokenBudget) !== null && _e !== void 0 ? _e : 250000,
        monthlySpendLimitUsd: (_f = input.monthlySpendLimitUsd) !== null && _f !== void 0 ? _f : 25,
        enabledAgentProviders: (_g = input.enabledAgentProviders) !== null && _g !== void 0 ? _g : ["MANUAL"],
    };
    await ensureSilWorkspaceTable();
    await prisma_1.prisma.$executeRaw `
    INSERT INTO "SilWorkspaceRecord" ("id", "workspaceId", "organization", "ownerEmail", "status", "data", "updatedAt")
    VALUES (${makeId("sil_workspace")}, ${workspaceId}, ${workspace.organization}, ${(_h = workspace.ownerEmail) !== null && _h !== void 0 ? _h : null}, ${(_j = workspace.status) !== null && _j !== void 0 ? _j : "TRIAL"}, ${json(workspace)}, ${new Date()})
    ON CONFLICT("workspaceId") DO UPDATE SET
      "organization" = excluded."organization",
      "ownerEmail" = excluded."ownerEmail",
      "status" = excluded."status",
      "data" = excluded."data",
      "updatedAt" = excluded."updatedAt"
  `;
    const event = await persistSilWorkflowEvent({
        eventId: makeId("sil_evt_workspace_updated"),
        eventType: "WORKSPACE_UPDATED",
        occurredAt: now,
        actor: (_k = workspace.ownerEmail) !== null && _k !== void 0 ? _k : "operator",
        source: "USER",
        summary: `${workspace.workspaceName} product selection updated.`,
        evidence: [
            `Organization: ${workspace.organization}`,
            `Selected products: ${workspace.selectedProductIds.join(", ")}`,
            `Governance mode: ${workspace.governanceMode}`,
            `Team members: ${(_m = (_l = workspace.teamMembers) === null || _l === void 0 ? void 0 : _l.length) !== null && _m !== void 0 ? _m : 0}`,
            `Monthly token budget: ${(_o = workspace.monthlyTokenBudget) !== null && _o !== void 0 ? _o : "unset"}`,
        ],
    });
    return { workspace, event };
}
