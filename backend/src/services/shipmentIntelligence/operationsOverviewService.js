"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSilOperationsOverview = buildSilOperationsOverview;
const silPersistenceService_1 = require("./silPersistenceService");
const currency = (value) => (typeof value === "number" ? `$${value.toLocaleString("en-US")}` : "n/a");
const pct = (value) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a");
const severityForCount = (critical, warning) => {
    if (critical > 0)
        return "CRITICAL";
    if (warning > 0)
        return "HIGH";
    return "MEDIUM";
};
const signal = (input) => input;
async function buildSilOperationsOverview(workspaceId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const [loads, shipments, appointments, documents, carriers, lanes, postings, bids, marketRates, signalEnvelopes,] = await Promise.all([
        (0, silPersistenceService_1.listSilLoads)({ workspaceId }),
        (0, silPersistenceService_1.listSilShipments)({ workspaceId }),
        (0, silPersistenceService_1.listSilAppointmentCalendar)({ workspaceId }),
        (0, silPersistenceService_1.listSilShipmentDocuments)({ workspaceId }),
        (0, silPersistenceService_1.listSilCarriers)({ workspaceId }),
        (0, silPersistenceService_1.listSilLanes)({ workspaceId }),
        (0, silPersistenceService_1.listSilPostings)({ workspaceId }),
        (0, silPersistenceService_1.listSilBids)({ workspaceId }),
        (0, silPersistenceService_1.listSilMarketRates)({ workspaceId }),
        (0, silPersistenceService_1.listSilGovernanceSignalEnvelopes)({ workspaceId }),
    ]);
    const activeLoads = loads.filter((load) => !["CLOSED", "CANCELED"].includes(load.status));
    const openPostings = postings.filter((posting) => posting.status === "POSTED");
    const openBids = bids.filter((bid) => ["RECEIVED", "SHORTLISTED"].includes(bid.status));
    const carriersInReview = carriers.filter((carrier) => carrier.blocked || carrier.creditStatus === "REVIEW" || carrier.safetyStatus === "REVIEW");
    const blockedCarriers = carriers.filter((carrier) => carrier.blocked || carrier.creditStatus === "BLOCKED" || carrier.safetyStatus === "BLOCKED");
    const shipmentExceptions = shipments.filter((shipment) => shipment.state === "EXCEPTION" || shipment.exception);
    const missingDocuments = shipments.filter((shipment) => {
        if (!["DELIVERED", "INVOICED", "CLOSED"].includes(shipment.state))
            return false;
        return !documents.some((document) => document.shipmentId === shipment.shipmentId && document.documentType === "POD");
    });
    const pendingAppointments = appointments.filter((appointment) => { var _a; return ["REQUESTED", "RESCHEDULED", "MISSED"].includes((_a = appointment.appointmentStatus) !== null && _a !== void 0 ? _a : ""); });
    const volatileLanes = lanes.filter((lane) => { var _a, _b; return ((_a = lane.transitVarianceDays) !== null && _a !== void 0 ? _a : 0) >= 0.5 || ((_b = lane.onTimeRate) !== null && _b !== void 0 ? _b : 1) < 0.92; });
    const highGovernanceSignals = signalEnvelopes.filter((envelope) => ["HIGH", "CRITICAL"].includes(envelope.signal.severity));
    const bestBid = openBids.sort((left, right) => { var _a, _b; return ((_a = left.bidRate) !== null && _a !== void 0 ? _a : 0) - ((_b = right.bidRate) !== null && _b !== void 0 ? _b : 0); })[0];
    const bestBidLoad = bestBid ? loads.find((load) => load.loadId === bestBid.loadId) : undefined;
    const bestBidCarrier = bestBid ? carriers.find((carrier) => carrier.carrierId === bestBid.carrierId) : undefined;
    const highestExposureLoad = activeLoads
        .slice()
        .sort((left, right) => {
        var _a, _b, _c, _d;
        return (((_a = right.targetSellRate) !== null && _a !== void 0 ? _a : 0) - ((_b = right.targetBuyRate) !== null && _b !== void 0 ? _b : 0)) -
            (((_c = left.targetSellRate) !== null && _c !== void 0 ? _c : 0) - ((_d = left.targetBuyRate) !== null && _d !== void 0 ? _d : 0));
    })[0];
    const trackedShipment = (_a = shipments.find((shipment) => shipment.state !== "DELIVERED")) !== null && _a !== void 0 ? _a : shipments[0];
    const sourcingSignal = signal({
        signalType: "CARRIER_INVITE_REVIEW",
        sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
        severity: severityForCount(blockedCarriers.length, carriersInReview.length),
        confidenceScore: carriersInReview.length > 0 ? 0.78 : 0.62,
        description: `${carriersInReview.length} carrier profile(s) need sourcing review before broader tender activity.`,
        businessDomains: ["FREIGHT_BROKERAGE", "TRANSPORTATION", "RISK"],
        affectedEntities: {
            carriers: carriersInReview.map((carrier) => carrier.carrierId),
            loads: openPostings.map((posting) => posting.loadId),
        },
        metrics: {
            carriers_in_review: carriersInReview.length,
            blocked_carriers: blockedCarriers.length,
            open_tenders: openPostings.length,
        },
        tags: ["sil", "sourcing", "carrier-network"],
        recommendedActions: [
            {
                actionType: "CARRIER_SOURCING_REVIEW",
                targetModule: "PLATFORM_OVERVIEW",
                priority: carriersInReview.length > 0 ? "HIGH" : "MEDIUM",
                description: "Review carrier eligibility and invite controls before expanding tender visibility.",
            },
        ],
    });
    const planningSignal = signal({
        signalType: "LANE_RATE_EXCEPTION",
        sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
        severity: severityForCount(0, volatileLanes.length),
        confidenceScore: volatileLanes.length > 0 ? 0.74 : 0.6,
        description: `${volatileLanes.length} lane(s) show planning pressure from rate or transit variability.`,
        businessDomains: ["TRANSPORTATION", "FINANCE", "RISK"],
        affectedEntities: {
            lanes: volatileLanes.map((lane) => lane.laneId),
            loads: activeLoads.map((load) => load.loadId),
        },
        metrics: {
            active_loads: activeLoads.length,
            volatile_lanes: volatileLanes.length,
            market_rate_points: marketRates.length,
        },
        tags: ["sil", "planning", "lane-analytics"],
        recommendedActions: [
            {
                actionType: "PLAN_COVERAGE_REVIEW",
                targetModule: "PLATFORM_OVERVIEW",
                priority: volatileLanes.length > 0 ? "HIGH" : "MEDIUM",
                description: "Pressure test lane plan, margin targets, and shipment timing before posting commitments.",
            },
        ],
    });
    const productionSignal = signal({
        signalType: "SHIPMENT_EXECUTION_EXCEPTION",
        sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
        severity: severityForCount(shipmentExceptions.length, missingDocuments.length + pendingAppointments.length),
        confidenceScore: shipmentExceptions.length > 0 ? 0.82 : 0.66,
        description: "Execution control is watching appointments, document packets, and shipment exceptions.",
        businessDomains: ["SHIPMENT_VISIBILITY", "WAREHOUSE_OPERATIONS", "CUSTOMER_SERVICE", "RISK"],
        affectedEntities: {
            shipments: shipments.map((shipment) => shipment.shipmentId),
            loads: shipments.map((shipment) => shipment.loadId).filter(Boolean),
        },
        metrics: {
            shipment_exceptions: shipmentExceptions.length,
            pending_appointments: pendingAppointments.length,
            missing_pod_packets: missingDocuments.length,
        },
        tags: ["sil", "production", "execution-control"],
        recommendedActions: [
            {
                actionType: "EXECUTION_PACKET_REVIEW",
                targetModule: "PLATFORM_OVERVIEW",
                priority: shipmentExceptions.length > 0 ? "HIGH" : "MEDIUM",
                description: "Validate appointment and document readiness before moving shipment state forward.",
            },
        ],
    });
    const supplyChainSignal = signal({
        signalType: "LOAD_AT_RISK",
        sourceModule: "SHIPMENT_INTELLIGENCE_LAYER",
        severity: severityForCount(highGovernanceSignals.filter((item) => item.signal.severity === "CRITICAL").length, highGovernanceSignals.length),
        confidenceScore: highGovernanceSignals.length > 0 ? 0.8 : 0.64,
        description: "End-to-end network view is aggregating shipment, sourcing, rate, and governance pressure.",
        businessDomains: ["TRANSPORTATION", "SHIPMENT_VISIBILITY", "FINANCE", "RISK"],
        affectedEntities: {
            loads: activeLoads.map((load) => load.loadId),
            shipments: shipments.map((shipment) => shipment.shipmentId),
            lanes: lanes.map((lane) => lane.laneId),
        },
        metrics: {
            active_loads: activeLoads.length,
            active_shipments: shipments.filter((shipment) => shipment.state !== "DELIVERED").length,
            high_governance_signals: highGovernanceSignals.length,
        },
        tags: ["sil", "supply-chain", "network-control"],
        recommendedActions: [
            {
                actionType: "NETWORK_GOVERNANCE_REVIEW",
                targetModule: "PLATFORM_OVERVIEW",
                priority: highGovernanceSignals.length > 0 ? "HIGH" : "MEDIUM",
                description: "Review cross-functional risk before committing customer-facing transportation decisions.",
            },
        ],
    });
    return {
        workspaceId,
        generatedAt: new Date().toISOString(),
        panels: {
            sourcing: {
                area: "sourcing",
                eyebrow: "Carrier Network",
                title: "Sourcing Control",
                summary: "Carrier eligibility, tender visibility, and sourcing risk connected to governed bid decisions.",
                phaseStatus: "CONNECTED",
                metrics: [
                    { label: "Carriers", value: carriers.length },
                    { label: "In Review", value: carriersInReview.length, tone: carriersInReview.length ? "warning" : "good" },
                    { label: "Open Tenders", value: openPostings.length },
                    { label: "Best Bid", value: currency(bestBid === null || bestBid === void 0 ? void 0 : bestBid.bidRate), tone: bestBid ? "neutral" : "warning" },
                ],
                workItems: [
                    ...carriersInReview.slice(0, 3).map((carrier) => {
                        var _a, _b;
                        return ({
                            id: carrier.carrierId,
                            label: carrier.carrierName,
                            status: carrier.blocked ? "BLOCKED" : "REVIEW",
                            detail: `Credit ${(_a = carrier.creditStatus) !== null && _a !== void 0 ? _a : "UNKNOWN"} / Safety ${(_b = carrier.safetyStatus) !== null && _b !== void 0 ? _b : "UNKNOWN"} / On-time ${pct(carrier.onTimeRate)}`,
                            severity: (carrier.blocked ? "CRITICAL" : "HIGH"),
                        });
                    }),
                    ...(bestBid
                        ? [
                            {
                                id: bestBid.bidId,
                                label: (_b = bestBidCarrier === null || bestBidCarrier === void 0 ? void 0 : bestBidCarrier.carrierName) !== null && _b !== void 0 ? _b : bestBid.carrierId,
                                status: bestBid.status,
                                detail: `${currency(bestBid.bidRate)} bid on ${(_c = bestBidLoad === null || bestBidLoad === void 0 ? void 0 : bestBidLoad.customerName) !== null && _c !== void 0 ? _c : bestBid.loadId}`,
                                severity: (((_d = bestBid.score) === null || _d === void 0 ? void 0 : _d.governanceSignalRequired) ? "HIGH" : "MEDIUM"),
                            },
                        ]
                        : []),
                ],
                governanceSignals: [sourcingSignal],
                governanceTriggers: ["Carrier credit or safety review", "Tender visibility expansion", "Bid score routes to Encompax"],
                recommendedActions: ["Review carrier network status", "Send invite packets only to eligible carriers", "Route risky awards to Encompax"],
                evidence: ["Carrier profiles now influence bid recommendations.", "Tender invite communication records are tracked."],
            },
            planning: {
                area: "planning",
                eyebrow: "Lane Plan",
                title: "Planning Control",
                summary: "Shipment planning now watches lane volatility, load coverage, market rates, and margin targets.",
                phaseStatus: "CONNECTED",
                metrics: [
                    { label: "Active Loads", value: activeLoads.length },
                    { label: "Lanes", value: lanes.length },
                    { label: "Volatile Lanes", value: volatileLanes.length, tone: volatileLanes.length ? "warning" : "good" },
                    { label: "Top Exposure", value: currency(((_e = highestExposureLoad === null || highestExposureLoad === void 0 ? void 0 : highestExposureLoad.targetSellRate) !== null && _e !== void 0 ? _e : 0) - ((_f = highestExposureLoad === null || highestExposureLoad === void 0 ? void 0 : highestExposureLoad.targetBuyRate) !== null && _f !== void 0 ? _f : 0)) },
                ],
                workItems: [
                    ...activeLoads.slice(0, 3).map((load) => {
                        var _a;
                        return ({
                            id: load.loadId,
                            label: (_a = load.customerName) !== null && _a !== void 0 ? _a : load.customerId,
                            status: load.status,
                            detail: `${load.origin.state} to ${load.destination.state} / ${load.mode} ${load.equipmentType}`,
                            severity: (load.status === "POSTED" || load.status === "BIDDING" ? "HIGH" : "MEDIUM"),
                        });
                    }),
                    ...volatileLanes.slice(0, 2).map((lane) => ({
                        id: lane.laneId,
                        label: `${lane.originRegion} to ${lane.destinationRegion}`,
                        status: "LANE REVIEW",
                        detail: `Median ${currency(lane.marketRateMedian)} / on-time ${pct(lane.onTimeRate)}`,
                        severity: "HIGH",
                    })),
                ],
                governanceSignals: [planningSignal],
                governanceTriggers: ["Lane rate exception", "Margin target pressure", "Pickup or delivery window risk"],
                recommendedActions: ["Validate lane market rate", "Check coverage before customer commitment", "Send exceptions to Platform Overview"],
                evidence: ["Planning reads loads, lanes, bids, and market-rate observations.", "Rate and timing inputs are ready for Marengo upgrade later."],
            },
            production: {
                area: "production",
                eyebrow: "Execution",
                title: "Production Control",
                summary: "Shipment execution now connects appointment scheduling, document packets, and dispatch readiness.",
                phaseStatus: "CONNECTED",
                metrics: [
                    { label: "Shipments", value: shipments.length },
                    { label: "Appointments", value: appointments.length },
                    { label: "Documents", value: documents.length },
                    { label: "Exceptions", value: shipmentExceptions.length, tone: shipmentExceptions.length ? "risk" : "good" },
                ],
                workItems: [
                    ...(trackedShipment
                        ? [
                            {
                                id: trackedShipment.shipmentId,
                                label: (_g = trackedShipment.carrierName) !== null && _g !== void 0 ? _g : trackedShipment.shipmentId,
                                status: trackedShipment.state,
                                detail: `${trackedShipment.stops.length} stops / ${(_h = trackedShipment.trackingNumber) !== null && _h !== void 0 ? _h : "tracking pending"}`,
                                severity: (trackedShipment.state === "EXCEPTION" ? "CRITICAL" : "MEDIUM"),
                            },
                        ]
                        : []),
                    ...pendingAppointments.slice(0, 3).map((appointment) => {
                        var _a, _b;
                        return ({
                            id: appointment.stopId,
                            label: (_a = appointment.facilityName) !== null && _a !== void 0 ? _a : appointment.city,
                            status: (_b = appointment.appointmentStatus) !== null && _b !== void 0 ? _b : "PENDING",
                            detail: `${appointment.type} / ${appointment.city}, ${appointment.state}`,
                            severity: (appointment.appointmentStatus === "MISSED" ? "CRITICAL" : "HIGH"),
                        });
                    }),
                ],
                governanceSignals: [productionSignal],
                governanceTriggers: ["Dispatch readiness hold", "Missed or unconfirmed appointment", "Missing POD or shipment packet"],
                recommendedActions: ["Confirm appointment readiness", "Attach required documents", "Use override-with-reason only with evidence"],
                evidence: ["Shipment state progression is event-backed.", "Document packets and readiness reviews already generate governance signals."],
            },
            supplyChain: {
                area: "supplyChain",
                eyebrow: "Network Control",
                title: "Supply Chain Optimization",
                summary: "End-to-end view across load planning, shipment execution, carrier risk, lane pressure, and governance memory.",
                phaseStatus: "CONNECTED",
                metrics: [
                    { label: "Network Loads", value: activeLoads.length },
                    { label: "Active Shipments", value: shipments.filter((shipment) => shipment.state !== "DELIVERED").length },
                    { label: "High Signals", value: highGovernanceSignals.length, tone: highGovernanceSignals.length ? "warning" : "good" },
                    { label: "Market Points", value: marketRates.length },
                ],
                workItems: [
                    ...highGovernanceSignals.slice(0, 4).map((envelope) => ({
                        id: envelope.signalId,
                        label: envelope.signal.signalType,
                        status: envelope.status,
                        detail: envelope.signal.description,
                        severity: envelope.signal.severity,
                    })),
                    ...(highGovernanceSignals.length === 0 && activeLoads[0]
                        ? [
                            {
                                id: activeLoads[0].loadId,
                                label: (_j = activeLoads[0].customerName) !== null && _j !== void 0 ? _j : activeLoads[0].customerId,
                                status: activeLoads[0].status,
                                detail: "No critical governance envelope is currently active for this load.",
                                severity: "MEDIUM",
                            },
                        ]
                        : []),
                ],
                governanceSignals: [supplyChainSignal],
                governanceTriggers: ["High-severity governance envelope", "Cross-functional customer impact", "Network-level rate or capacity pressure"],
                recommendedActions: ["Review aggregated Encompax signals", "Use Marengo when deeper statistical forecasting is needed", "Keep SIL as the execution source of truth"],
                evidence: ["Governance signals preserve status and payload history.", "SIL can now act as a standalone visibility layer or feed Marengo."],
            },
        },
    };
}
