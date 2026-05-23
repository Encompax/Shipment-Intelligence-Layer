"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedSilPersistence = seedSilPersistence;
exports.listSilLoads = listSilLoads;
exports.getSilLoad = getSilLoad;
exports.updateSilLoadStatus = updateSilLoadStatus;
exports.listSilShipments = listSilShipments;
exports.listSilCarriers = listSilCarriers;
exports.listSilLanes = listSilLanes;
exports.listSilPostings = listSilPostings;
exports.listSilBids = listSilBids;
exports.listSilMarketRates = listSilMarketRates;
exports.listSilGovernanceSignals = listSilGovernanceSignals;
exports.persistSilGovernanceSignal = persistSilGovernanceSignal;
exports.persistSilWorkflowEvent = persistSilWorkflowEvent;
exports.listPersistedWorkflowEvents = listPersistedWorkflowEvents;
exports.listSilLeanTemplates = listSilLeanTemplates;
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
async function seedSilPersistence() {
    if (seeded)
        return;
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
async function listSilBids() {
    await seedSilPersistence();
    const records = await prisma_1.prisma.silBidRecord.findMany({ orderBy: { updatedAt: "desc" } });
    return records.map((record) => fromRecord(record));
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
