import React, { useEffect, useMemo, useState } from "react";
import {
  createLoadBoardBid,
  createLoadBoardPosting,
  createTransportationCarrier,
  createTransportationLoad,
  decideLoadBoardBid,
  fetchCarrierQuotes,
  fetchLoadBoardBids,
  fetchLoadBoardPostings,
  fetchLoadTransitions,
  fetchMarketRates,
  fetchMarketRateAnalysis,
  fetchSilGovernanceSignals,
  fetchTransportationCarriers,
  fetchTransportationLanes,
  fetchTransportationLoads,
  fetchTransportationOverview,
  fetchTransportationShipments,
  fetchWorkflowEvents,
  transitionLoad,
  updateLoadBoardBidCommercials,
  updateLoadBoardPostingVisibility,
  updateTransportationCarrier,
  updateTransportationShipmentProgress,
} from "../api/client";
import EncompaxMark from "./EncompaxMark";

type Load = {
  loadId: string;
  customerId: string;
  customerName?: string;
  origin: { city: string; state: string };
  destination: { city: string; state: string };
  mode: string;
  equipmentType: string;
  status: string;
  targetSellRate?: number;
  targetBuyRate?: number;
};

type Bid = {
  bidId: string;
  loadId: string;
  carrierId: string;
  bidRate: number;
  status: string;
  expiresAt?: string;
  counterOfferRate?: number;
  counterOfferStatus?: string;
  score?: {
    score: number;
    scoreBand: string;
    factors?: {
      carrierTrust?: number;
      carrierReliability?: number;
      rateFit?: number;
      marginFit?: number;
      timingFit?: number;
    };
    governanceReasons?: string[];
    carrierDecisionSummary?: string;
    riskFlags?: string[];
    recommendedAction: string;
    evidence: string[];
    governanceSignalRequired: boolean;
  };
};

type Posting = {
  postingId: string;
  loadId: string;
  board: string;
  postedRate?: number;
  status: string;
  visibility?: string;
  invitedCarrierIds?: string[];
  bidCount: number;
  bestBidRate?: number;
};

type Lane = {
  laneId: string;
  originRegion: string;
  destinationRegion: string;
  mode: string;
  equipmentType: string;
  marketRateMedian?: number;
  onTimeRate?: number;
};

type CarrierQuote = {
  quoteId: string;
  carrierName: string;
  provider: string;
  rate: number;
  serviceLevel: string;
  confidenceScore: number;
  evidence: string[];
};

type Carrier = {
  carrierId: string;
  carrierName: string;
  creditStatus?: string;
  safetyStatus?: string;
  serviceScore?: number;
  onTimeRate?: number;
  preferred?: boolean;
  blocked?: boolean;
};

type ShipmentStop = {
  stopId: string;
  sequence: number;
  type: string;
  location: { city: string; state: string; facilityName?: string };
  appointmentStart?: string;
  appointmentEnd?: string;
  arrivedAt?: string;
  loadedUnloadedAt?: string;
  departedAt?: string;
  status: string;
};

type Shipment = {
  shipmentId: string;
  loadId?: string;
  carrierId?: string;
  carrierName?: string;
  trackingNumber?: string;
  state: string;
  stops: ShipmentStop[];
  exception?: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
};

type MarketAnalysis = {
  pressureLevel: string;
  marketMedianRate?: number;
  bidRate?: number;
  projectedMargin?: number;
  rateVariancePercent?: number;
  marginVariance?: number;
  evidence: string[];
};

type WorkflowEvent = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  summary: string;
  evidence: string[];
};

type Signal = {
  signalType: string;
  severity: string;
  confidenceScore: number;
  description: string;
  recommendedActions: Array<{ description: string; priority: string }>;
};

type Overview = {
  activeLoads: number;
  activePostings: number;
  openBids: number;
  governanceSignalCount: number;
  loadsAtRisk: number;
};

const money = (value?: number) =>
  typeof value === "number"
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)
    : "--";

const shortLoadId = (loadId: string) => loadId.replace("load-", "");

async function loadTransportationData() {
  const [
    overviewResult,
    loadsResult,
    shipmentsResult,
    carriersResult,
    lanesResult,
    postingsResult,
    bidsResult,
    marketRatesResult,
    signalsResult,
  ] = await Promise.all([
    fetchTransportationOverview(),
    fetchTransportationLoads(),
    fetchTransportationShipments(),
    fetchTransportationCarriers(),
    fetchTransportationLanes(),
    fetchLoadBoardPostings(),
    fetchLoadBoardBids(),
    fetchMarketRates(),
    fetchSilGovernanceSignals(),
  ]);

  void marketRatesResult;

  return {
    overview: overviewResult,
    loads: loadsResult.loads ?? [],
    shipments: shipmentsResult.shipments ?? [],
    postings: postingsResult.postings ?? [],
    bids: bidsResult.bids ?? [],
    carriers: carriersResult.carriers ?? [],
    lanes: lanesResult.lanes ?? [],
    signals: signalsResult.governanceSignals ?? [],
  };
}

const TransportationCommandPanel: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [postings, setPostings] = useState<Posting[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [carrierQuotes, setCarrierQuotes] = useState<CarrierQuote[]>([]);
  const [allowedTransitions, setAllowedTransitions] = useState<string[]>([]);
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysis | null>(null);
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([]);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadForm, setLoadForm] = useState({
    customerId: "gopuff",
    customerName: "Gopuff",
    originCity: "Philadelphia",
    originState: "PA",
    destinationCity: "Atlanta",
    destinationState: "GA",
    targetSellRate: "2950",
    targetBuyRate: "2450",
  });
  const [postingRate, setPostingRate] = useState("2450");
  const [postingVisibility, setPostingVisibility] = useState("INVITED_CARRIERS");
  const [bidForm, setBidForm] = useState({
    carrierId: "carrier-riverbend",
    bidRate: "2650",
    counterOfferRate: "2450",
  });
  const [carrierForm, setCarrierForm] = useState({
    carrierName: "New Carrier",
    creditStatus: "REVIEW",
    safetyStatus: "REVIEW",
    serviceScore: "0.72",
    onTimeRate: "0.9",
  });

  const refreshTransportationData = async (preferredLoadId?: string) => {
    const results = await loadTransportationData();
    const nextSelectedLoadId =
      preferredLoadId ??
      (selectedLoadId && results.loads.some((load: Load) => load.loadId === selectedLoadId) ? selectedLoadId : null) ??
      ((results.loads[0]?.loadId as string | undefined) ?? null);

    setOverview(results.overview);
    setLoads(results.loads);
    setShipments(results.shipments);
    setPostings(results.postings);
    setBids(results.bids);
    setCarriers(results.carriers);
    setLanes(results.lanes);
    setSignals(results.signals);
    setSelectedLoadId(nextSelectedLoadId);
  };

  useEffect(() => {
    let alive = true;

    async function loadData() {
      try {
        setLoading(true);
        const results = await loadTransportationData();

        if (!alive) return;

        setOverview(results.overview);
        setLoads(results.loads);
        setShipments(results.shipments);
        setPostings(results.postings);
        setBids(results.bids);
        setCarriers(results.carriers);
        setLanes(results.lanes);
        setSignals(results.signals);
        setSelectedLoadId((results.loads[0]?.loadId as string | undefined) ?? null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load transportation command data");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();
    return () => {
      alive = false;
    };
  }, []);

  const selectedLoad = useMemo(
    () => loads.find((load) => load.loadId === selectedLoadId) ?? loads[0] ?? null,
    [loads, selectedLoadId]
  );

  const selectedPosting = useMemo(
    () => postings.find((posting) => posting.loadId === selectedLoad?.loadId) ?? null,
    [postings, selectedLoad]
  );

  const selectedBids = useMemo(
    () => bids.filter((bid) => bid.loadId === selectedLoad?.loadId),
    [bids, selectedLoad]
  );

  const selectedBid = selectedBids[0] ?? null;

  const selectedShipment = useMemo(
    () => shipments.find((shipment) => shipment.loadId === selectedLoad?.loadId) ?? null,
    [shipments, selectedLoad?.loadId]
  );

  useEffect(() => {
    let alive = true;

    async function loadOperationalContext() {
      if (!selectedLoad?.loadId) return;

      try {
        const [quotesResult, transitionsResult, marketResult, eventsResult] = await Promise.all([
          fetchCarrierQuotes(selectedLoad.loadId),
          fetchLoadTransitions(selectedLoad.loadId),
          fetchMarketRateAnalysis(selectedLoad.loadId, selectedBid?.bidId),
          fetchWorkflowEvents({ loadId: selectedLoad.loadId }),
        ]);

        if (!alive) return;

        setCarrierQuotes(quotesResult.quotes ?? []);
        setAllowedTransitions(transitionsResult.allowedTransitions ?? []);
        setMarketAnalysis(marketResult.analysis ?? null);
        setWorkflowEvents(eventsResult.events ?? []);
      } catch (err) {
        if (!alive) return;
        setActionStatus(err instanceof Error ? err.message : "Failed to load operational context");
      }
    }

    loadOperationalContext();
    return () => {
      alive = false;
    };
  }, [selectedLoad?.loadId, selectedBid?.bidId]);

  async function handleTransition(nextState: string) {
    if (!selectedLoad) return;

    try {
      setActionStatus(`Moving load to ${nextState}...`);
      const result = await transitionLoad(selectedLoad.loadId, {
        nextState,
        actor: "operator",
        evidence: ["operator action from Transportation Command"],
      });

      setLoads((current) =>
        current.map((load) =>
          load.loadId === selectedLoad.loadId ? { ...load, status: result.load.status } : load
        )
      );
      setAllowedTransitions([]);
      setWorkflowEvents((current) => [result.event, ...current]);
      setActionStatus(result.warnings?.length ? result.warnings.join(" ") : `Load moved to ${nextState}.`);
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Load transition failed");
    }
  }

  async function handleCreateLoad(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setActionStatus("Creating planned load...");
      const payload = {
        customerId: loadForm.customerId,
        customerName: loadForm.customerName,
        origin: { city: loadForm.originCity, state: loadForm.originState },
        destination: { city: loadForm.destinationCity, state: loadForm.destinationState },
        mode: "FTL",
        equipmentType: "DRY_VAN",
        targetSellRate: Number(loadForm.targetSellRate),
        targetBuyRate: Number(loadForm.targetBuyRate),
      };
      const result = await createTransportationLoad(payload);
      await refreshTransportationData(result.load.loadId);
      setActionStatus("Load created and ready for posting.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Load creation failed");
    }
  }

  async function handleCreatePosting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLoad) return;

    try {
      setActionStatus("Posting selected load to board...");
      await createLoadBoardPosting({
        loadId: selectedLoad.loadId,
        board: "SIL_LOAD_BOARD",
        postedRate: Number(postingRate),
        visibility: postingVisibility,
        invitedCarrierIds:
          postingVisibility === "INVITED_CARRIERS" ? carriers.filter((carrier) => carrier.preferred).map((carrier) => carrier.carrierId) : [],
      });
      await refreshTransportationData(selectedLoad.loadId);
      setActionStatus("Load posted to the SIL load board.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Load posting failed");
    }
  }

  async function handleCreateBid(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLoad) return;

    try {
      setActionStatus("Recording carrier bid...");
      await createLoadBoardBid({
        loadId: selectedLoad.loadId,
        carrierId: bidForm.carrierId,
        bidRate: Number(bidForm.bidRate),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      });
      await refreshTransportationData(selectedLoad.loadId);
      setActionStatus("Carrier bid scored and stored.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Bid creation failed");
    }
  }

  async function handleCreateCarrier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setActionStatus("Saving carrier profile...");
      const result = await createTransportationCarrier({
        carrierName: carrierForm.carrierName,
        creditStatus: carrierForm.creditStatus,
        safetyStatus: carrierForm.safetyStatus,
        serviceScore: Number(carrierForm.serviceScore),
        onTimeRate: Number(carrierForm.onTimeRate),
      });
      setCarriers((current) => [result.carrier, ...current.filter((carrier) => carrier.carrierId !== result.carrier.carrierId)]);
      setBidForm((current) => ({ ...current, carrierId: result.carrier.carrierId }));
      setActionStatus("Carrier profile saved and selected for bidding.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Carrier creation failed");
    }
  }

  async function handleCarrierFlag(carrier: Carrier, patch: Partial<Carrier>) {
    try {
      setActionStatus("Updating carrier profile...");
      const result = await updateTransportationCarrier(carrier.carrierId, patch);
      setCarriers((current) =>
        current.map((item) => (item.carrierId === carrier.carrierId ? result.carrier : item))
      );
      setActionStatus("Carrier profile updated.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Carrier update failed");
    }
  }

  async function handleBidDecision(bidId: string, decision: "SHORTLISTED" | "AWARDED" | "REJECTED") {
    try {
      setActionStatus(`${decision.replaceAll("_", " ")} carrier bid...`);
      await decideLoadBoardBid(bidId, {
        decision,
        actor: "operator",
        evidence: ["operator decision from Transportation Command"],
      });
      await refreshTransportationData(selectedLoad?.loadId);
      setActionStatus(`Bid marked ${decision.toLowerCase().replaceAll("_", " ")}.`);
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Bid decision failed");
    }
  }

  async function handleBidCommercialUpdate(
    bid: Bid,
    patch: { counterOfferRate?: number; counterOfferStatus?: string; status?: string; expiresAt?: string }
  ) {
    try {
      setActionStatus("Updating bid controls...");
      const result = await updateLoadBoardBidCommercials(bid.bidId, {
        ...patch,
        actor: "operator",
        evidence: ["operator brokerage control from Transportation Command"],
      });
      setBids((current) => current.map((item) => (item.bidId === bid.bidId ? result.bid : item)));
      setWorkflowEvents((current) => [result.event, ...current]);
      setActionStatus("Bid controls updated.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Bid controls update failed");
    }
  }

  async function handlePostingInviteUpdate(mode: "preferred" | "all" | "private") {
    if (!selectedPosting) return;

    try {
      setActionStatus("Updating posting visibility...");
      const invitedCarrierIds =
        mode === "preferred"
          ? carriers.filter((carrier) => carrier.preferred).map((carrier) => carrier.carrierId)
          : mode === "all"
            ? carriers.map((carrier) => carrier.carrierId)
            : [];
      const visibility = mode === "private" ? "PRIVATE" : mode === "all" ? "PUBLIC" : "INVITED_CARRIERS";
      const result = await updateLoadBoardPostingVisibility(selectedPosting.postingId, {
        visibility,
        invitedCarrierIds,
        actor: "operator",
        evidence: [`Posting visibility set to ${visibility}`, `Carrier invite count: ${invitedCarrierIds.length}`],
      });
      setPostings((current) =>
        current.map((posting) => (posting.postingId === selectedPosting.postingId ? result.posting : posting))
      );
      setWorkflowEvents((current) => [result.event, ...current]);
      setActionStatus("Posting visibility updated.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Posting visibility update failed");
    }
  }

  async function handleShipmentProgress(
    state: string,
    stop?: ShipmentStop,
    timestampField?: "arrivedAt" | "loadedUnloadedAt" | "departedAt"
  ) {
    if (!selectedShipment) return;

    try {
      setActionStatus(`Updating shipment to ${state}...`);
      const stopStatus = timestampField === "departedAt" || state === "DELIVERED" ? "COMPLETED" : "ARRIVED";
      const result = await updateTransportationShipmentProgress(selectedShipment.shipmentId, {
        state,
        stopId: stop?.stopId,
        stopStatus,
        timestampField,
        actor: "operator",
        evidence: [
          `Operator updated shipment state to ${state}`,
          stop ? `Stop ${stop.sequence} ${stop.type} ${stopStatus}` : "Shipment header update",
        ],
      });

      setShipments((current) =>
        current.map((shipment) => (shipment.shipmentId === selectedShipment.shipmentId ? result.shipment : shipment))
      );
      setWorkflowEvents((current) => [result.event, ...current]);
      if (result.governanceSignal) {
        setSignals((current) => [result.governanceSignal, ...current]);
      }
      setActionStatus(
        result.governanceSignal
          ? `Shipment progress recorded. ${result.governanceSignal.signalType} routed to Encompax.`
          : "Shipment progress recorded."
      );
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Shipment progress update failed");
    }
  }

  if (loading) {
    return <div className="empty-state">Loading transportation command...</div>;
  }

  if (error) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">Transportation API unavailable</p>
        <p className="empty-state-body">{error}</p>
      </div>
    );
  }

  return (
    <div className="transport-command">
      <section className="transport-hero">
        <div>
          <p className="transport-eyebrow">Shipment Intelligence Layer</p>
          <h2>Transportation Command</h2>
          <p>
            Follow loads from planning into posting, bid review, carrier selection,
            and governed exception routing.
          </p>
        </div>
        <div className="transport-parent-brand">
          <EncompaxMark size={34} />
          <div>
            <span>Governed by Encompax</span>
            <strong>Signals route into platform review</strong>
          </div>
        </div>
        <div className="transport-flow">
          <span>Plan</span>
          <span>Post</span>
          <span>Bid</span>
          <span>Award</span>
          <span>Move</span>
          <span>Govern</span>
        </div>
      </section>

      <section className="transport-metrics">
        <div className="metric-card">
          <span>Active Loads</span>
          <strong>{overview?.activeLoads ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>Posted Loads</span>
          <strong>{overview?.activePostings ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>Open Bids</span>
          <strong>{overview?.openBids ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>Governance Signals</span>
          <strong>{overview?.governanceSignalCount ?? 0}</strong>
        </div>
        <div className="metric-card attention">
          <span>Loads at Risk</span>
          <strong>{overview?.loadsAtRisk ?? 0}</strong>
        </div>
      </section>

      <section className="transport-layout">
        <div className="transport-panel">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">Execution</p>
              <h3>Active Loads</h3>
            </div>
            <span>{loads.length} loads</span>
          </div>
          <form className="transport-action-form" onSubmit={handleCreateLoad}>
            <div className="transport-panel-header compact">
              <div>
                <p className="transport-eyebrow">Plan Load</p>
                <h4>Quick Intake</h4>
              </div>
              <button className="btn btn-primary btn-sm" type="submit">Create</button>
            </div>
            <div className="transport-form-grid">
              <label>
                Customer
                <input
                  value={loadForm.customerName}
                  onChange={(event) => setLoadForm((current) => ({ ...current, customerName: event.target.value }))}
                />
              </label>
              <label>
                Origin
                <input
                  value={loadForm.originState}
                  onChange={(event) => setLoadForm((current) => ({ ...current, originState: event.target.value.toUpperCase() }))}
                />
              </label>
              <label>
                Destination
                <input
                  value={loadForm.destinationState}
                  onChange={(event) =>
                    setLoadForm((current) => ({ ...current, destinationState: event.target.value.toUpperCase() }))
                  }
                />
              </label>
              <label>
                Sell
                <input
                  value={loadForm.targetSellRate}
                  inputMode="numeric"
                  onChange={(event) => setLoadForm((current) => ({ ...current, targetSellRate: event.target.value }))}
                />
              </label>
            </div>
          </form>
          <div className="transport-load-list">
            {loads.map((load) => (
              <button
                key={load.loadId}
                className={`transport-load-card${selectedLoad?.loadId === load.loadId ? " active" : ""}`}
                onClick={() => setSelectedLoadId(load.loadId)}
              >
                <div>
                  <strong>{load.customerName ?? load.customerId}</strong>
                  <span>{shortLoadId(load.loadId)}</span>
                </div>
                <p>
                  {load.origin.city}, {load.origin.state} to {load.destination.city}, {load.destination.state}
                </p>
                <div className="transport-card-meta">
                  <span>{load.mode}</span>
                  <span>{load.equipmentType}</span>
                  <span>{load.status}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="transport-panel primary">
          {selectedLoad && (
            <>
              <div className="transport-panel-header">
                <div>
                  <p className="transport-eyebrow">Load Board Review</p>
                  <h3>{selectedLoad.customerName ?? "Selected Load"}</h3>
                </div>
                <span>{selectedLoad.status}</span>
              </div>

              <div className="load-detail-grid">
                <div>
                  <span>Lane</span>
                  <strong>
                    {selectedLoad.origin.state} to {selectedLoad.destination.state}
                  </strong>
                </div>
                <div>
                  <span>Sell Rate</span>
                  <strong>{money(selectedLoad.targetSellRate)}</strong>
                </div>
                <div>
                  <span>Target Buy</span>
                  <strong>{money(selectedLoad.targetBuyRate)}</strong>
                </div>
                <div>
                  <span>Posting</span>
                  <strong>{selectedPosting ? `${selectedPosting.status} / ${selectedPosting.visibility ?? "INVITED"}` : "Not posted"}</strong>
                </div>
              </div>

              <div className="transport-inline-actions">
                <form className="transport-inline-form" onSubmit={handleCreatePosting}>
                  <label>
                    Board rate
                    <input
                      value={postingRate}
                      inputMode="numeric"
                      onChange={(event) => setPostingRate(event.target.value)}
                    />
                  </label>
                  <label>
                    Visibility
                    <select value={postingVisibility} onChange={(event) => setPostingVisibility(event.target.value)}>
                      <option value="INVITED_CARRIERS">Invited</option>
                      <option value="PRIVATE">Private</option>
                      <option value="PUBLIC">Public</option>
                    </select>
                  </label>
                  <button className="btn btn-primary btn-sm" type="submit">
                    Post Load
                  </button>
                </form>
                <form className="transport-inline-form" onSubmit={handleCreateBid}>
                  <label>
                    Carrier
                    <select
                      value={bidForm.carrierId}
                      onChange={(event) => setBidForm((current) => ({ ...current, carrierId: event.target.value }))}
                    >
                      {carriers.map((carrier) => (
                        <option key={carrier.carrierId} value={carrier.carrierId}>
                          {carrier.carrierName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Bid
                    <input
                      value={bidForm.bidRate}
                      inputMode="numeric"
                      onChange={(event) => setBidForm((current) => ({ ...current, bidRate: event.target.value }))}
                    />
                  </label>
                  <label>
                    Counter
                    <input
                      value={bidForm.counterOfferRate}
                      inputMode="numeric"
                      onChange={(event) => setBidForm((current) => ({ ...current, counterOfferRate: event.target.value }))}
                    />
                  </label>
                  <button className="btn btn-secondary btn-sm" type="submit">
                    Score Bid
                  </button>
                </form>
              </div>

              {selectedPosting && (
                <div className="posting-visibility-panel">
                  <div>
                    <p className="transport-eyebrow">Posting Visibility</p>
                    <h4>{selectedPosting.visibility ?? "INVITED_CARRIERS"}</h4>
                    <span>{selectedPosting.invitedCarrierIds?.length ?? 0} invited carrier(s)</span>
                  </div>
                  <div className="transport-row-actions">
                    <button className="btn btn-secondary btn-xs" type="button" onClick={() => handlePostingInviteUpdate("preferred")}>
                      Invite Preferred
                    </button>
                    <button className="btn btn-secondary btn-xs" type="button" onClick={() => handlePostingInviteUpdate("all")}>
                      Open Public
                    </button>
                    <button className="btn btn-secondary btn-xs" type="button" onClick={() => handlePostingInviteUpdate("private")}>
                      Make Private
                    </button>
                  </div>
                </div>
              )}

              <div className="transport-table-wrap">
                <table className="transport-table">
                  <thead>
                    <tr>
                      <th>Carrier</th>
                      <th>Bid</th>
                      <th>Counter</th>
                      <th>Score</th>
                      <th>Trust</th>
                      <th>Recommendation</th>
                      <th>Governed</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBids.map((bid) => (
                      <tr key={bid.bidId}>
                        <td>{bid.carrierId.replace("carrier-", "")}</td>
                        <td>{money(bid.bidRate)}</td>
                        <td>
                          {bid.counterOfferRate ? money(bid.counterOfferRate) : bid.counterOfferStatus ?? "--"}
                        </td>
                        <td>{bid.score?.score ?? "--"}</td>
                        <td>{bid.score?.factors?.carrierTrust ? Math.round(bid.score.factors.carrierTrust) : "--"}</td>
                        <td>{bid.score?.recommendedAction ?? bid.status}</td>
                        <td>{bid.score?.governanceSignalRequired ? "Required" : "No"}</td>
                        <td>
                          <div className="transport-row-actions">
                            <button
                              className="btn btn-secondary btn-xs"
                              type="button"
                              onClick={() =>
                                handleBidCommercialUpdate(bid, {
                                  counterOfferRate: Number(bidForm.counterOfferRate),
                                  counterOfferStatus: "PENDING",
                                })
                              }
                            >
                              Counter
                            </button>
                            <button
                              className="btn btn-secondary btn-xs"
                              type="button"
                              onClick={() =>
                                handleBidCommercialUpdate(bid, {
                                  status: "EXPIRED",
                                  expiresAt: new Date().toISOString(),
                                })
                              }
                            >
                              Expire
                            </button>
                            <button
                              className="btn btn-secondary btn-xs"
                              type="button"
                              onClick={() => handleBidDecision(bid.bidId, "SHORTLISTED")}
                            >
                              Shortlist
                            </button>
                            <button
                              className="btn btn-primary btn-xs"
                              type="button"
                              onClick={() => handleBidDecision(bid.bidId, "AWARDED")}
                            >
                              Award
                            </button>
                            <button
                              className="btn btn-danger btn-xs"
                              type="button"
                              onClick={() => handleBidDecision(bid.bidId, "REJECTED")}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {selectedBids.length === 0 && (
                      <tr>
                        <td colSpan={8}>No bids recorded for this load.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedBid?.score && (
                <div className="carrier-decision-panel">
                  <div>
                    <p className="transport-eyebrow">Carrier Decision Evidence</p>
                    <h4>{selectedBid.score.carrierDecisionSummary ?? "Carrier bid scored for governed routing."}</h4>
                  </div>
                  <div className="score-factor-grid">
                    <div>
                      <span>Trust</span>
                      <strong>{Math.round(selectedBid.score.factors?.carrierTrust ?? 0)}</strong>
                    </div>
                    <div>
                      <span>Reliability</span>
                      <strong>{Math.round(selectedBid.score.factors?.carrierReliability ?? 0)}</strong>
                    </div>
                    <div>
                      <span>Rate Fit</span>
                      <strong>{Math.round(selectedBid.score.factors?.rateFit ?? 0)}</strong>
                    </div>
                    <div>
                      <span>Margin Fit</span>
                      <strong>{Math.round(selectedBid.score.factors?.marginFit ?? 0)}</strong>
                    </div>
                  </div>
                  <div className="governance-reason-list">
                    {(selectedBid.score.governanceReasons?.length
                      ? selectedBid.score.governanceReasons
                      : selectedBid.score.riskFlags ?? []
                    ).slice(0, 5).map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="transport-ops-grid">
                <div className="ops-card">
                  <div className="ops-card-header">
                    <span>Lifecycle</span>
                    <strong>{selectedLoad.status}</strong>
                  </div>
                  <div className="ops-action-row">
                    {allowedTransitions.map((state) => (
                      <button key={state} className="btn btn-secondary btn-sm" onClick={() => handleTransition(state)}>
                        {state.replaceAll("_", " ")}
                      </button>
                    ))}
                    {allowedTransitions.length === 0 && <small>No transitions available.</small>}
                  </div>
                  {actionStatus && <p className="ops-note">{actionStatus}</p>}
                </div>

                <div className="ops-card">
                  <div className="ops-card-header">
                    <span>Market Pressure</span>
                    <strong>{marketAnalysis?.pressureLevel ?? "--"}</strong>
                  </div>
                  <div className="ops-metrics">
                    <span>Median {money(marketAnalysis?.marketMedianRate)}</span>
                    <span>Bid {money(marketAnalysis?.bidRate)}</span>
                    <span>Margin {money(marketAnalysis?.projectedMargin)}</span>
                    <span>Variance {marketAnalysis?.rateVariancePercent ?? "--"}%</span>
                  </div>
                </div>

                <div className="ops-card shipment-execution-card">
                  <div className="ops-card-header">
                    <span>Shipment Execution</span>
                    <strong>{selectedShipment?.state ?? "Not booked"}</strong>
                  </div>
                  {selectedShipment ? (
                    <>
                      <div className="shipment-stop-list">
                        {selectedShipment.stops.map((stop) => (
                          <div key={stop.stopId} className="shipment-stop-row">
                            <div>
                              <strong>
                                {stop.sequence}. {stop.type}
                              </strong>
                              <span>
                                {stop.location.facilityName ? `${stop.location.facilityName}, ` : ""}
                                {stop.location.city}, {stop.location.state}
                              </span>
                              <small>{stop.status}</small>
                            </div>
                            <div className="transport-row-actions">
                              <button
                                className="btn btn-secondary btn-xs"
                                type="button"
                                onClick={() =>
                                  handleShipmentProgress(stop.type === "PICKUP" ? "AT_PICKUP" : "AT_DELIVERY", stop, "arrivedAt")
                                }
                              >
                                Arrive
                              </button>
                              <button
                                className="btn btn-primary btn-xs"
                                type="button"
                                onClick={() =>
                                  handleShipmentProgress(stop.type === "PICKUP" ? "IN_TRANSIT" : "DELIVERED", stop, "departedAt")
                                }
                              >
                                Complete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="ops-action-row">
                        <button className="btn btn-secondary btn-sm" type="button" onClick={() => handleShipmentProgress("DISPATCHED")}>
                          Dispatch
                        </button>
                        <button className="btn btn-danger btn-sm" type="button" onClick={() => handleShipmentProgress("EXCEPTION")}>
                          Exception
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="ops-note">Award a carrier or create a shipment to begin execution tracking.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="transport-layout lower">
        <div className="transport-panel">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">Carrier Provider</p>
              <h3>Quote Options</h3>
            </div>
          </div>
          <div className="lane-list">
            {carrierQuotes.map((quote) => (
              <div key={quote.quoteId} className="lane-row">
                <div>
                  <strong>{quote.carrierName}</strong>
                  <span>{quote.provider} / {quote.serviceLevel}</span>
                </div>
                <div>
                  <strong>{money(quote.rate)}</strong>
                  <span>{Math.round(quote.confidenceScore * 100)}% confidence</span>
                </div>
              </div>
            ))}
            {carrierQuotes.length === 0 &&
              lanes.map((lane) => (
                <div key={lane.laneId} className="lane-row">
                  <div>
                    <strong>
                      {lane.originRegion} to {lane.destinationRegion}
                    </strong>
                    <span>
                      {lane.mode} / {lane.equipmentType}
                    </span>
                  </div>
                  <div>
                    <strong>{money(lane.marketRateMedian)}</strong>
                    <span>{Math.round((lane.onTimeRate ?? 0) * 100)}% on time</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="transport-panel">
          <div className="transport-panel-header">
            <div>
              <p className="transport-eyebrow">Encompax Routing</p>
              <h3>Governance Signals</h3>
            </div>
          </div>
          <div className="signal-list">
            {signals.map((signal) => (
              <article key={`${signal.signalType}-${signal.description}`} className="signal-card">
                <div>
                  <strong>{signal.signalType}</strong>
                  <span>{signal.severity}</span>
                </div>
                <p>{signal.description}</p>
                <small>{signal.recommendedActions[0]?.description}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="transport-panel">
        <div className="transport-panel-header">
          <div>
            <p className="transport-eyebrow">Brokerage Network</p>
            <h3>Carrier Profiles</h3>
          </div>
          <span>{carriers.length} carriers</span>
        </div>
        <form className="transport-inline-actions carrier-management" onSubmit={handleCreateCarrier}>
          <label>
            Carrier Name
            <input
              value={carrierForm.carrierName}
              onChange={(event) => setCarrierForm((current) => ({ ...current, carrierName: event.target.value }))}
            />
          </label>
          <label>
            Credit
            <select
              value={carrierForm.creditStatus}
              onChange={(event) => setCarrierForm((current) => ({ ...current, creditStatus: event.target.value }))}
            >
              <option value="APPROVED">Approved</option>
              <option value="REVIEW">Review</option>
              <option value="BLOCKED">Blocked</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
          <label>
            Safety
            <select
              value={carrierForm.safetyStatus}
              onChange={(event) => setCarrierForm((current) => ({ ...current, safetyStatus: event.target.value }))}
            >
              <option value="CLEAR">Clear</option>
              <option value="REVIEW">Review</option>
              <option value="BLOCKED">Blocked</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
          <label>
            Service
            <input
              value={carrierForm.serviceScore}
              inputMode="decimal"
              onChange={(event) => setCarrierForm((current) => ({ ...current, serviceScore: event.target.value }))}
            />
          </label>
          <button className="btn btn-primary btn-sm" type="submit">
            Add Carrier
          </button>
        </form>
        <div className="carrier-profile-grid">
          {carriers.slice(0, 8).map((carrier) => (
            <article key={carrier.carrierId} className="carrier-profile-card">
              <div>
                <strong>{carrier.carrierName}</strong>
                <span>{carrier.carrierId}</span>
              </div>
              <div className="transport-card-meta">
                <span>{carrier.creditStatus ?? "UNKNOWN"}</span>
                <span>{carrier.safetyStatus ?? "UNKNOWN"}</span>
                <span>{Math.round((carrier.onTimeRate ?? 0) * 100)}% on time</span>
              </div>
              <div className="transport-row-actions">
                <button
                  className="btn btn-secondary btn-xs"
                  type="button"
                  onClick={() => handleCarrierFlag(carrier, { preferred: !carrier.preferred })}
                >
                  {carrier.preferred ? "Preferred" : "Prefer"}
                </button>
                <button
                  className="btn btn-danger btn-xs"
                  type="button"
                  onClick={() => handleCarrierFlag(carrier, { blocked: !carrier.blocked })}
                >
                  {carrier.blocked ? "Unblock" : "Block"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="transport-panel">
        <div className="transport-panel-header">
          <div>
            <p className="transport-eyebrow">Workflow Evidence</p>
            <h3>Operational Event Trail</h3>
          </div>
          <span>{workflowEvents.length} events</span>
        </div>
        <div className="workflow-event-list">
          {workflowEvents.slice(0, 6).map((event) => (
            <article key={event.eventId} className="workflow-event">
              <div>
                <strong>{event.eventType.replaceAll("_", " ")}</strong>
                <span>{new Date(event.occurredAt).toLocaleString()}</span>
              </div>
              <p>{event.summary}</p>
              {event.evidence?.[0] && <small>{event.evidence[0]}</small>}
            </article>
          ))}
          {workflowEvents.length === 0 && <p className="ops-note">No workflow events recorded for this load.</p>}
        </div>
      </section>
    </div>
  );
};

export default TransportationCommandPanel;
