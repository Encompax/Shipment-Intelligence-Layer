"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedSilPersistence = seedSilPersistence;
exports.listSilLoads = listSilLoads;
exports.getSilLoad = getSilLoad;
exports.updateSilLoadStatus = updateSilLoadStatus;
exports.createSilLoad = createSilLoad;
exports.listSilShipments = listSilShipments;
exports.listSilCarriers = listSilCarriers;
exports.listSilLanes = listSilLanes;
exports.listSilPostings = listSilPostings;
exports.createSilPosting = createSilPosting;
exports.listSilBids = listSilBids;
exports.createSilBid = createSilBid;
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
    workspaceId: "workspace-shipment-operations",
    organization: "Example Organization",
    workspaceName: "Shipment Operations",
    ownerEmail: "operator@example.com",
    status: "TRIAL",
    selectedProductIds: ["sil"],
    governanceMode: "SIGNAL_ONLY",
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
                data: json(load),
            },
            create: {
                loadId: load.loadId,
                customerId: load.customerId,
                status: load.status,
                source: load.source,
                data: json(load),
            },
        })),
        ...mockData_1.shipments.map((shipment) => prisma_1.prisma.silShipmentRecord.upsert({
            where: { shipmentId: shipment.shipmentId },
            update: {
                loadId: shipment.loadId,
                state: shipment.state,
                source: shipment.source,
                data: json(shipment),
            },
            create: {
                shipmentId: shipment.shipmentId,
                loadId: shipment.loadId,
                state: shipment.state,
                source: shipment.source,
                data: json(shipment),
            },
        })),
        ...mockData_1.carriers.map((carrier) => {
            var _a, _b;
            return prisma_1.prisma.silCarrierRecord.upsert({
                where: { carrierId: carrier.carrierId },
                update: {
                    carrierName: carrier.carrierName,
                    status: carrier.blocked ? "BLOCKED" : (_a = carrier.creditStatus) !== null && _a !== void 0 ? _a : "UNKNOWN",
                    data: json(carrier),
                },
                create: {
                    carrierId: carrier.carrierId,
                    carrierName: carrier.carrierName,
                    status: carrier.blocked ? "BLOCKED" : (_b = carrier.creditStatus) !== null && _b !== void 0 ? _b : "UNKNOWN",
                    data: json(carrier),
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
                data: json(lane),
            },
            create: {
                laneId: lane.laneId,
                origin: lane.originRegion,
                destination: lane.destinationRegion,
                mode: lane.mode,
                equipment: lane.equipmentType,
                data: json(lane),
            },
        })),
        ...mockData_1.postings.map((posting) => prisma_1.prisma.silLoadPostingRecord.upsert({
            where: { postingId: posting.postingId },
            update: {
                loadId: posting.loadId,
                status: posting.status,
                board: posting.board,
                data: json(posting),
            },
            create: {
                postingId: posting.postingId,
                loadId: posting.loadId,
                status: posting.status,
                board: posting.board,
                data: json(posting),
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
                data: json(bid),
            },
            create: {
                bidId: bid.bidId,
                postingId: bid.postingId,
                loadId: bid.loadId,
                carrierId: bid.carrierId,
                status: bid.status,
                bidRate: bid.bidRate,
                data: json(bid),
            },
        })),
        ...mockData_1.marketRates.map((rate) => prisma_1.prisma.silMarketRateRecord.upsert({
            where: { observationId: rate.observationId },
            update: {
                laneId: rate.laneId,
                source: rate.source,
                observedAt: new Date(rate.observedAt),
                data: json(rate),
            },
            create: {
                observationId: rate.observationId,
                laneId: rate.laneId,
                source: rate.source,
                observedAt: new Date(rate.observedAt),
                data: json(rate),
            },
        })),
        ...(0, mockData_1.getGovernanceSignals)().map((signal) => prisma_1.prisma.silGovernanceSignalRecord.upsert({
            where: { signalId: signalId(signal) },
            update: {
                signalType: signal.signalType,
                severity: signal.severity,
                sourceModule: signal.sourceModule,
                data: json(signal),
            },
            create: {
                signalId: signalId(signal),
                signalType: signal.signalType,
                severity: signal.severity,
                sourceModule: signal.sourceModule,
                data: json(signal),
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
async function listSilLoads() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silLoadRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => fromRecord(record));
}
async function getSilLoad(loadId) {
    await seedSilPersistence();
    const record = await prisma_1.prisma.silLoadRecord.findUnique({ where: { loadId } });
    return record ? fromRecord(record) : null;
}
async function updateSilLoadStatus(loadId, status) {
    const load = await getSilLoad(loadId);
    if (!load)
        return null;
    const updatedLoad = { ...load, status };
    await prisma_1.prisma.silLoadRecord.update({
        where: { loadId },
        data: { status, data: json(updatedLoad) },
    });
    return updatedLoad;
}
async function createSilLoad(input) {
    var _a, _b, _c, _d;
    await seedSilPersistence();
    const loadId = (_a = input.loadId) !== null && _a !== void 0 ? _a : `load-${normalizeIdPart(input.customerId, "customer")}-${normalizeIdPart(input.origin.state, "origin")}-${normalizeIdPart(input.destination.state, "dest")}-${Date.now()}`;
    const load = {
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
        status: (_b = input.status) !== null && _b !== void 0 ? _b : "LOAD_CREATED",
        targetSellRate: input.targetSellRate,
        targetBuyRate: input.targetBuyRate,
        marginTarget: input.marginTarget,
        source: (_c = input.source) !== null && _c !== void 0 ? _c : "manual",
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
        loadId: load.loadId,
        nextState: load.status,
        summary: `Load created for ${(_d = load.customerName) !== null && _d !== void 0 ? _d : load.customerId}.`,
        evidence: ["Manual load creation", `Mode: ${load.mode}`, `Equipment: ${load.equipmentType}`],
    });
    return { load, event };
}
async function listSilShipments() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silShipmentRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => fromRecord(record));
}
async function listSilCarriers() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silCarrierRecord.findMany({ orderBy: { carrierName: "asc" } });
    return records.map((record) => fromRecord(record));
}
async function listSilLanes() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silLaneRecord.findMany({ orderBy: [{ origin: "asc" }, { destination: "asc" }] });
    return records.map((record) => fromRecord(record));
}
async function listSilPostings() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silLoadPostingRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => fromRecord(record));
}
async function createSilPosting(input) {
    var _a, _b, _c, _d, _e, _f, _g;
    await seedSilPersistence();
    const posting = {
        postingId: (_a = input.postingId) !== null && _a !== void 0 ? _a : `posting-${normalizeIdPart(input.loadId, "load")}-${Date.now()}`,
        loadId: input.loadId,
        board: (_b = input.board) !== null && _b !== void 0 ? _b : "INTERNAL",
        postedRate: input.postedRate,
        visibility: (_c = input.visibility) !== null && _c !== void 0 ? _c : "INVITED_CARRIERS",
        status: (_d = input.status) !== null && _d !== void 0 ? _d : "POSTED",
        postedAt: (_e = input.postedAt) !== null && _e !== void 0 ? _e : new Date().toISOString(),
        expiresAt: input.expiresAt,
        bidCount: (_f = input.bidCount) !== null && _f !== void 0 ? _f : 0,
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
        loadId: posting.loadId,
        nextState: posting.status,
        summary: `Load posted to ${posting.board}.`,
        evidence: [`Visibility: ${posting.visibility}`, `Posted rate: ${(_g = posting.postedRate) !== null && _g !== void 0 ? _g : "not set"}`],
    });
    return { posting, event };
}
async function listSilBids() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silBidRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => fromRecord(record));
}
async function createSilBid(input) {
    var _a, _b, _c;
    await seedSilPersistence();
    const bid = {
        bidId: (_a = input.bidId) !== null && _a !== void 0 ? _a : `bid-${normalizeIdPart(input.carrierId, "carrier")}-${normalizeIdPart(input.loadId, "load")}-${Date.now()}`,
        postingId: input.postingId,
        loadId: input.loadId,
        carrierId: input.carrierId,
        bidRate: input.bidRate,
        currency: "USD",
        estimatedPickupCommitment: input.estimatedPickupCommitment,
        estimatedDeliveryCommitment: input.estimatedDeliveryCommitment,
        message: input.message,
        status: (_b = input.status) !== null && _b !== void 0 ? _b : "RECEIVED",
        receivedAt: (_c = input.receivedAt) !== null && _c !== void 0 ? _c : new Date().toISOString(),
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
        loadId: bid.loadId,
        bidId: bid.bidId,
        carrierId: bid.carrierId,
        nextState: bid.status,
        summary: `Bid received for ${bid.loadId}.`,
        evidence: [`Carrier: ${bid.carrierId}`, `Bid rate: ${bid.bidRate}`],
    });
    return { bid, event };
}
async function updateSilBidStatus(bidId, status) {
    await seedSilPersistence();
    const record = await prisma_1.prisma.silBidRecord.findUnique({ where: { bidId } });
    if (!record)
        return null;
    const bid = fromRecord(record);
    const updatedBid = { ...bid, status };
    await prisma_1.prisma.silBidRecord.update({
        where: { bidId },
        data: { status, data: json(updatedBid) },
    });
    return updatedBid;
}
async function listSilMarketRates() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silMarketRateRecord.findMany({ orderBy: { observedAt: "desc" } });
    return records.map((record) => fromRecord(record));
}
async function listSilGovernanceSignals() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silGovernanceSignalRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => fromRecord(record));
}
async function persistSilGovernanceSignal(signal, status = "DRAFT") {
    await seedSilPersistence();
    const id = signalId(signal);
    await prisma_1.prisma.silGovernanceSignalRecord.upsert({
        where: { signalId: id },
        update: {
            signalType: signal.signalType,
            severity: signal.severity,
            sourceModule: signal.sourceModule,
            status,
            data: json(signal),
        },
        create: {
            signalId: id,
            signalType: signal.signalType,
            severity: signal.severity,
            sourceModule: signal.sourceModule,
            status,
            data: json(signal),
        },
    });
    return { signalId: id, signal };
}
async function persistSilWorkflowEvent(event) {
    await seedSilPersistence();
    await prisma_1.prisma.silWorkflowEventRecord.upsert({
        where: { eventId: event.eventId },
        update: {
            eventType: event.eventType,
            loadId: event.loadId,
            shipmentId: event.shipmentId,
            bidId: event.bidId,
            carrierId: event.carrierId,
            occurredAt: new Date(event.occurredAt),
            data: json(event),
        },
        create: {
            eventId: event.eventId,
            eventType: event.eventType,
            loadId: event.loadId,
            shipmentId: event.shipmentId,
            bidId: event.bidId,
            carrierId: event.carrierId,
            occurredAt: new Date(event.occurredAt),
            data: json(event),
        },
    });
    return event;
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
    return records.map((record) => fromRecord(record));
}
async function listSilLeanTemplates() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silLeanTemplateRecord.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }] });
    return records.map((record) => fromRecord(record));
}
async function createSilLeanRecord(input) {
    var _a, _b, _c, _d, _e;
    await seedSilPersistence();
    const recordId = (_a = input.recordId) !== null && _a !== void 0 ? _a : `lean-${normalizeIdPart(input.organization, "org")}-${normalizeIdPart(input.templateId, "template")}-${Date.now()}`;
    const record = {
        recordId,
        templateId: input.templateId,
        organization: input.organization,
        program: input.program,
        owner: (_b = input.owner) !== null && _b !== void 0 ? _b : "operator",
        title: input.title,
        status: (_c = input.status) !== null && _c !== void 0 ? _c : "SUBMITTED",
        evidence: (_d = input.evidence) !== null && _d !== void 0 ? _d : [],
        outputs: (_e = input.outputs) !== null && _e !== void 0 ? _e : [],
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
    return records.map((record) => fromRecord(record));
}
async function getSilWorkspace(workspaceId = defaultWorkspace.workspaceId) {
    await seedSilPersistence();
    const records = await prisma_1.prisma.$queryRaw `
    SELECT "data" FROM "SilWorkspaceRecord" WHERE "workspaceId" = ${workspaceId} LIMIT 1
  `;
    return records[0] ? fromRecord(records[0]) : defaultWorkspace;
}
async function upsertSilWorkspace(input) {
    var _a, _b, _c, _d, _e, _f, _g;
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
    };
    await ensureSilWorkspaceTable();
    await prisma_1.prisma.$executeRaw `
    INSERT INTO "SilWorkspaceRecord" ("id", "workspaceId", "organization", "ownerEmail", "status", "data", "updatedAt")
    VALUES (${makeId("sil_workspace")}, ${workspaceId}, ${workspace.organization}, ${(_e = workspace.ownerEmail) !== null && _e !== void 0 ? _e : null}, ${(_f = workspace.status) !== null && _f !== void 0 ? _f : "TRIAL"}, ${json(workspace)}, ${new Date()})
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
        actor: (_g = workspace.ownerEmail) !== null && _g !== void 0 ? _g : "operator",
        source: "USER",
        summary: `${workspace.workspaceName} product selection updated.`,
        evidence: [
            `Organization: ${workspace.organization}`,
            `Selected products: ${workspace.selectedProductIds.join(", ")}`,
            `Governance mode: ${workspace.governanceMode}`,
        ],
    });
    return { workspace, event };
}
