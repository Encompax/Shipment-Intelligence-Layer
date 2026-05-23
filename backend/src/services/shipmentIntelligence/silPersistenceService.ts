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
const DEFAULT_WORKSPACE_ID = "workspace-shipment-operations";

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

const withWorkspace = <T extends { workspaceId?: string }>(record: T, workspaceId = DEFAULT_WORKSPACE_ID): T => ({
  ...record,
  workspaceId: record.workspaceId ?? workspaceId,
});

const matchesWorkspace = <T extends { workspaceId?: string }>(record: T, workspaceId?: string) =>
  !workspaceId || (record.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspaceId;

async function ensureSilWorkspaceTable() {
  await prisma.$executeRaw`
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
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "SilWorkspaceRecord_organization_idx" ON "SilWorkspaceRecord"("organization")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "SilWorkspaceRecord_status_idx" ON "SilWorkspaceRecord"("status")`;
}

export type SilLeanRecordPayload = {
  workspaceId?: string;
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

export type SilProductModuleSelection = {
  productId: string;
  status: "ACTIVE" | "AVAILABLE" | "PLANNED";
  enabled: boolean;
  connectedAt?: string;
  governanceRoute: string;
};

export type SilWorkspacePayload = {
  workspaceId?: string;
  organization: string;
  workspaceName: string;
  ownerEmail?: string;
  status?: "ACTIVE" | "TRIAL" | "MERGED" | "ARCHIVED";
  selectedProductIds: string[];
  modules: SilProductModuleSelection[];
  teamMembers?: Array<{
    email: string;
    role: "OWNER" | "ADMIN" | "OPERATOR" | "VIEWER";
    status: "ACTIVE" | "INVITED";
  }>;
  governanceMode?: "SIGNAL_ONLY" | "COUNCIL_REVIEW" | "ENTERPRISE_SYNC";
  monthlyTokenBudget?: number;
  monthlySpendLimitUsd?: number;
  enabledAgentProviders?: Array<"MANUAL" | "OPENAI" | "ANTHROPIC" | "HUGGINGFACE">;
};

const defaultWorkspace: SilWorkspacePayload = {
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

export async function seedSilPersistence() {
  if (seeded) return;
  await ensureSilWorkspaceTable();

  await Promise.all([
    ...loads.map((load) =>
      prisma.silLoadRecord.upsert({
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
      })
    ),
    ...shipments.map((shipment) =>
      prisma.silShipmentRecord.upsert({
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
      })
    ),
    ...carriers.map((carrier) =>
      prisma.silCarrierRecord.upsert({
        where: { carrierId: carrier.carrierId },
        update: {
          carrierName: carrier.carrierName,
          status: carrier.blocked ? "BLOCKED" : carrier.creditStatus ?? "UNKNOWN",
          data: json(withWorkspace(carrier)),
        },
        create: {
          carrierId: carrier.carrierId,
          carrierName: carrier.carrierName,
          status: carrier.blocked ? "BLOCKED" : carrier.creditStatus ?? "UNKNOWN",
          data: json(withWorkspace(carrier)),
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
      })
    ),
    ...postings.map((posting) =>
      prisma.silLoadPostingRecord.upsert({
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
      })
    ),
    ...marketRates.map((rate) =>
      prisma.silMarketRateRecord.upsert({
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
      })
    ),
    ...getGovernanceSignals().map((signal) =>
      prisma.silGovernanceSignalRecord.upsert({
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

  const existingWorkspace = await prisma.$queryRaw<Array<{ workspaceId: string }>>`
    SELECT "workspaceId" FROM "SilWorkspaceRecord" WHERE "workspaceId" = ${defaultWorkspace.workspaceId!} LIMIT 1
  `;
  if (existingWorkspace.length === 0) {
    await prisma.$executeRaw`
      INSERT INTO "SilWorkspaceRecord" ("id", "workspaceId", "organization", "ownerEmail", "status", "data", "updatedAt")
      VALUES (${makeId("sil_workspace")}, ${defaultWorkspace.workspaceId!}, ${defaultWorkspace.organization}, ${
        defaultWorkspace.ownerEmail ?? null
      }, ${defaultWorkspace.status ?? "TRIAL"}, ${json(defaultWorkspace)}, ${new Date()})
    `;
  }

  seeded = true;
}

export async function listSilLoads(filters?: { workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silLoadRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => withWorkspace(fromRecord<SilLoad>(record))).filter((record) => matchesWorkspace(record, filters?.workspaceId));
}

export async function getSilLoad(loadId: string) {
  await seedSilPersistence();
  const record = await prisma.silLoadRecord.findUnique({ where: { loadId } });
  return record ? withWorkspace(fromRecord<SilLoad>(record)) : null;
}

export async function updateSilLoadStatus(loadId: string, status: BrokerageLoadState) {
  const load = await getSilLoad(loadId);
  if (!load) return null;
  const updatedLoad = withWorkspace({ ...load, status });
  await prisma.silLoadRecord.update({
    where: { loadId },
    data: { status, data: json(updatedLoad) },
  });
  return updatedLoad;
}

export async function createSilLoad(input: Partial<SilLoad> & Pick<SilLoad, "customerId" | "origin" | "destination" | "mode" | "equipmentType">) {
  await seedSilPersistence();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const loadId =
    input.loadId ??
    `load-${normalizeIdPart(input.customerId, "customer")}-${normalizeIdPart(input.origin.state, "origin")}-${normalizeIdPart(
      input.destination.state,
      "dest"
    )}-${Date.now()}`;

  const load: SilLoad = {
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
    workspaceId,
    loadId: load.loadId,
    nextState: load.status,
    summary: `Load created for ${load.customerName ?? load.customerId}.`,
    evidence: ["Manual load creation", `Mode: ${load.mode}`, `Equipment: ${load.equipmentType}`],
  });

  return { load, event };
}

export async function listSilShipments(filters?: { workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silShipmentRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => withWorkspace(fromRecord<SilShipment>(record))).filter((record) => matchesWorkspace(record, filters?.workspaceId));
}

export async function listSilCarriers(filters?: { workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silCarrierRecord.findMany({ orderBy: { carrierName: "asc" } });
  return records.map((record) => withWorkspace(fromRecord<SilCarrierProfile>(record))).filter((record) => matchesWorkspace(record, filters?.workspaceId));
}

export async function upsertSilCarrier(input: Partial<SilCarrierProfile> & Pick<SilCarrierProfile, "carrierName">) {
  await seedSilPersistence();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const carrier: SilCarrierProfile = {
    workspaceId,
    carrierId: input.carrierId ?? `carrier-${normalizeIdPart(input.carrierName, "carrier")}`,
    carrierName: input.carrierName,
    mcNumber: input.mcNumber,
    dotNumber: input.dotNumber,
    insuranceStatus: input.insuranceStatus ?? "UNKNOWN",
    safetyStatus: input.safetyStatus ?? "UNKNOWN",
    creditStatus: input.creditStatus ?? "UNKNOWN",
    serviceScore: input.serviceScore,
    falloffRate: input.falloffRate,
    onTimeRate: input.onTimeRate,
    blocked: input.blocked ?? false,
    preferred: input.preferred ?? false,
  };
  const status = carrier.blocked ? "BLOCKED" : carrier.creditStatus ?? "UNKNOWN";

  await prisma.silCarrierRecord.upsert({
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

export async function listSilLanes(filters?: { workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silLaneRecord.findMany({ orderBy: [{ origin: "asc" }, { destination: "asc" }] });
  return records.map((record) => withWorkspace(fromRecord<SilLaneProfile>(record))).filter((record) => matchesWorkspace(record, filters?.workspaceId));
}

export async function listSilPostings(filters?: { workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silLoadPostingRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => withWorkspace(fromRecord<SilLoadPosting>(record))).filter((record) => matchesWorkspace(record, filters?.workspaceId));
}

export async function createSilPosting(input: Partial<SilLoadPosting> & Pick<SilLoadPosting, "loadId">) {
  await seedSilPersistence();
  const load = await getSilLoad(input.loadId);
  const workspaceId = input.workspaceId ?? load?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const posting: SilLoadPosting = {
    workspaceId,
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
    workspaceId,
    loadId: posting.loadId,
    nextState: posting.status,
    summary: `Load posted to ${posting.board}.`,
    evidence: [`Visibility: ${posting.visibility}`, `Posted rate: ${posting.postedRate ?? "not set"}`],
  });

  return { posting, event };
}

export async function listSilBids(filters?: { workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silBidRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => withWorkspace(fromRecord<SilBid>(record))).filter((record) => matchesWorkspace(record, filters?.workspaceId));
}

export async function createSilBid(input: Partial<SilBid> & Pick<SilBid, "loadId" | "carrierId" | "bidRate">) {
  await seedSilPersistence();
  const load = await getSilLoad(input.loadId);
  const workspaceId = input.workspaceId ?? load?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  let postingId = input.postingId;
  if (!postingId) {
    const activePosting = (await listSilPostings({ workspaceId })).find(
      (posting) => posting.loadId === input.loadId && ["POSTED", "DRAFT"].includes(posting.status)
    );
    if (activePosting) {
      postingId = activePosting.postingId;
    } else {
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
  const bid: SilBid = {
    workspaceId,
    bidId: input.bidId ?? `bid-${normalizeIdPart(input.carrierId, "carrier")}-${normalizeIdPart(input.loadId, "load")}-${Date.now()}`,
    postingId,
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

export async function updateSilBidStatus(bidId: string, status: BidState) {
  await seedSilPersistence();
  const record = await prisma.silBidRecord.findUnique({ where: { bidId } });
  if (!record) return null;
  const bid = withWorkspace(fromRecord<SilBid>(record));
  const updatedBid = withWorkspace({ ...bid, status });
  await prisma.silBidRecord.update({
    where: { bidId },
    data: { status, data: json(updatedBid) },
  });
  return updatedBid;
}

export async function listSilMarketRates(filters?: { workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silMarketRateRecord.findMany({ orderBy: { observedAt: "desc" } });
  return records.map((record) => withWorkspace(fromRecord<SilMarketRateObservation>(record))).filter((record) => matchesWorkspace(record, filters?.workspaceId));
}

export async function listSilGovernanceSignals(filters?: { workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silGovernanceSignalRecord.findMany({ orderBy: { updatedAt: "desc" } });
  return records.map((record) => withWorkspace(fromRecord<SilGovernanceSignalDraft>(record))).filter((record) => matchesWorkspace(record, filters?.workspaceId));
}

export async function persistSilGovernanceSignal(signal: SilGovernanceSignalDraft, status = "DRAFT") {
  await seedSilPersistence();
  const scopedSignal = withWorkspace(signal);
  const id = signalId(scopedSignal);
  await prisma.silGovernanceSignalRecord.upsert({
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

export async function persistSilWorkflowEvent(event: SilWorkflowEvent) {
  await seedSilPersistence();
  const scopedEvent = withWorkspace(event);
  await prisma.silWorkflowEventRecord.upsert({
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

export async function listPersistedWorkflowEvents(filters?: { loadId?: string; shipmentId?: string; bidId?: string; workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silWorkflowEventRecord.findMany({
    where: {
      loadId: filters?.loadId,
      shipmentId: filters?.shipmentId,
      bidId: filters?.bidId,
    },
    orderBy: { occurredAt: "desc" },
  });
  return records.map((record) => withWorkspace(fromRecord<SilWorkflowEvent>(record))).filter((record) => matchesWorkspace(record, filters?.workspaceId));
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
    workspaceId: input.workspaceId ?? DEFAULT_WORKSPACE_ID,
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
    workspaceId: record.workspaceId,
    summary: `LEAN record submitted for ${record.organization}.`,
    evidence: record.evidence,
  });

  return { record, event };
}

export async function listSilLeanRecords(filters?: { organization?: string; templateId?: string; status?: string; workspaceId?: string }) {
  await seedSilPersistence();
  const records = await prisma.silLeanRecord.findMany({
    where: {
      organization: filters?.organization,
      templateId: filters?.templateId,
      status: filters?.status,
    },
    orderBy: { updatedAt: "desc" },
  });
  return records
    .map((record) => withWorkspace(fromRecord<Record<string, unknown> & { workspaceId?: string }>(record)))
    .filter((record) => matchesWorkspace(record, filters?.workspaceId));
}

export async function getSilWorkspace(workspaceId = defaultWorkspace.workspaceId!) {
  await seedSilPersistence();
  const records = await prisma.$queryRaw<Array<{ data: string }>>`
    SELECT "data" FROM "SilWorkspaceRecord" WHERE "workspaceId" = ${workspaceId} LIMIT 1
  `;
  return records[0] ? fromRecord<SilWorkspacePayload>(records[0]) : defaultWorkspace;
}

export async function upsertSilWorkspace(input: SilWorkspacePayload) {
  await seedSilPersistence();
  const workspaceId = input.workspaceId ?? defaultWorkspace.workspaceId!;
  const now = new Date().toISOString();
  const selectedProductIds = Array.from(new Set(["sil", ...input.selectedProductIds]));
  const modules = input.modules.map((module) => ({
    ...module,
    enabled: selectedProductIds.includes(module.productId) && module.status !== "PLANNED",
    connectedAt:
      selectedProductIds.includes(module.productId) && module.status !== "PLANNED"
        ? module.connectedAt ?? now
        : module.connectedAt,
  }));
  const workspace: SilWorkspacePayload = {
    ...input,
    workspaceId,
    selectedProductIds,
    modules,
    status: input.status ?? "TRIAL",
    governanceMode: input.governanceMode ?? "SIGNAL_ONLY",
    teamMembers: input.teamMembers ?? [],
    monthlyTokenBudget: input.monthlyTokenBudget ?? 250000,
    monthlySpendLimitUsd: input.monthlySpendLimitUsd ?? 25,
    enabledAgentProviders: input.enabledAgentProviders ?? ["MANUAL"],
  };

  await ensureSilWorkspaceTable();
  await prisma.$executeRaw`
    INSERT INTO "SilWorkspaceRecord" ("id", "workspaceId", "organization", "ownerEmail", "status", "data", "updatedAt")
    VALUES (${makeId("sil_workspace")}, ${workspaceId}, ${workspace.organization}, ${workspace.ownerEmail ?? null}, ${
      workspace.status ?? "TRIAL"
    }, ${json(workspace)}, ${new Date()})
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
    actor: workspace.ownerEmail ?? "operator",
    source: "USER",
    summary: `${workspace.workspaceName} product selection updated.`,
    evidence: [
      `Organization: ${workspace.organization}`,
      `Selected products: ${workspace.selectedProductIds.join(", ")}`,
      `Governance mode: ${workspace.governanceMode}`,
      `Team members: ${workspace.teamMembers?.length ?? 0}`,
      `Monthly token budget: ${workspace.monthlyTokenBudget ?? "unset"}`,
    ],
  });

  return { workspace, event };
}
