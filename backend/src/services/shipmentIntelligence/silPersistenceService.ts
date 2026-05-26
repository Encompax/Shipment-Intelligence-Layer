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
  SilCarrierInviteCommunication,
  SilCarrierProfile,
  SilGovernanceSignalDraft,
  SilLaneProfile,
  SilLoad,
  SilLoadPosting,
  SilMarketRateObservation,
  SilShipment,
  SilShipmentDocument,
  SilShipmentDocumentRequirement,
  SilTenderResponse,
  SilWorkflowEvent,
  ShipmentState,
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

const activeDocument = (documents: SilShipmentDocument[], documentType: SilShipmentDocument["documentType"]) =>
  documents.find((document) => document.documentType === documentType && document.status !== "REJECTED");

const shipmentHasReached = (state: ShipmentState, requiredFor: ShipmentState[]) => requiredFor.includes(state);

export function buildSilShipmentDocumentRequirements(
  shipment: SilShipment,
  documents: SilShipmentDocument[]
): SilShipmentDocumentRequirement[] {
  const state = shipment.state;
  const hasException = state === "EXCEPTION" || Boolean(shipment.exception);
  const definitions: Array<
    Omit<SilShipmentDocumentRequirement, "required" | "satisfied" | "status" | "evidence"> & {
      requiredWhen?: (shipment: SilShipment) => boolean;
      evidenceWhenMissing: string;
      evidenceWhenSatisfied: string;
    }
  > = [
    {
      documentType: "RATE_CONFIRMATION",
      label: "Rate confirmation",
      requiredFor: ["BOOKED", "DISPATCHED", "AT_PICKUP", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "EXCEPTION"],
      evidenceWhenMissing: "Attach the agreed rate confirmation before dispatch or invoice controls are trusted.",
      evidenceWhenSatisfied: "Rate agreement is attached to the shipment packet.",
    },
    {
      documentType: "BOL",
      label: "Bill of lading",
      requiredFor: ["DISPATCHED", "AT_PICKUP", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "EXCEPTION"],
      evidenceWhenMissing: "Attach the BOL once the shipment is dispatched or picked up.",
      evidenceWhenSatisfied: "BOL is attached for pickup and transit evidence.",
    },
    {
      documentType: "POD",
      label: "Proof of delivery",
      requiredFor: ["DELIVERED"],
      evidenceWhenMissing: "Attach POD before treating the delivery packet as complete.",
      evidenceWhenSatisfied: "POD is attached and the delivery packet can be reviewed.",
    },
    {
      documentType: "DETENTION_EVIDENCE",
      label: "Detention evidence",
      requiredFor: ["EXCEPTION"],
      requiredWhen: () => hasException,
      evidenceWhenMissing: "Attach detention or delay evidence when the shipment is in exception handling.",
      evidenceWhenSatisfied: "Exception evidence is attached for detention or delay review.",
    },
    {
      documentType: "CUSTOMER_APPROVAL",
      label: "Customer approval",
      requiredFor: ["EXCEPTION"],
      requiredWhen: () => hasException,
      evidenceWhenMissing: "Attach customer approval for exception-driven cost, timing, or service changes.",
      evidenceWhenSatisfied: "Customer approval is attached for exception handling.",
    },
  ];

  return definitions.map((definition) => {
    const document = activeDocument(documents, definition.documentType);
    const required =
      shipmentHasReached(state, definition.requiredFor) || Boolean(definition.requiredWhen?.(shipment));
    const satisfied = Boolean(document);
    const status: SilShipmentDocumentRequirement["status"] = !required
      ? "NOT_YET_REQUIRED"
      : document?.status === "VERIFIED"
        ? "VERIFIED"
        : satisfied
          ? "UPLOADED"
          : "MISSING";

    return {
      documentType: definition.documentType,
      label: definition.label,
      requiredFor: definition.requiredFor,
      required,
      satisfied,
      status,
      evidence: satisfied ? definition.evidenceWhenSatisfied : definition.evidenceWhenMissing,
    };
  });
}

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

async function ensureSilDocumentTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "SilDocumentRecord" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "documentId" TEXT NOT NULL UNIQUE,
      "workspaceId" TEXT NOT NULL,
      "shipmentId" TEXT NOT NULL,
      "loadId" TEXT,
      "documentType" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'UPLOADED',
      "data" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "SilDocumentRecord_workspaceId_idx" ON "SilDocumentRecord"("workspaceId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "SilDocumentRecord_shipmentId_idx" ON "SilDocumentRecord"("shipmentId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "SilDocumentRecord_loadId_idx" ON "SilDocumentRecord"("loadId")`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "SilDocumentRecord_documentType_idx" ON "SilDocumentRecord"("documentType")`;
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
  await ensureSilDocumentTable();

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
    fuelSurcharge: input.fuelSurcharge,
    accessorialEstimate: input.accessorialEstimate,
    lumperEstimate: input.lumperEstimate,
    detentionRatePerHour: input.detentionRatePerHour,
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

export async function createSilShipmentFromAward(input: {
  load: SilLoad;
  bid: SilBid;
  carrier?: SilCarrierProfile;
  actor?: string;
}) {
  await seedSilPersistence();
  const workspaceId = input.load.workspaceId ?? input.bid.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const existing = (await listSilShipments({ workspaceId })).find((shipment) => shipment.loadId === input.load.loadId);
  const shipmentId = existing?.shipmentId ?? `shipment-${normalizeIdPart(input.load.loadId, "load")}`;
  const carrierName = input.carrier?.carrierName ?? input.bid.carrierId;
  const shipment: SilShipment = withWorkspace({
    ...(existing ?? {}),
    workspaceId,
    shipmentId,
    loadId: input.load.loadId,
    carrierId: input.bid.carrierId,
    carrierName,
    state: existing?.state ?? "BOOKED",
    stops: existing?.stops?.length
      ? existing.stops
      : [
          {
            stopId: `${shipmentId}-pickup`,
            shipmentId,
            sequence: 1,
            type: "PICKUP",
            location: input.load.origin,
            appointmentStart: input.load.pickupWindowStart,
            appointmentEnd: input.load.pickupWindowEnd,
            appointmentStatus: input.load.pickupWindowStart ? "REQUESTED" : undefined,
            status: "PENDING",
          },
          {
            stopId: `${shipmentId}-delivery`,
            shipmentId,
            sequence: 2,
            type: "DELIVERY",
            location: input.load.destination,
            appointmentStart: input.load.deliveryWindowStart,
            appointmentEnd: input.load.deliveryWindowEnd,
            appointmentStatus: input.load.deliveryWindowStart ? "REQUESTED" : undefined,
            status: "PENDING",
          },
        ],
    cost:
      input.bid.totalCost ??
      input.bid.bidRate +
        (input.bid.fuelSurcharge ?? 0) +
        (input.bid.accessorialTotal ?? 0) +
        (input.bid.lumperFee ?? 0) +
        (input.bid.detentionEstimate ?? 0),
    estimatedDelivery: input.load.deliveryWindowEnd,
    source: existing?.source ?? "manual",
  });

  await prisma.silShipmentRecord.upsert({
    where: { shipmentId },
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
  });

  const event = await persistSilWorkflowEvent({
    eventId: makeId("sil_evt_shipment_created"),
    eventType: "SHIPMENT_CREATED",
    occurredAt: new Date().toISOString(),
    actor: input.actor ?? "operator",
    source: "USER",
    workspaceId,
    loadId: input.load.loadId,
    shipmentId: shipment.shipmentId,
    bidId: input.bid.bidId,
    carrierId: input.bid.carrierId,
    nextState: shipment.state,
    shipmentState: shipment.state,
    summary: `Shipment execution record created for ${input.load.loadId}.`,
    evidence: [
      `Carrier: ${carrierName}`,
      `Bid: ${input.bid.bidId}`,
      `Cost: ${shipment.cost ?? "not set"}`,
      `Stops: ${shipment.stops.length}`,
    ],
  });

  return { shipment, event };
}

export async function listSilAppointmentCalendar(filters?: { workspaceId?: string; from?: string; to?: string }) {
  const shipments = await listSilShipments({ workspaceId: filters?.workspaceId });
  const fromTime = filters?.from ? new Date(filters.from).getTime() : null;
  const toTime = filters?.to ? new Date(filters.to).getTime() : null;

  return shipments
    .flatMap((shipment) =>
      shipment.stops.map((stop) => ({
        workspaceId: shipment.workspaceId,
        shipmentId: shipment.shipmentId,
        loadId: shipment.loadId,
        carrierId: shipment.carrierId,
        carrierName: shipment.carrierName,
        shipmentState: shipment.state,
        stopId: stop.stopId,
        sequence: stop.sequence,
        type: stop.type,
        facilityName: stop.location.facilityName,
        city: stop.location.city,
        state: stop.location.state,
        dockDoor: stop.dockDoor,
        appointmentStart: stop.appointmentStart,
        appointmentEnd: stop.appointmentEnd,
        appointmentStatus: stop.appointmentStatus ?? (stop.appointmentStart ? "CONFIRMED" : "REQUESTED"),
        stopStatus: stop.status,
      }))
    )
    .filter((appointment) => {
      if (!appointment.appointmentStart && !appointment.appointmentEnd) return true;
      const start = appointment.appointmentStart ? new Date(appointment.appointmentStart).getTime() : null;
      const end = appointment.appointmentEnd ? new Date(appointment.appointmentEnd).getTime() : start;
      if (fromTime && end && end < fromTime) return false;
      if (toTime && start && start > toTime) return false;
      return true;
    })
    .sort((a, b) => String(a.appointmentStart ?? "").localeCompare(String(b.appointmentStart ?? "")));
}

export async function updateSilStopAppointment(input: {
  shipmentId: string;
  stopId: string;
  workspaceId?: string;
  appointmentStart?: string;
  appointmentEnd?: string;
  dockDoor?: string;
  appointmentStatus?: SilShipment["stops"][number]["appointmentStatus"];
  actor?: string;
  evidence?: string[];
}) {
  await seedSilPersistence();
  const record = await prisma.silShipmentRecord.findUnique({ where: { shipmentId: input.shipmentId } });
  if (!record) return null;

  const current = withWorkspace(fromRecord<SilShipment>(record));
  if (!matchesWorkspace(current, input.workspaceId)) return null;
  const stop = current.stops.find((item) => item.stopId === input.stopId);
  if (!stop) return null;

  const nextStatus = input.appointmentStatus ?? (stop.appointmentStart ? "RESCHEDULED" : "CONFIRMED");
  const updatedStops = current.stops.map((item) =>
    item.stopId === input.stopId
      ? {
          ...item,
          appointmentStart: input.appointmentStart ?? item.appointmentStart,
          appointmentEnd: input.appointmentEnd ?? item.appointmentEnd,
          dockDoor: input.dockDoor ?? item.dockDoor,
          appointmentStatus: nextStatus,
        }
      : item
  );
  const updatedShipment = withWorkspace({ ...current, stops: updatedStops });

  await prisma.silShipmentRecord.update({
    where: { shipmentId: input.shipmentId },
    data: {
      state: updatedShipment.state,
      data: json(updatedShipment),
    },
  });

  const updatedStop = updatedStops.find((item) => item.stopId === input.stopId)!;
  const event = await persistSilWorkflowEvent({
    eventId: makeId("sil_evt_appointment_scheduled"),
    eventType: "APPOINTMENT_SCHEDULED",
    occurredAt: new Date().toISOString(),
    actor: input.actor ?? "operator",
    source: "USER",
    workspaceId: updatedShipment.workspaceId,
    loadId: updatedShipment.loadId,
    shipmentId: updatedShipment.shipmentId,
    nextState: nextStatus,
    shipmentState: updatedShipment.state,
    summary: `${updatedStop.type} appointment ${nextStatus.toLowerCase()} for ${updatedShipment.shipmentId}.`,
    evidence: input.evidence ?? [
      `Stop: ${updatedStop.sequence} ${updatedStop.type}`,
      `Facility: ${updatedStop.location.facilityName ?? `${updatedStop.location.city}, ${updatedStop.location.state}`}`,
      `Window: ${updatedStop.appointmentStart ?? "unset"} to ${updatedStop.appointmentEnd ?? "unset"}`,
      `Dock: ${updatedStop.dockDoor ?? "not assigned"}`,
    ],
  });

  return { shipment: updatedShipment, stop: updatedStop, event };
}

export async function listSilShipmentDocuments(filters?: { workspaceId?: string; shipmentId?: string; loadId?: string }) {
  await seedSilPersistence();
  await ensureSilDocumentTable();
  const rows = await prisma.$queryRaw<Array<{ data: string }>>`
    SELECT "data" FROM "SilDocumentRecord"
    WHERE (${filters?.shipmentId ?? null} IS NULL OR "shipmentId" = ${filters?.shipmentId ?? null})
      AND (${filters?.loadId ?? null} IS NULL OR "loadId" = ${filters?.loadId ?? null})
    ORDER BY "createdAt" DESC
  `;
  return rows
    .map((row) => withWorkspace(fromRecord<SilShipmentDocument>(row)))
    .filter((document) => matchesWorkspace(document, filters?.workspaceId));
}

export async function persistSilShipmentDocument(input: Omit<SilShipmentDocument, "documentId" | "uploadedAt" | "status"> & {
  documentId?: string;
  uploadedAt?: string;
  status?: SilShipmentDocument["status"];
}) {
  await seedSilPersistence();
  await ensureSilDocumentTable();
  const document: SilShipmentDocument = withWorkspace({
    ...input,
    documentId: input.documentId ?? makeId("sil_doc"),
    uploadedAt: input.uploadedAt ?? new Date().toISOString(),
    status: input.status ?? "UPLOADED",
  });

  await prisma.$executeRaw`
    INSERT INTO "SilDocumentRecord" ("id", "documentId", "workspaceId", "shipmentId", "loadId", "documentType", "status", "data", "updatedAt")
    VALUES (${makeId("sil_document_record")}, ${document.documentId}, ${document.workspaceId ?? DEFAULT_WORKSPACE_ID}, ${
      document.shipmentId
    }, ${document.loadId ?? null}, ${document.documentType}, ${document.status}, ${json(document)}, ${new Date()})
    ON CONFLICT("documentId") DO UPDATE SET
      "status" = excluded."status",
      "data" = excluded."data",
      "updatedAt" = excluded."updatedAt"
  `;

  const event = await persistSilWorkflowEvent({
    eventId: makeId("sil_evt_document_uploaded"),
    eventType: "SHIPMENT_DOCUMENT_UPLOADED",
    occurredAt: document.uploadedAt,
    actor: document.uploadedBy,
    source: "USER",
    workspaceId: document.workspaceId,
    loadId: document.loadId,
    shipmentId: document.shipmentId,
    carrierId: document.carrierId,
    summary: `${document.documentType} uploaded for ${document.shipmentId}.`,
    evidence: [
      `Document: ${document.originalName}`,
      `Type: ${document.documentType}`,
      `Size: ${document.sizeBytes} bytes`,
      document.notes ? `Notes: ${document.notes}` : "No notes provided",
    ],
  });

  return { document, event };
}

function buildShipmentExecutionSignal(input: {
  shipment: SilShipment;
  occurredAt: string;
  previousState: ShipmentState;
  evidence: string[];
}): SilGovernanceSignalDraft | null {
  const { shipment, occurredAt, previousState, evidence } = input;
  const reasons: string[] = [];
  const deliveryDue = shipment.stops.find((stop) => stop.type === "DELIVERY")?.appointmentEnd ?? shipment.estimatedDelivery;
  const dueTime = deliveryDue ? new Date(deliveryDue).getTime() : null;
  const eventTime = new Date(occurredAt).getTime();
  const incompleteStops = shipment.stops.filter((stop) => stop.status !== "COMPLETED" && stop.status !== "CANCELED");

  if (shipment.state === "EXCEPTION" || shipment.exception) reasons.push("Shipment exception recorded.");
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

  if (reasons.length === 0) return null;

  const severity =
    shipment.state === "EXCEPTION" || reasons.some((reason) => reason.includes("past delivery")) ? "CRITICAL" : "HIGH";

  return {
    workspaceId: shipment.workspaceId,
    signalType: shipment.state === "EXCEPTION" ? "SHIPMENT_EXECUTION_EXCEPTION" : "CUSTOMER_DELIVERY_COMMITMENT_RISK",
    sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
    severity,
    confidenceScore: severity === "CRITICAL" ? 0.9 : 0.78,
    description: `${shipment.carrierName ?? shipment.carrierId ?? "Carrier"} shipment execution requires governed review.`,
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
      delivery_due_at: deliveryDue ?? null,
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

export async function updateSilShipmentProgress(input: {
  shipmentId: string;
  workspaceId?: string;
  state?: ShipmentState;
  stopId?: string;
  stopStatus?: SilShipment["stops"][number]["status"];
  timestampField?: "arrivedAt" | "loadedUnloadedAt" | "departedAt";
  occurredAt?: string;
  trackingNumber?: string;
  exception?: string | null;
  actor?: string;
  evidence?: string[];
}) {
  await seedSilPersistence();
  const record = await prisma.silShipmentRecord.findUnique({ where: { shipmentId: input.shipmentId } });
  if (!record) return null;

  const current = withWorkspace(fromRecord<SilShipment>(record));
  if (!matchesWorkspace(current, input.workspaceId)) return null;

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const updatedStops = current.stops.map((stop) => {
    if (stop.stopId !== input.stopId) return stop;
    return {
      ...stop,
      status: input.stopStatus ?? stop.status,
      ...(input.timestampField ? { [input.timestampField]: occurredAt } : {}),
    };
  });

  const updatedShipment: SilShipment = {
    ...current,
    state: input.state ?? current.state,
    trackingNumber: input.trackingNumber ?? current.trackingNumber,
    exception: input.exception === null ? undefined : input.exception ?? current.exception,
    actualDelivery: input.state === "DELIVERED" ? occurredAt : current.actualDelivery,
    stops: input.stopId ? updatedStops : current.stops,
  };

  await prisma.silShipmentRecord.update({
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
    actor: input.actor ?? "operator",
    source: "USER",
    workspaceId: updatedShipment.workspaceId,
    loadId: updatedShipment.loadId,
    shipmentId: updatedShipment.shipmentId,
    previousState: current.state,
    nextState: updatedShipment.state,
    shipmentState: updatedShipment.state,
    summary: `Shipment ${updatedShipment.shipmentId} moved from ${current.state} to ${updatedShipment.state}.`,
    evidence: input.evidence ?? [
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

export async function upsertSilLane(input: Partial<SilLaneProfile> & Pick<SilLaneProfile, "originRegion" | "destinationRegion" | "mode" | "equipmentType">) {
  await seedSilPersistence();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const laneId =
    input.laneId ??
    [
      "lane",
      normalizeIdPart(input.originRegion, "origin"),
      normalizeIdPart(input.destinationRegion, "destination"),
      normalizeIdPart(input.mode, "mode"),
      normalizeIdPart(input.equipmentType, "equipment"),
    ].join("-");
  const lane = withWorkspace<SilLaneProfile>(
    {
      laneId,
      originRegion: input.originRegion.toUpperCase(),
      destinationRegion: input.destinationRegion.toUpperCase(),
      mode: input.mode,
      equipmentType: input.equipmentType,
      averageTransitDays: input.averageTransitDays,
      transitVarianceDays: input.transitVarianceDays,
      onTimeRate: input.onTimeRate,
      marketRateLow: input.marketRateLow,
      marketRateMedian: input.marketRateMedian,
      marketRateHigh: input.marketRateHigh,
      lastUpdatedAt: input.lastUpdatedAt ?? new Date().toISOString(),
    },
    workspaceId
  );

  await prisma.silLaneRecord.upsert({
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
  });

  return lane;
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
    invitedCarrierIds: input.invitedCarrierIds ?? [],
    invitedAt: input.invitedCarrierIds?.length ? input.invitedAt ?? new Date().toISOString() : input.invitedAt,
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
    evidence: [
      `Visibility: ${posting.visibility}`,
      `Posted rate: ${posting.postedRate ?? "not set"}`,
      `Invited carriers: ${posting.invitedCarrierIds?.length ?? 0}`,
    ],
  });

  return { posting, event };
}

export async function updateSilPostingVisibility(
  postingId: string,
  input: Pick<Partial<SilLoadPosting>, "visibility" | "invitedCarrierIds" | "status" | "expiresAt"> & {
    actor?: string;
    evidence?: string[];
  }
) {
  await seedSilPersistence();
  const record = await prisma.silLoadPostingRecord.findUnique({ where: { postingId } });
  if (!record) return null;

  const posting = withWorkspace(fromRecord<SilLoadPosting>(record));
  const invitedCarrierIds = input.invitedCarrierIds ?? posting.invitedCarrierIds ?? [];
  const updatedPosting = withWorkspace({
    ...posting,
    visibility: input.visibility ?? posting.visibility,
    status: input.status ?? posting.status,
    expiresAt: input.expiresAt ?? posting.expiresAt,
    invitedCarrierIds,
    invitedAt: input.invitedCarrierIds ? new Date().toISOString() : posting.invitedAt,
  });

  await prisma.silLoadPostingRecord.update({
    where: { postingId },
    data: {
      status: updatedPosting.status,
      board: updatedPosting.board,
      data: json(updatedPosting),
    },
  });

  const event = await persistSilWorkflowEvent({
    eventId: makeId("sil_evt_posting_visibility_updated"),
    eventType: "LOAD_POSTED",
    occurredAt: new Date().toISOString(),
    actor: input.actor ?? "operator",
    source: "USER",
    workspaceId: updatedPosting.workspaceId,
    loadId: updatedPosting.loadId,
    nextState: updatedPosting.status,
    summary: `Posting visibility updated for ${updatedPosting.loadId}.`,
    evidence: input.evidence ?? [
      `Visibility: ${updatedPosting.visibility}`,
      `Invited carriers: ${updatedPosting.invitedCarrierIds?.join(", ") || "none"}`,
    ],
  });

  return { posting: updatedPosting, event };
}

export async function sendSilCarrierInvites(
  postingId: string,
  input: {
    carrierIds?: string[];
    channel?: SilCarrierInviteCommunication["channel"];
    message?: string;
    expiresAt?: string;
    actor?: string;
  }
) {
  await seedSilPersistence();
  const record = await prisma.silLoadPostingRecord.findUnique({ where: { postingId } });
  if (!record) return null;

  const posting = withWorkspace(fromRecord<SilLoadPosting>(record));
  const carrierIds = Array.from(new Set(input.carrierIds?.length ? input.carrierIds : posting.invitedCarrierIds ?? []));
  const sentAt = new Date().toISOString();
  const communications: SilCarrierInviteCommunication[] = carrierIds.map((carrierId) => ({
    communicationId: makeId("sil_invite"),
    postingId: posting.postingId,
    loadId: posting.loadId,
    carrierId,
    channel: input.channel ?? "PORTAL",
    status: "SENT",
    sentAt,
    expiresAt: input.expiresAt ?? posting.expiresAt,
    message: input.message ?? `Load ${posting.loadId} is available for carrier response.`,
    evidence: [
      `Carrier invited: ${carrierId}`,
      `Channel: ${input.channel ?? "PORTAL"}`,
      `Posting visibility: ${posting.visibility}`,
    ],
  }));

  const updatedPosting = withWorkspace({
    ...posting,
    invitedCarrierIds: carrierIds,
    invitedAt: sentAt,
    inviteCommunications: [...(posting.inviteCommunications ?? []), ...communications],
  });

  await prisma.silLoadPostingRecord.update({
    where: { postingId },
    data: {
      status: updatedPosting.status,
      board: updatedPosting.board,
      data: json(updatedPosting),
    },
  });

  const event = await persistSilWorkflowEvent({
    eventId: makeId("sil_evt_carrier_invite_sent"),
    eventType: "CARRIER_INVITE_SENT",
    occurredAt: sentAt,
    actor: input.actor ?? "operator",
    source: "USER",
    workspaceId: updatedPosting.workspaceId,
    loadId: updatedPosting.loadId,
    nextState: updatedPosting.status,
    summary: `${communications.length} carrier invite communication(s) sent for ${updatedPosting.loadId}.`,
    evidence: communications.flatMap((communication) => communication.evidence),
  });

  return { posting: updatedPosting, communications, event };
}

export async function expireSilTenderWindow(
  postingId: string,
  input?: {
    actor?: string;
    reason?: string;
  }
) {
  await seedSilPersistence();
  const record = await prisma.silLoadPostingRecord.findUnique({ where: { postingId } });
  if (!record) return null;

  const posting = withWorkspace(fromRecord<SilLoadPosting>(record));
  const expiredAt = new Date().toISOString();
  const updatedPosting = withWorkspace({
    ...posting,
    status: "EXPIRED" as const,
    expiresAt: posting.expiresAt ?? expiredAt,
    inviteCommunications: (posting.inviteCommunications ?? []).map((communication) =>
      ["SENT", "QUEUED"].includes(communication.status)
        ? { ...communication, status: "EXPIRED" as const, expiresAt: communication.expiresAt ?? expiredAt }
        : communication
    ),
  });

  await prisma.silLoadPostingRecord.update({
    where: { postingId },
    data: {
      status: updatedPosting.status,
      board: updatedPosting.board,
      data: json(updatedPosting),
    },
  });

  const bidRecords = await prisma.silBidRecord.findMany({ where: { postingId } });
  const expiredBids: SilBid[] = [];
  for (const bidRecord of bidRecords) {
    const bid = withWorkspace(fromRecord<SilBid>(bidRecord));
    if (["RECEIVED", "SHORTLISTED"].includes(bid.status)) {
      const updatedBid = withWorkspace({ ...bid, status: "EXPIRED" as const, expiresAt: bid.expiresAt ?? expiredAt });
      await prisma.silBidRecord.update({
        where: { bidId: updatedBid.bidId },
        data: { status: updatedBid.status, data: json(updatedBid) },
      });
      expiredBids.push(updatedBid);
    }
  }

  const event = await persistSilWorkflowEvent({
    eventId: makeId("sil_evt_tender_window_expired"),
    eventType: "TENDER_WINDOW_EXPIRED",
    occurredAt: expiredAt,
    actor: input?.actor ?? "operator",
    source: "USER",
    workspaceId: updatedPosting.workspaceId,
    loadId: updatedPosting.loadId,
    nextState: updatedPosting.status,
    summary: `Tender window expired for ${updatedPosting.loadId}.`,
    evidence: [
      input?.reason ?? "Tender response window expired by operator action.",
      `Expired bids: ${expiredBids.length}`,
      `Invite communications: ${updatedPosting.inviteCommunications?.length ?? 0}`,
    ],
  });

  return { posting: updatedPosting, expiredBids, event };
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
  const posting = (await listSilPostings({ workspaceId })).find((item) => item.postingId === postingId);
  if (posting?.visibility === "INVITED_CARRIERS" && posting.invitedCarrierIds?.length) {
    if (!posting.invitedCarrierIds.includes(input.carrierId)) {
      throw new Error(`Carrier ${input.carrierId} is not invited to posting ${posting.postingId}`);
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
    fuelSurcharge: input.fuelSurcharge,
    accessorialTotal: input.accessorialTotal,
    lumperFee: input.lumperFee,
    detentionEstimate: input.detentionEstimate,
    totalCost:
      input.totalCost ??
      input.bidRate +
        (input.fuelSurcharge ?? 0) +
        (input.accessorialTotal ?? 0) +
        (input.lumperFee ?? 0) +
        (input.detentionEstimate ?? 0),
    estimatedPickupCommitment: input.estimatedPickupCommitment,
    estimatedDeliveryCommitment: input.estimatedDeliveryCommitment,
    expiresAt: input.expiresAt,
    counterOfferRate: input.counterOfferRate,
    counterOfferStatus: input.counterOfferStatus ?? "NONE",
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

export async function updateSilBidCommercials(
  bidId: string,
  input: Pick<
    Partial<SilBid>,
    "counterOfferRate" | "counterOfferStatus" | "expiresAt" | "message" | "status" | "fuelSurcharge" | "accessorialTotal" | "lumperFee" | "detentionEstimate"
  > & {
    actor?: string;
    evidence?: string[];
  }
) {
  await seedSilPersistence();
  const record = await prisma.silBidRecord.findUnique({ where: { bidId } });
  if (!record) return null;
  const bid = withWorkspace(fromRecord<SilBid>(record));
  const updatedBid = withWorkspace({
    ...bid,
    counterOfferRate: input.counterOfferRate ?? bid.counterOfferRate,
    counterOfferStatus: input.counterOfferStatus ?? bid.counterOfferStatus ?? "NONE",
    fuelSurcharge: input.fuelSurcharge ?? bid.fuelSurcharge,
    accessorialTotal: input.accessorialTotal ?? bid.accessorialTotal,
    lumperFee: input.lumperFee ?? bid.lumperFee,
    detentionEstimate: input.detentionEstimate ?? bid.detentionEstimate,
    expiresAt: input.expiresAt ?? bid.expiresAt,
    message: input.message ?? bid.message,
    status: input.status ?? bid.status,
  });
  updatedBid.totalCost =
    updatedBid.bidRate +
    (updatedBid.fuelSurcharge ?? 0) +
    (updatedBid.accessorialTotal ?? 0) +
    (updatedBid.lumperFee ?? 0) +
    (updatedBid.detentionEstimate ?? 0);

  await prisma.silBidRecord.update({
    where: { bidId },
    data: { status: updatedBid.status, data: json(updatedBid) },
  });

  const eventType = input.counterOfferRate !== undefined ? "BID_COUNTERED" : "BID_REVIEWED";
  const event = await persistSilWorkflowEvent({
    eventId: makeId(`sil_evt_${eventType.toLowerCase()}`),
    eventType,
    occurredAt: new Date().toISOString(),
    actor: input.actor ?? "operator",
    source: "USER",
    workspaceId: updatedBid.workspaceId,
    loadId: updatedBid.loadId,
    bidId: updatedBid.bidId,
    carrierId: updatedBid.carrierId,
    previousState: bid.status,
    nextState: updatedBid.status,
    summary:
      eventType === "BID_COUNTERED"
        ? `Counteroffer recorded for ${updatedBid.bidId}.`
        : `Bid commercial controls updated for ${updatedBid.bidId}.`,
    evidence: input.evidence ?? [
      `Bid rate: ${updatedBid.bidRate}`,
      `Total cost: ${updatedBid.totalCost}`,
      `Counteroffer: ${updatedBid.counterOfferRate ?? "none"}`,
      `Accessorials: ${updatedBid.accessorialTotal ?? 0}`,
      `Fuel: ${updatedBid.fuelSurcharge ?? 0}`,
      `Lumper: ${updatedBid.lumperFee ?? 0}`,
      `Detention estimate: ${updatedBid.detentionEstimate ?? 0}`,
      `Expires at: ${updatedBid.expiresAt ?? "not set"}`,
    ],
  });

  return { bid: updatedBid, event };
}

export async function recordSilTenderResponse(
  bidId: string,
  input: Partial<SilTenderResponse> & Pick<SilTenderResponse, "responseType"> & {
    actor?: string;
  }
) {
  await seedSilPersistence();
  const record = await prisma.silBidRecord.findUnique({ where: { bidId } });
  if (!record) return null;

  const bid = withWorkspace(fromRecord<SilBid>(record));
  const respondedAt = input.respondedAt ?? new Date().toISOString();
  const response: SilTenderResponse = {
    responseId: input.responseId ?? makeId("sil_tender_response"),
    bidId,
    carrierId: input.carrierId ?? bid.carrierId,
    responseType: input.responseType,
    status: input.status ?? (input.responseType === "DECLINE_TENDER" ? "REJECTED" : "RECEIVED"),
    rate: input.rate,
    message: input.message,
    respondedAt,
    evidence: input.evidence ?? [
      `Tender response: ${input.responseType}`,
      `Carrier: ${input.carrierId ?? bid.carrierId}`,
      input.rate === undefined ? "Rate unchanged" : `Response rate: ${input.rate}`,
    ],
  };

  const nextStatus: BidState =
    input.responseType === "ACCEPT_TENDER"
      ? "AWARDED"
      : input.responseType === "DECLINE_TENDER"
        ? "WITHDRAWN"
        : input.responseType === "COUNTER_REJECTED"
          ? "REJECTED"
          : input.responseType === "COUNTER_ACCEPTED" || input.responseType === "INFO_PROVIDED"
            ? "SHORTLISTED"
        : input.responseType === "COUNTER"
          ? "RECEIVED"
          : bid.status;

  const updatedBid = withWorkspace({
    ...bid,
    status: nextStatus,
    counterOfferRate:
      input.responseType === "COUNTER" || input.responseType === "COUNTER_ACCEPTED"
        ? input.rate ?? bid.counterOfferRate
        : bid.counterOfferRate,
    counterOfferStatus:
      input.responseType === "COUNTER"
        ? "PENDING"
        : input.responseType === "COUNTER_ACCEPTED"
          ? "ACCEPTED"
          : input.responseType === "COUNTER_REJECTED"
            ? "REJECTED"
            : bid.counterOfferStatus,
    tenderResponses: [...(bid.tenderResponses ?? []), response],
  });

  await prisma.silBidRecord.update({
    where: { bidId },
    data: {
      status: updatedBid.status,
      data: json(updatedBid),
    },
  });

  const event = await persistSilWorkflowEvent({
    eventId: makeId("sil_evt_tender_response_recorded"),
    eventType: "TENDER_RESPONSE_RECORDED",
    occurredAt: respondedAt,
    actor: input.actor ?? "carrier",
    source: input.actor ? "USER" : "CARRIER_PROVIDER",
    workspaceId: updatedBid.workspaceId,
    loadId: updatedBid.loadId,
    bidId: updatedBid.bidId,
    carrierId: updatedBid.carrierId,
    previousState: bid.status,
    nextState: updatedBid.status,
    summary: `${response.responseType.replace(/_/g, " ")} recorded for ${updatedBid.bidId}.`,
    evidence: response.evidence,
  });

  return { bid: updatedBid, response, event };
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

export async function createSilMarketRate(input: Partial<SilMarketRateObservation> & Pick<SilMarketRateObservation, "laneId" | "source" | "medianRate" | "currency">) {
  await seedSilPersistence();
  const observation = withWorkspace<SilMarketRateObservation>({
    observationId: input.observationId ?? makeId("sil_market_rate"),
    workspaceId: input.workspaceId,
    laneId: input.laneId,
    source: input.source,
    lowRate: input.lowRate,
    medianRate: input.medianRate,
    highRate: input.highRate,
    currency: input.currency,
    sampleSize: input.sampleSize,
    observedAt: input.observedAt ?? new Date().toISOString(),
  });

  await prisma.silMarketRateRecord.upsert({
    where: { observationId: observation.observationId },
    update: {
      laneId: observation.laneId,
      source: observation.source,
      observedAt: new Date(observation.observedAt),
      data: json(observation),
    },
    create: {
      observationId: observation.observationId,
      laneId: observation.laneId,
      source: observation.source,
      observedAt: new Date(observation.observedAt),
      data: json(observation),
    },
  });

  return observation;
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
