import React, { useEffect, useMemo, useState } from "react";
import {
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
  score?: {
    score: number;
    scoreBand: string;
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

const TransportationCommandPanel: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [postings, setPostings] = useState<Posting[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
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

  useEffect(() => {
    let alive = true;

    async function loadData() {
      try {
        setLoading(true);
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

        if (!alive) return;

        setOverview(overviewResult);
        setLoads(loadsResult.loads ?? []);
        setPostings(postingsResult.postings ?? []);
        setBids(bidsResult.bids ?? []);
        setLanes(lanesResult.lanes ?? []);
        setSignals(signalsResult.governanceSignals ?? []);
        setSelectedLoadId((loadsResult.loads?.[0]?.loadId as string | undefined) ?? null);

        // These endpoints are intentionally loaded now so the panel proves the
        // broader SIL API is healthy, even before every section has a table.
        void shipmentsResult;
        void carriersResult;
        void marketRatesResult;
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
                  <strong>{selectedPosting?.status ?? "Not posted"}</strong>
                </div>
              </div>

              <div className="transport-table-wrap">
                <table className="transport-table">
                  <thead>
                    <tr>
                      <th>Carrier</th>
                      <th>Bid</th>
                      <th>Score</th>
                      <th>Recommendation</th>
                      <th>Governed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBids.map((bid) => (
                      <tr key={bid.bidId}>
                        <td>{bid.carrierId.replace("carrier-", "")}</td>
                        <td>{money(bid.bidRate)}</td>
                        <td>{bid.score?.score ?? "--"}</td>
                        <td>{bid.score?.recommendedAction ?? bid.status}</td>
                        <td>{bid.score?.governanceSignalRequired ? "Required" : "No"}</td>
                      </tr>
                    ))}
                    {selectedBids.length === 0 && (
                      <tr>
                        <td colSpan={5}>No bids recorded for this load.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

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
