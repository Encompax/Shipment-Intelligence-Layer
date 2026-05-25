import { Express, Request, Response, Router } from "express";
import * as fileUpload from "express-fileupload";
import fs from "fs";
import path from "path";
import { config } from "../lib/config";
import {
  buildDispatchReadiness,
  buildCarrierEligibilityRecommendations,
  buildGovernanceSignalFromMatch,
  buildLoadRecommendations,
  scoreBidMatch,
} from "../services/shipmentIntelligence/matchingEngine";
import {
  getAllowedLoadTransitions,
  transitionLoadState,
} from "../services/shipmentIntelligence/loadLifecycleService";
import {
  requestCarrierQuotes,
  requestTrackingUpdate,
} from "../services/shipmentIntelligence/carrierProviderAdapter";
import { analyzeMarketRate } from "../services/shipmentIntelligence/marketRateService";
import {
  listWorkflowEvents,
  seedWorkflowEvents,
} from "../services/shipmentIntelligence/workflowEventService";
import {
  BidState,
  BrokerageLoadState,
  SilCarrierProvider,
  SilDocumentType,
  SilGovernanceSignalDraft,
  SilSeverity,
  SilWorkflowEvent,
} from "../services/shipmentIntelligence/types";
import {
  createSilBid,
  createSilLeanRecord,
  createSilLoad,
  createSilPosting,
  expireSilTenderWindow,
  getSilWorkspace,
  listSilAppointmentCalendar,
  listSilShipmentDocuments,
  listSilLeanRecords,
  listPersistedWorkflowEvents,
  listSilBids,
  listSilCarriers,
  listSilGovernanceSignals,
  listSilLanes,
  listSilLeanTemplates,
  listSilLoads,
  listSilMarketRates,
  listSilPostings,
  listSilShipments,
  persistSilGovernanceSignal,
  persistSilShipmentDocument,
  persistSilWorkflowEvent,
  recordSilTenderResponse,
  seedSilPersistence,
  sendSilCarrierInvites,
  updateSilBidCommercials,
  updateSilBidStatus,
  updateSilLoadStatus,
  updateSilPostingVisibility,
  updateSilShipmentProgress,
  updateSilStopAppointment,
  upsertSilCarrier,
  upsertSilWorkspace,
} from "../services/shipmentIntelligence/silPersistenceService";

export function registerShipmentIntelligenceRoutes(app: Express) {
  const router = Router();
  seedWorkflowEvents();
  seedSilPersistence().catch((error) => {
    console.error("SIL persistence seed failed", error);
  });

  const requestWorkspaceId = (req: Request) =>
    (req.query.workspaceId as string | undefined) ?? (req.body?.workspaceId as string | undefined);

  const readinessOverrideError = (body: Record<string, unknown> | undefined) => {
    if (!body?.overrideReadiness) return null;
    const actorRole = String(body.actorRole ?? "").toUpperCase();
    const reason = String(body.overrideReason ?? "").trim();
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

  const findLaneForLoad = async (load: Awaited<ReturnType<typeof listSilLoads>>[number]) => {
    const lanes = await listSilLanes({ workspaceId: load.workspaceId });
    return lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
  };

  const buildGeneratedGovernanceSignals = async (workspaceId?: string) => {
    const [bids, loads, carriers, postings] = await Promise.all([
      listSilBids({ workspaceId }),
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilPostings({ workspaceId }),
    ]);

    const generatedSignals = await Promise.all(
      bids.map(async (bid) => {
        const load = loads.find((item) => item.loadId === bid.loadId);
        if (!load) return null;
        const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
        const posting = postings.find((item) => item.postingId === bid.postingId);
        const lane = await findLaneForLoad(load);
        const score = scoreBidMatch({ load, bid, carrier, lane, posting });
        if (!score.governanceSignalRequired) return null;

        const signal = buildGovernanceSignalFromMatch({ load, bid, carrier, lane, posting }, score);
        await persistSilGovernanceSignal(signal);
        return signal;
      })
    );

    return generatedSignals.filter((signal): signal is SilGovernanceSignalDraft => Boolean(signal));
  };

  router.get("/overview", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, postings, bids] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilBids({ workspaceId }),
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

  router.get("/workspace", async (req: Request, res: Response) => {
    const workspace = await getSilWorkspace(req.query.workspace as string | undefined);
    res.json({ workspace });
  });

  router.put("/workspace", async (req: Request, res: Response) => {
    const required = ["organization", "workspaceName", "selectedProductIds", "modules"];
    const missing = required.filter((field) => req.body?.[field] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required workspace fields: ${missing.join(", ")}` });
    }

    const result = await upsertSilWorkspace(req.body);
    res.json(result);
  });

  router.get("/loads", async (req: Request, res: Response) => {
    const loads = await listSilLoads({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: loads.length, loads });
  });

  router.post("/loads", async (req: Request, res: Response) => {
    const required = ["customerId", "origin", "destination", "mode", "equipmentType"];
    const missing = required.filter((field) => req.body?.[field] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required load fields: ${missing.join(", ")}` });
    }

    const result = await createSilLoad({ ...req.body, workspaceId: requestWorkspaceId(req) });
    res.status(201).json(result);
  });

  router.get("/loads/:loadId", async (req: Request, res: Response) => {
    const [loads, postings, bids, carriers, lanes] = await Promise.all([
      listSilLoads({ workspaceId: requestWorkspaceId(req) }),
      listSilPostings({ workspaceId: requestWorkspaceId(req) }),
      listSilBids({ workspaceId: requestWorkspaceId(req) }),
      listSilCarriers({ workspaceId: requestWorkspaceId(req) }),
      listSilLanes({ workspaceId: requestWorkspaceId(req) }),
    ]);
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const posting = postings.find((item) => item.loadId === load.loadId);
    const recommendations = buildLoadRecommendations({
      load,
      posting,
      bids,
      carriers,
      lanes,
    });

    res.json({
      load,
      posting: posting ?? null,
      bids: recommendations,
      allowedTransitions: getAllowedLoadTransitions(load.status),
      lane: lanes.find(
        (item) =>
          item.originRegion === load.origin.state &&
          item.destinationRegion === load.destination.state &&
          item.mode === load.mode &&
          item.equipmentType === load.equipmentType
      ) ?? null,
    });
  });

  router.get("/loads/:loadId/transitions", async (req: Request, res: Response) => {
    const loads = await listSilLoads({ workspaceId: requestWorkspaceId(req) });
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    res.json({
      loadId: load.loadId,
      currentState: load.status,
      allowedTransitions: getAllowedLoadTransitions(load.status),
    });
  });

  router.post("/loads/:loadId/transition", async (req: Request, res: Response) => {
    const loads = await listSilLoads({ workspaceId: requestWorkspaceId(req) });
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const nextState = req.body?.nextState as BrokerageLoadState | undefined;
    if (!nextState) return res.status(400).json({ error: "nextState is required" });

    const result = transitionLoadState({
      load,
      nextState,
      actor: req.body?.actor ?? "operator",
      evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : undefined,
    });

    if (result.accepted) {
      load.status = result.nextState;
      await updateSilLoadStatus(load.loadId, result.nextState);
    }
    await persistSilWorkflowEvent({ ...result.event, workspaceId: load.workspaceId });

    res.status(result.accepted ? 200 : 409).json(result);
  });

  router.get("/shipments", async (req: Request, res: Response) => {
    const shipments = await listSilShipments({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: shipments.length, shipments });
  });

  router.get("/appointments/calendar", async (req: Request, res: Response) => {
    const appointments = await listSilAppointmentCalendar({
      workspaceId: requestWorkspaceId(req),
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json({ count: appointments.length, appointments });
  });

  router.patch("/shipments/:shipmentId/stops/:stopId/appointment", async (req: Request, res: Response) => {
    const result = await updateSilStopAppointment({
      shipmentId: req.params.shipmentId,
      stopId: req.params.stopId,
      workspaceId: requestWorkspaceId(req),
      appointmentStart: req.body?.appointmentStart,
      appointmentEnd: req.body?.appointmentEnd,
      dockDoor: req.body?.dockDoor,
      appointmentStatus: req.body?.appointmentStatus,
      actor: req.body?.actor,
      evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : undefined,
    });
    if (!result) return res.status(404).json({ error: "Shipment stop not found" });
    res.json(result);
  });

  router.get("/shipments/:shipmentId/documents", async (req: Request, res: Response) => {
    const documents = await listSilShipmentDocuments({
      workspaceId: requestWorkspaceId(req),
      shipmentId: req.params.shipmentId,
    });
    const podPacket = documents.filter((document) =>
      ["POD", "BOL", "LUMPER_RECEIPT", "DETENTION_EVIDENCE"].includes(document.documentType)
    );
    res.json({
      count: documents.length,
      podPacketCount: podPacket.length,
      podReady: documents.some((document) => document.documentType === "POD" && document.status !== "REJECTED"),
      documents,
    });
  });

  router.post("/shipments/:shipmentId/documents", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const shipments = await listSilShipments({ workspaceId });
    const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });
    if (!req.files || !("file" in req.files)) return res.status(400).json({ error: "file is required" });

    const file = req.files.file as fileUpload.UploadedFile;
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    const documentType = String(req.body?.documentType ?? "POD").toUpperCase() as SilDocumentType;
    const uploadDir = path.join(process.cwd(), config.uploadDir, "shipment-documents", shipment.shipmentId);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const storedPath = path.join(uploadDir, `${Date.now()}_${safeName}`);
    await file.mv(storedPath);

    const result = await persistSilShipmentDocument({
      workspaceId: shipment.workspaceId,
      shipmentId: shipment.shipmentId,
      loadId: shipment.loadId,
      carrierId: shipment.carrierId,
      documentType,
      originalName: file.name,
      storedPath,
      contentType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: req.body?.uploadedBy ?? "operator",
      notes: req.body?.notes,
    });

    res.status(201).json(result);
  });

  router.patch("/shipments/:shipmentId/progress", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    let dispatchReadiness = null as ReturnType<typeof buildDispatchReadiness> | null;
    let dispatchOverrideGovernanceSignal = null as SilGovernanceSignalDraft | null;
    if (req.body?.state === "DISPATCHED") {
      const [shipments, loads, postings, bids, carriers, lanes] = await Promise.all([
        listSilShipments({ workspaceId }),
        listSilLoads({ workspaceId }),
        listSilPostings({ workspaceId }),
        listSilBids({ workspaceId }),
        listSilCarriers({ workspaceId }),
        listSilLanes({ workspaceId }),
      ]);
      const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
      if (!shipment) return res.status(404).json({ error: "Shipment not found" });
      const load = shipment.loadId ? loads.find((item) => item.loadId === shipment.loadId) : undefined;
      if (load) {
        const posting = postings.find((item) => item.loadId === load.loadId);
        const candidateBids = buildLoadRecommendations({ load, posting, bids, carriers, lanes }).filter((bid) =>
          ["AWARDED", "SHORTLISTED", "RECEIVED"].includes(bid.status)
        );
        const bid = candidateBids.find((item) => item.status === "AWARDED") ?? candidateBids[0];
        const carrier = bid ? carriers.find((item) => item.carrierId === bid.carrierId) : undefined;
        const lane = lanes.find(
          (item) =>
            item.originRegion === load.origin.state &&
            item.destinationRegion === load.destination.state &&
            item.mode === load.mode &&
            item.equipmentType === load.equipmentType
        );
        dispatchReadiness = buildDispatchReadiness({ load, bid, carrier, lane, posting, shipment });
        if (dispatchReadiness.status === "HOLD" && !req.body?.overrideReadiness) {
          return res.status(409).json({
            error: "Dispatch readiness is HOLD. Route readiness review before dispatch.",
            readiness: dispatchReadiness,
          });
        }
        if (dispatchReadiness.status === "HOLD" && req.body?.overrideReadiness) {
          const overrideError = readinessOverrideError(req.body);
          if (overrideError) return res.status(403).json({ error: overrideError, readiness: dispatchReadiness });
        }
        if (dispatchReadiness.governanceSignal) {
          await persistSilGovernanceSignal(dispatchReadiness.governanceSignal, "READY_FOR_ENCOMPAX");
          dispatchOverrideGovernanceSignal = dispatchReadiness.governanceSignal;
        }
      }
    }

    const result = await updateSilShipmentProgress({
      ...req.body,
      shipmentId: req.params.shipmentId,
      workspaceId,
    });
    if (!result) return res.status(404).json({ error: "Shipment not found" });

    let overrideEvent: SilWorkflowEvent | null = null;
    if (req.body?.state === "DISPATCHED" && req.body?.overrideReadiness && dispatchReadiness) {
      overrideEvent = await persistSilWorkflowEvent({
        eventId: `sil_evt_dispatch_override_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        eventType: "DISPATCH_READINESS_CHECKED",
        occurredAt: new Date().toISOString(),
        actor: req.body?.actor ?? "operator",
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
          ...(Array.isArray(req.body?.evidence) ? req.body.evidence : []),
        ],
        governanceSignal: dispatchOverrideGovernanceSignal ?? undefined,
      });
    }

    res.json({ ...result, readiness: dispatchReadiness, overrideEvent });
  });

  router.get("/carriers", async (req: Request, res: Response) => {
    const carriers = await listSilCarriers({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: carriers.length, carriers });
  });

  router.post("/carriers", async (req: Request, res: Response) => {
    if (!req.body?.carrierName) return res.status(400).json({ error: "carrierName is required" });
    const result = await upsertSilCarrier({ ...req.body, workspaceId: requestWorkspaceId(req) });
    res.status(201).json(result);
  });

  router.patch("/carriers/:carrierId", async (req: Request, res: Response) => {
    const carrier = (await listSilCarriers({ workspaceId: requestWorkspaceId(req) })).find(
      (item) => item.carrierId === req.params.carrierId
    );
    if (!carrier) return res.status(404).json({ error: "Carrier not found" });

    const result = await upsertSilCarrier({
      ...carrier,
      ...req.body,
      carrierId: carrier.carrierId,
      carrierName: req.body?.carrierName ?? carrier.carrierName,
      workspaceId: carrier.workspaceId,
    });
    res.json(result);
  });

  router.get("/lanes", async (req: Request, res: Response) => {
    const lanes = await listSilLanes({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: lanes.length, lanes });
  });

  router.get("/load-board/postings", async (req: Request, res: Response) => {
    const postings = await listSilPostings({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: postings.length, postings });
  });

  router.post("/load-board/postings", async (req: Request, res: Response) => {
    if (!req.body?.loadId) return res.status(400).json({ error: "loadId is required" });
    const load = (await listSilLoads({ workspaceId: requestWorkspaceId(req) })).find((item) => item.loadId === req.body.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const result = await createSilPosting({ ...req.body, workspaceId: requestWorkspaceId(req) });
    res.status(201).json(result);
  });

  router.patch("/load-board/postings/:postingId/visibility", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const posting = (await listSilPostings({ workspaceId })).find((item) => item.postingId === req.params.postingId);
    if (!posting) return res.status(404).json({ error: "Posting not found" });

    const result = await updateSilPostingVisibility(req.params.postingId, {
      visibility: req.body?.visibility,
      invitedCarrierIds: req.body?.invitedCarrierIds,
      status: req.body?.status,
      expiresAt: req.body?.expiresAt,
      actor: req.body?.actor,
      evidence: req.body?.evidence,
    });
    if (!result) return res.status(404).json({ error: "Posting not found" });
    res.json(result);
  });

  router.post("/load-board/postings/:postingId/invites", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const posting = (await listSilPostings({ workspaceId })).find((item) => item.postingId === req.params.postingId);
    if (!posting) return res.status(404).json({ error: "Posting not found" });

    const result = await sendSilCarrierInvites(req.params.postingId, {
      carrierIds: Array.isArray(req.body?.carrierIds) ? req.body.carrierIds : undefined,
      channel: req.body?.channel,
      message: req.body?.message,
      expiresAt: req.body?.expiresAt,
      actor: req.body?.actor,
    });
    if (!result) return res.status(404).json({ error: "Posting not found" });
    res.json(result);
  });

  router.post("/load-board/postings/:postingId/expire", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const posting = (await listSilPostings({ workspaceId })).find((item) => item.postingId === req.params.postingId);
    if (!posting) return res.status(404).json({ error: "Posting not found" });

    const result = await expireSilTenderWindow(req.params.postingId, {
      actor: req.body?.actor,
      reason: req.body?.reason,
    });
    if (!result) return res.status(404).json({ error: "Posting not found" });
    res.json(result);
  });

  router.get("/load-board/bids", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [bids, loads, carriers, postings, lanes, shipments] = await Promise.all([
      listSilBids({ workspaceId }),
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilLanes({ workspaceId }),
      listSilShipments({ workspaceId }),
    ]);
    const scoredBids = bids.map((bid) => {
      const load = loads.find((item) => item.loadId === bid.loadId);
      const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
      const posting = postings.find((item) => item.postingId === bid.postingId);
      const lane = load
        ? lanes.find(
            (item) =>
              item.originRegion === load.origin.state &&
              item.destinationRegion === load.destination.state &&
              item.mode === load.mode &&
              item.equipmentType === load.equipmentType
          )
        : undefined;

      if (!load) return bid;
      return { ...bid, score: scoreBidMatch({ load, bid, carrier, lane, posting }) };
    });

    res.json({ count: scoredBids.length, bids: scoredBids });
  });

  router.post("/load-board/bids", async (req: Request, res: Response) => {
    const required = ["loadId", "carrierId", "bidRate"];
    const missing = required.filter((field) => req.body?.[field] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required bid fields: ${missing.join(", ")}` });
    }

    const workspaceId = requestWorkspaceId(req);
    const [loads, postings, carriers] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilCarriers({ workspaceId }),
    ]);
    if (!loads.some((load) => load.loadId === req.body.loadId)) return res.status(404).json({ error: "Load not found" });
    if (req.body.postingId && !postings.some((posting) => posting.postingId === req.body.postingId)) {
      return res.status(404).json({ error: "Posting not found" });
    }
    if (!carriers.some((carrier) => carrier.carrierId === req.body.carrierId)) {
      return res.status(404).json({ error: "Carrier not found" });
    }

    try {
      const result = await createSilBid({ ...req.body, workspaceId });
      res.status(201).json(result);
    } catch (error) {
      res.status(409).json({ error: error instanceof Error ? error.message : "Bid rejected by posting controls" });
    }
  });

  router.get("/load-board/bids/:bidId/review", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [bids, loads, carriers, postings, lanes, shipments] = await Promise.all([
      listSilBids({ workspaceId }),
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilLanes({ workspaceId }),
      listSilShipments({ workspaceId }),
    ]);
    const bid = bids.find((item) => item.bidId === req.params.bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    const load = loads.find((item) => item.loadId === bid.loadId);
    if (!load) return res.status(404).json({ error: "Load not found for bid" });

    const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
    const posting = postings.find((item) => item.postingId === bid.postingId);
    const lane = lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
    const score = scoreBidMatch({ load, bid, carrier, lane, posting });
    const governanceSignal = score.governanceSignalRequired
      ? buildGovernanceSignalFromMatch({ load, bid, carrier, lane, posting }, score)
      : null;
    if (governanceSignal) await persistSilGovernanceSignal(governanceSignal);

    res.json({
      load,
      bid: { ...bid, score },
      carrier: carrier ?? null,
      lane: lane ?? null,
      posting: posting ?? null,
      governanceSignal,
    });
  });

  router.patch("/load-board/bids/:bidId/commercials", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const bid = (await listSilBids({ workspaceId })).find((item) => item.bidId === req.params.bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    const result = await updateSilBidCommercials(req.params.bidId, {
      counterOfferRate:
        req.body?.counterOfferRate === undefined ? undefined : Number(req.body.counterOfferRate),
      counterOfferStatus: req.body?.counterOfferStatus,
      fuelSurcharge: req.body?.fuelSurcharge === undefined ? undefined : Number(req.body.fuelSurcharge),
      accessorialTotal: req.body?.accessorialTotal === undefined ? undefined : Number(req.body.accessorialTotal),
      lumperFee: req.body?.lumperFee === undefined ? undefined : Number(req.body.lumperFee),
      detentionEstimate: req.body?.detentionEstimate === undefined ? undefined : Number(req.body.detentionEstimate),
      expiresAt: req.body?.expiresAt,
      message: req.body?.message,
      status: req.body?.status,
      actor: req.body?.actor,
      evidence: req.body?.evidence,
    });
    if (!result) return res.status(404).json({ error: "Bid not found" });
    res.json(result);
  });

  router.post("/load-board/bids/:bidId/tender-response", async (req: Request, res: Response) => {
    const responseType = req.body?.responseType;
    if (!["QUOTE", "ACCEPT_TENDER", "DECLINE_TENDER", "COUNTER", "REQUEST_MORE_INFO"].includes(responseType)) {
      return res.status(400).json({ error: "responseType must be QUOTE, ACCEPT_TENDER, DECLINE_TENDER, COUNTER, or REQUEST_MORE_INFO" });
    }

    const workspaceId = requestWorkspaceId(req);
    const bid = (await listSilBids({ workspaceId })).find((item) => item.bidId === req.params.bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    const result = await recordSilTenderResponse(req.params.bidId, {
      responseType,
      status: req.body?.status,
      rate: req.body?.rate === undefined ? undefined : Number(req.body.rate),
      message: req.body?.message,
      evidence: Array.isArray(req.body?.evidence) ? req.body.evidence : undefined,
      actor: req.body?.actor,
    });
    if (!result) return res.status(404).json({ error: "Bid not found" });
    res.json(result);
  });

  router.post("/load-board/bids/:bidId/decision", async (req: Request, res: Response) => {
    const decision = req.body?.decision as BidState | undefined;
    if (!decision || !["SHORTLISTED", "REJECTED", "AWARDED", "WITHDRAWN"].includes(decision)) {
      return res.status(400).json({ error: "decision must be SHORTLISTED, REJECTED, AWARDED, or WITHDRAWN" });
    }

    const workspaceId = requestWorkspaceId(req);
    const [bids, loads, carriers, postings, lanes, shipments] = await Promise.all([
      listSilBids({ workspaceId }),
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilLanes({ workspaceId }),
      listSilShipments({ workspaceId }),
    ]);
    const bid = bids.find((item) => item.bidId === req.params.bidId);
    if (!bid) return res.status(404).json({ error: "Bid not found" });

    const load = loads.find((item) => item.loadId === bid.loadId);
    if (!load) return res.status(404).json({ error: "Load not found for bid" });

    const carrier = carriers.find((item) => item.carrierId === bid.carrierId);
    const posting = postings.find((item) => item.postingId === bid.postingId);
    const lane = lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
    const score = scoreBidMatch({ load, bid, carrier, lane, posting });
    const shipment = shipments.find((item) => item.loadId === load.loadId);
    const readiness =
      decision === "AWARDED" ? buildDispatchReadiness({ load, bid, carrier, lane, posting, shipment }) : null;
    if (readiness?.status === "HOLD" && !req.body?.overrideReadiness) {
      return res.status(409).json({
        error: "Dispatch readiness is HOLD. Route readiness review before award.",
        readiness,
      });
    }
    if (readiness?.status === "HOLD" && req.body?.overrideReadiness) {
      const overrideError = readinessOverrideError(req.body);
      if (overrideError) return res.status(403).json({ error: overrideError, readiness });
    }
    const updatedBid = await updateSilBidStatus(bid.bidId, decision);
    const governanceSignal =
      decision === "AWARDED" && (readiness?.governanceSignal || score.governanceSignalRequired)
        ? readiness?.governanceSignal ?? buildGovernanceSignalFromMatch({ load, bid, carrier, lane, posting }, score)
        : null;
    if (governanceSignal) await persistSilGovernanceSignal(governanceSignal, "READY_FOR_ENCOMPAX");

    const event = await persistSilWorkflowEvent({
      eventId: `sil_evt_bid_decision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType: decision === "AWARDED" ? "CARRIER_AWARDED" : "BID_REVIEWED",
      occurredAt: new Date().toISOString(),
      actor: req.body?.actor ?? "operator",
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
        ...(Array.isArray(req.body?.evidence) ? req.body.evidence : score.evidence),
      ],
      governanceSignal: governanceSignal ?? undefined,
    });

    if (decision === "AWARDED") {
      await updateSilLoadStatus(load.loadId, "CARRIER_SELECTED");
    }

    const overrideEvent =
      decision === "AWARDED" && req.body?.overrideReadiness && readiness
        ? await persistSilWorkflowEvent({
            eventId: `sil_evt_award_override_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            eventType: "DISPATCH_READINESS_CHECKED",
            occurredAt: new Date().toISOString(),
            actor: req.body?.actor ?? "operator",
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
              ...(Array.isArray(req.body?.evidence) ? req.body.evidence : []),
            ],
            governanceSignal: governanceSignal ?? undefined,
          })
        : null;

    res.json({ bid: updatedBid, score, readiness, governanceSignal, event, overrideEvent });
  });

  router.get("/matching/recommendations", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, postings, bids, carriers, lanes] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilBids({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilLanes({ workspaceId }),
    ]);
    const recommendations = loads.map((load) => {
      const posting = postings.find((item) => item.loadId === load.loadId);
      return {
        load,
        posting: posting ?? null,
        bids: buildLoadRecommendations({ load, posting, bids, carriers, lanes }),
      };
    });

    res.json({ count: recommendations.length, recommendations });
  });

  router.get("/matching/carrier-eligibility/:loadId", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, carriers, lanes] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilLanes({ workspaceId }),
    ]);
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const recommendations = buildCarrierEligibilityRecommendations({ load, carriers, lanes });
    res.json({ count: recommendations.length, recommendations });
  });

  router.post("/matching/carrier-eligibility/:loadId/invite-packet", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, carriers, lanes, postings] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilLanes({ workspaceId }),
      listSilPostings({ workspaceId }),
    ]);
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const recommendations = buildCarrierEligibilityRecommendations({ load, carriers, lanes });
    const selectedRecommendations = recommendations.filter((carrier) =>
      ["INVITE", "INVITE_WITH_REVIEW"].includes(carrier.inviteRecommendation)
    );
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
    const primaryPosting = postings.find((posting) => posting.loadId === load.loadId) ?? null;
    const severity: SilSeverity = governanceReasons.length > 1 ? "HIGH" : governanceReasons.length === 1 ? "MEDIUM" : "LOW";
    const packet = {
      loadId: load.loadId,
      postingId: primaryPosting?.postingId ?? null,
      invitedCarrierIds,
      selectedRecommendations,
      excludedCarrierIds: recommendations
        .filter((carrier) => !invitedCarrierIds.includes(carrier.carrierId))
        .map((carrier) => carrier.carrierId),
      governanceReviewRequired: governanceReasons.length > 0,
      governanceReasons,
      createdAt: new Date().toISOString(),
    };
    const governanceSignal: SilGovernanceSignalDraft | null =
      governanceReasons.length > 0
        ? {
            workspaceId,
            signalType: "CARRIER_INVITE_REVIEW" as const,
            sourceModule: "SHIPMENT_INTELLIGENCE_LAYER" as const,
            severity,
            confidenceScore: severity === "HIGH" ? 0.86 : 0.74,
            description: `Carrier invite packet for ${load.customerName ?? load.customerId} requires governed review.`,
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
                targetModule: "PLATFORM_OVERVIEW" as const,
                priority: severity === "HIGH" ? "HIGH" : "MEDIUM",
                description: "Review carrier invite list before posting outreach is committed.",
              },
            ],
            rawPayloadRef: `sil:invite-packet:${load.loadId}`,
          }
        : null;
    if (governanceSignal) await persistSilGovernanceSignal(governanceSignal, "READY_FOR_ENCOMPAX");

    const event = await persistSilWorkflowEvent({
      eventId: `sil_evt_invite_packet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType: governanceSignal ? "GOVERNANCE_SIGNAL_CREATED" : "LOAD_POSTED",
      occurredAt: packet.createdAt,
      actor: req.body?.actor ?? "operator",
      source: "USER",
      workspaceId,
      loadId: load.loadId,
      summary: `Carrier invite packet created for ${load.loadId}.`,
      evidence: [
        `Invited carriers: ${invitedCarrierIds.join(", ") || "none"}`,
        `Governance review required: ${packet.governanceReviewRequired}`,
        ...governanceReasons,
      ],
      governanceSignal: governanceSignal ?? undefined,
    });

    res.status(201).json({ packet, governanceSignal, event });
  });

  router.get("/dispatch/readiness/:loadId", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, postings, bids, carriers, lanes, shipments] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilBids({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilLanes({ workspaceId }),
      listSilShipments({ workspaceId }),
    ]);
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const posting = postings.find((item) => item.loadId === load.loadId);
    const candidateBids = buildLoadRecommendations({ load, posting, bids, carriers, lanes }).filter((bid) =>
      ["RECEIVED", "SHORTLISTED", "AWARDED"].includes(bid.status)
    );
    const bid =
      (req.query.bidId ? candidateBids.find((item) => item.bidId === req.query.bidId) : undefined) ??
      candidateBids[0] ??
      bids.find((item) => item.loadId === load.loadId);
    const carrier = bid ? carriers.find((item) => item.carrierId === bid.carrierId) : undefined;
    const lane = lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
    const shipment = shipments.find((item) => item.loadId === load.loadId);
    const readiness = buildDispatchReadiness({ load, bid, carrier, lane, posting, shipment });

    res.json({ readiness });
  });

  router.post("/dispatch/readiness/:loadId/review", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, postings, bids, carriers, lanes, shipments] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilPostings({ workspaceId }),
      listSilBids({ workspaceId }),
      listSilCarriers({ workspaceId }),
      listSilLanes({ workspaceId }),
      listSilShipments({ workspaceId }),
    ]);
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const posting = postings.find((item) => item.loadId === load.loadId);
    const candidateBids = buildLoadRecommendations({ load, posting, bids, carriers, lanes }).filter((bid) =>
      ["RECEIVED", "SHORTLISTED", "AWARDED"].includes(bid.status)
    );
    const bid =
      (req.body?.bidId ? candidateBids.find((item) => item.bidId === req.body.bidId) : undefined) ??
      candidateBids[0] ??
      bids.find((item) => item.loadId === load.loadId);
    const carrier = bid ? carriers.find((item) => item.carrierId === bid.carrierId) : undefined;
    const lane = lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
    const shipment = shipments.find((item) => item.loadId === load.loadId);
    const readiness = buildDispatchReadiness({ load, bid, carrier, lane, posting, shipment });
    const governanceSignal = readiness.governanceSignal ?? null;
    if (governanceSignal) await persistSilGovernanceSignal(governanceSignal, "READY_FOR_ENCOMPAX");

    const event = await persistSilWorkflowEvent({
      eventId: `sil_evt_dispatch_readiness_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType: "DISPATCH_READINESS_CHECKED",
      occurredAt: new Date().toISOString(),
      actor: req.body?.actor ?? "operator",
      source: "USER",
      workspaceId: load.workspaceId,
      loadId: load.loadId,
      shipmentId: shipment?.shipmentId,
      bidId: bid?.bidId,
      carrierId: bid?.carrierId,
      summary: `Dispatch readiness for ${load.loadId} returned ${readiness.status}.`,
      evidence: [
        `Readiness score: ${readiness.score}`,
        ...readiness.blockingReasons.map((reason) => `Blocking: ${reason}`),
        ...readiness.reviewReasons.map((reason) => `Review: ${reason}`),
        ...(Array.isArray(req.body?.evidence) ? req.body.evidence : readiness.evidence),
      ],
      governanceSignal: governanceSignal ?? undefined,
    });

    res.status(governanceSignal ? 201 : 200).json({ readiness, governanceSignal, event });
  });

  router.get("/carrier-quotes/:loadId", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, carriers] = await Promise.all([listSilLoads({ workspaceId }), listSilCarriers({ workspaceId })]);
    const load = loads.find((item) => item.loadId === req.params.loadId);
    if (!load) return res.status(404).json({ error: "Load not found" });

    const provider = (req.query.provider as SilCarrierProvider | undefined) ?? "MOCK";
    const quotes = requestCarrierQuotes({ provider, load, carriers });
    res.json({ count: quotes.length, quotes });
  });

  router.get("/tracking/:shipmentId", async (req: Request, res: Response) => {
    const shipments = await listSilShipments({ workspaceId: requestWorkspaceId(req) });
    const shipment = shipments.find((item) => item.shipmentId === req.params.shipmentId);
    if (!shipment) return res.status(404).json({ error: "Shipment not found" });

    const provider = req.query.provider as SilCarrierProvider | undefined;
    const trackingUpdate = requestTrackingUpdate({ provider, shipment });
    res.json({ trackingUpdate });
  });

  router.get("/market-rates", async (req: Request, res: Response) => {
    const marketRates = await listSilMarketRates({ workspaceId: requestWorkspaceId(req) });
    res.json({ count: marketRates.length, marketRates });
  });

  router.get("/market-rates/analyze", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    const [loads, bids, lanes, marketRates] = await Promise.all([
      listSilLoads({ workspaceId }),
      listSilBids({ workspaceId }),
      listSilLanes({ workspaceId }),
      listSilMarketRates({ workspaceId }),
    ]);
    const load = loads.find((item) => item.loadId === req.query.loadId);
    if (!load) return res.status(404).json({ error: "Valid loadId query parameter is required" });

    const bid = req.query.bidId ? bids.find((item) => item.bidId === req.query.bidId) : undefined;
    const lane = lanes.find(
      (item) =>
        item.originRegion === load.origin.state &&
        item.destinationRegion === load.destination.state &&
        item.mode === load.mode &&
        item.equipmentType === load.equipmentType
    );
    const analysis = analyzeMarketRate({ load, bid, lane, observations: marketRates });
    if (analysis.governanceSignal) await persistSilGovernanceSignal(analysis.governanceSignal);

    res.json({ analysis });
  });

  router.get("/governance-signals", async (req: Request, res: Response) => {
    const workspaceId = requestWorkspaceId(req);
    await buildGeneratedGovernanceSignals(workspaceId);
    const persistedSignals = await listSilGovernanceSignals({ workspaceId });
    const governanceSignals = persistedSignals;
    res.json({ count: governanceSignals.length, governanceSignals });
  });

  router.get("/workflow-events", async (req: Request, res: Response) => {
    const memoryEvents = listWorkflowEvents({
      loadId: req.query.loadId as string | undefined,
      shipmentId: req.query.shipmentId as string | undefined,
      bidId: req.query.bidId as string | undefined,
      workspaceId: requestWorkspaceId(req),
    });
    await Promise.all(memoryEvents.map((event) => persistSilWorkflowEvent(event)));
    const events = await listPersistedWorkflowEvents({
      loadId: req.query.loadId as string | undefined,
      shipmentId: req.query.shipmentId as string | undefined,
      bidId: req.query.bidId as string | undefined,
      workspaceId: requestWorkspaceId(req),
    });
    res.json({ count: events.length, events });
  });

  router.get("/lean/templates", async (_req: Request, res: Response) => {
    const templates = await listSilLeanTemplates();
    res.json({ count: templates.length, templates });
  });

  router.get("/lean/records", async (req: Request, res: Response) => {
    const records = await listSilLeanRecords({
      organization: req.query.organization as string | undefined,
      templateId: req.query.templateId as string | undefined,
      status: req.query.status as string | undefined,
      workspaceId: requestWorkspaceId(req),
    });
    res.json({ count: records.length, records });
  });

  router.post("/lean/records", async (req: Request, res: Response) => {
    const required = ["templateId", "organization", "program"];
    const missing = required.filter((field) => req.body?.[field] === undefined);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required LEAN record fields: ${missing.join(", ")}` });
    }

    const result = await createSilLeanRecord({ ...req.body, workspaceId: requestWorkspaceId(req) });
    res.status(201).json(result);
  });

  app.use("/api/shipment-intelligence", router);
}
