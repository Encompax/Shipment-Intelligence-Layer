import { prisma } from "../../lib/prisma";
import {
  bids,
  carriers,
  getGovernanceSignals,
  lanes,
  loads,
  marketRates,
  postings,
  shipments,
} from "./mockData";
import { leanTemplates, SilLeanTemplate } from "./leanTemplates";
import {
  BidState,
  BrokerageLoadState,
  SilBid,
  SilCarrierProfile,
  SilGovernanceSignalDraft,
  SilLaneProfile,
  SilLoad,
  SilLoadPosting,
  SilMarketRateObservation,
  SilShipment,
  SilWorkflowEvent,
} from "./types";

let seeded = false;

const json = <T>(value: T) => JSON.stringify(value);

const fromRecord = <T>(record: { data: string }) => JSON.parse(record.data) as T;

const signalId = (signal: SilGovernanceSignalDraft) =>
  [
    signal.sourceModule.toLowerCase(),
    signal.signalType.toLowerCase(),
    signal.affectedEntities.loads?.[0] ?? signal.affectedEntities.shipments?.[0] ?? "general",
    signal.affectedEntities.carriers?.[0] ?? "system",
  ].join(":");

const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeIdPart = (value: string | undefined, fallback: string) =>
  (value ?? fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || fallback;

export type SilLeanRecordPayload = {
  recordId?: string;
  templateId: string;
  organization: string;
  program: string;
  owner?: string;
  title?: string;
  status?: "DRAFT" | "SUBMITTED" | "ROUTED_TO_ENCOMPAX" | "CLOSED";
  evidence?: string[];
  outputs?: string[];
  notes?: string;
  governanceTrigger?: string;
};

export async function seedSilPersistence() {
  if (seeded) return;

  await Promise.all([
    ...loads.map((load) =>
      prisma.silLoadRecord.upsert({
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
      })
    ),
    ...shipments.map((shipment) =>
      prisma.silShipmentRecord.upsert({
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
      })
    ),
    ...carriers.map((carrier) =>
      prisma.silCarrierRecord.upsert({
        where: { carrierId: carrier.carrierId },
        update: {
          carrierName: carrier.carrierName,
          status: carrier.blocked ? "BLOCKED" : carrier.creditStatus ?? "UNKNOWN",
          data: json(carrier),
        },
        create: {
          carrierId: carrier.carrierId,
          carrierName: carrier.carrierName,
          status: carrier.blocked ? "BLOCKED" : carrier.creditStatus ?? "UNKNOWN",
          data: json(carrier),
        },
      })
    ),
    ...lanes.map((lane) =>
      prisma.silLaneRecord.upsert({
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
      })
    ),
    ...postings.map((posting) =>
      prisma.silLoadPostingRecord.upsert({
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
      })
    ),
    ...bids.map((bid) =>
      prisma.silBidRecord.upsert({
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
      })
    ),
    ...marketRates.map((rate) =>
      prisma.silMarketRateRecord.upsert({
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
      })
    ),
    ...getGovernanceSignals().map((signal) =>
      prisma.silGovernanceSignalRecord.upsert({
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
      })
    ),
    ...leanTemplates.map((template) =>
      prisma.silLeanTemplateRecord.upsert({
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
      })
    ),
  ]);

  seeded = true;
}

export async function listSilLoads() {
  await seedSilPersistence();
  const records = await prisma.silLoadRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => fromRecord<SilLoad>(record));
}

export async function getSilLoad(loadId: string) {
  await seedSilPersistence();
  const record = await prisma.silLoadRecord.findUnique({ where: { loadId } });
  return record ? fromRecord<SilLoad>(record) : null;
}

export async function updateSilLoadStatus(loadId: string, status: BrokerageLoadState) {
  const load = await getSilLoad(loadId);
  if (!load) return null;
  const updatedLoad = { ...load, status };
  await prisma.silLoadRecord.update({
    where: { loadId },
    data: { status, data: json(updatedLoad) },
  });
  return updatedLoad;
}

export async function createSilLoad(input: Partial<SilLoad> & Pick<SilLoad, "customerId" | "origin" | "destination" | "mode" | "equipmentType">) {
  await seedSilPersistence();
  const loadId =
    input.loadId ??
    `load-${normalizeIdPart(input.customerId, "customer")}-${normalizeIdPart(input.origin.state, "origin")}-${normalizeIdPart(
      input.destination.state,
      "dest"
    )}-${Date.now()}`;

  const load: SilLoad = {
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
    status: input.status ?? "LOAD_CREATED",
    targetSellRate: input.targetSellRate,
    targetBuyRate: input.targetBuyRate,
    marginTarget: input.marginTarget,
    source: input.source ?? "manual",
  };

  await prisma.silLoadRecord.create({
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
    summary: `Load created for ${load.customerName ?? load.customerId}.`,
    evidence: ["Manual load creation", `Mode: ${load.mode}`, `Equipment: ${load.equipmentType}`],
  });

  return { load, event };
}

export async function listSilShipments() {
  await seedSilPersistence();
  const records = await prisma.silShipmentRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => fromRecord<SilShipment>(record));
}

export async function listSilCarriers() {
  await seedSilPersistence();
  const records = await prisma.silCarrierRecord.findMany({ orderBy: { carrierName: "asc" } });
  return records.map((record) => fromRecord<SilCarrierProfile>(record));
}

export async function listSilLanes() {
  await seedSilPersistence();
  const records = await prisma.silLaneRecord.findMany({ orderBy: [{ origin: "asc" }, { destination: "asc" }] });
  return records.map((record) => fromRecord<SilLaneProfile>(record));
}

export async function listSilPostings() {
  await seedSilPersistence();
  const records = await prisma.silLoadPostingRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => fromRecord<SilLoadPosting>(record));
}

export async function createSilPosting(input: Partial<SilLoadPosting> & Pick<SilLoadPosting, "loadId">) {
  await seedSilPersistence();
  const posting: SilLoadPosting = {
    postingId: input.postingId ?? `posting-${normalizeIdPart(input.loadId, "load")}-${Date.now()}`,
    loadId: input.loadId,
    board: input.board ?? "INTERNAL",
    postedRate: input.postedRate,
    visibility: input.visibility ?? "INVITED_CARRIERS",
    status: input.status ?? "POSTED",
    postedAt: input.postedAt ?? new Date().toISOString(),
    expiresAt: input.expiresAt,
    bidCount: input.bidCount ?? 0,
    bestBidRate: input.bestBidRate,
    bestCarrierId: input.bestCarrierId,
  };

  await prisma.silLoadPostingRecord.create({
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
    evidence: [`Visibility: ${posting.visibility}`, `Posted rate: ${posting.postedRate ?? "not set"}`],
  });

  return { posting, event };
}

export async function listSilBids() {
  await seedSilPersistence();
  const records = await prisma.silBidRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => fromRecord<SilBid>(record));
}

export async function createSilBid(input: Partial<SilBid> & Pick<SilBid, "postingId" | "loadId" | "carrierId" | "bidRate">) {
  await seedSilPersistence();
  const bid: SilBid = {
    bidId: input.bidId ?? `bid-${normalizeIdPart(input.carrierId, "carrier")}-${normalizeIdPart(input.loadId, "load")}-${Date.now()}`,
    postingId: input.postingId,
    loadId: input.loadId,
    carrierId: input.carrierId,
    bidRate: input.bidRate,
    currency: "USD",
    estimatedPickupCommitment: input.estimatedPickupCommitment,
    estimatedDeliveryCommitment: input.estimatedDeliveryCommitment,
    message: input.message,
    status: input.status ?? "RECEIVED",
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    score: input.score,
  };

  await prisma.silBidRecord.create({
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

export async function updateSilBidStatus(bidId: string, status: BidState) {
  await seedSilPersistence();
  const record = await prisma.silBidRecord.findUnique({ where: { bidId } });
  if (!record) return null;
  const bid = fromRecord<SilBid>(record);
  const updatedBid = { ...bid, status };
  await prisma.silBidRecord.update({
    where: { bidId },
    data: { status, data: json(updatedBid) },
  });
  return updatedBid;
}

export async function listSilMarketRates() {
  await seedSilPersistence();
  const records = await prisma.silMarketRateRecord.findMany({ orderBy: { observedAt: "desc" } });
  return records.map((record) => fromRecord<SilMarketRateObservation>(record));
}

export async function listSilGovernanceSignals() {
  await seedSilPersistence();
  const records = await prisma.silGovernanceSignalRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => fromRecord<SilGovernanceSignalDraft>(record));
}

export async function persistSilGovernanceSignal(signal: SilGovernanceSignalDraft, status = "DRAFT") {
  await seedSilPersistence();
  const id = signalId(signal);
  await prisma.silGovernanceSignalRecord.upsert({
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

export async function persistSilWorkflowEvent(event: SilWorkflowEvent) {
  await seedSilPersistence();
  await prisma.silWorkflowEventRecord.upsert({
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

export async function listPersistedWorkflowEvents(filters?: { loadId?: string; shipmentId?: string; bidId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silWorkflowEventRecord.findMany({
    where: {
      loadId: filters?.loadId,
      shipmentId: filters?.shipmentId,
      bidId: filters?.bidId,
    },
    orderBy: { occurredAt: "desc" },
  });
  return records.map((record) => fromRecord<SilWorkflowEvent>(record));
}

export async function listSilLeanTemplates() {
  await seedSilPersistence();
  const records = await prisma.silLeanTemplateRecord.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }] });
  return records.map((record) => fromRecord<SilLeanTemplate>(record));
}

export async function createSilLeanRecord(input: SilLeanRecordPayload) {
  await seedSilPersistence();
  const recordId =
    input.recordId ??
    `lean-${normalizeIdPart(input.organization, "org")}-${normalizeIdPart(input.templateId, "template")}-${Date.now()}`;
  const record = {
    recordId,
    templateId: input.templateId,
    organization: input.organization,
    program: input.program,
    owner: input.owner ?? "operator",
    title: input.title,
    status: input.status ?? "SUBMITTED",
    evidence: input.evidence ?? [],
    outputs: input.outputs ?? [],
    notes: input.notes,
    governanceTrigger: input.governanceTrigger,
    sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
    createdAt: new Date().toISOString(),
  };

  await prisma.silLeanRecord.create({
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

export async function listSilLeanRecords(filters?: { organization?: string; templateId?: string; status?: string }) {
  await seedSilPersistence();
  const records = await prisma.silLeanRecord.findMany({
    where: {
      organization: filters?.organization,
      templateId: filters?.templateId,
      status: filters?.status,
    },
    orderBy: { updatedAt: "desc" },
  });
  return records.map((record) => fromRecord<Record<string, unknown>>(record));
}
