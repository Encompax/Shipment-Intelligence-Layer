# SIL Expansion Blueprint

Date: 2026-05-22

## Product Intent

Shipment Intelligence Layer should become the transportation operations module in the Encompax suite. The current SIL foundation is rooted in warehouse shipment visibility, StarShip polling, FedEx enrichment, Karrio migration planning, and Ethos Biosciences-style fulfillment workflows.

The next build stage expands SIL into transportation planning and freight operations:

- freight forwarding visibility
- freight brokering workflow
- load board posting and bid tracking
- transportation management
- lane, capacity, rate, and service analytics
- Encompax-governed shipment decisions
- Marengo forecast enrichment from shipment performance

SIL should not become a copy of any reference project. Fleetbase, Karrio, loadpartner/tms, load board examples, and marketplace engines are architecture references only.

## Reference Lessons

### Fleetbase

Use as the model for a modular logistics OS:

- API-first modules
- extensible workflow concepts
- real-time operational visibility
- order/fleet/event orientation
- dashboard widgets over operational APIs

SIL adaptation:

- keep shipment, lane, carrier, posting, bid, and exception services separate;
- expose stable APIs that Marengo and Encompax can consume;
- avoid hardwiring UI directly to one carrier or one TMS source.

### Karrio

Use for carrier API, label, rating, tracking, webhook, and document generation patterns.

SIL adaptation:

- Karrio is an integration/provider layer, not the entire SIL product;
- SIL owns operational context, governed routing, shipment intelligence, and business interpretation;
- Karrio data should enrich SIL shipment events and carrier service outcomes.

### Loadpartner/TMS

Use for broker workflow, shipment state, carrier assignment, carrier bounce, dispatch, stops, cancellation, and operational lifecycle ideas.

SIL adaptation:

- implement a clear shipment/load state machine;
- keep stop-level progress explicit;
- model carrier assignment and carrier failure as first-class operational events;
- route risky state transitions to Encompax when needed.

### Load Board And Marketplace References

Use for posting, matching, bidding, and marketplace separation.

SIL adaptation:

- separate load posting from shipment execution;
- separate bid capture from carrier award;
- keep matching/ranking logic explainable and auditable;
- treat matching, capacity scoring, and market rate analytics as proprietary SIL moat logic.

## Core SIL Domains

### Shipment Execution

Operational movement after a shipment/load exists.

Objects:

- shipment
- stop
- carrier assignment
- tracking event
- exception
- shipment document

Recommended states:

- `DRAFT`
- `PENDING`
- `BOOKED`
- `DISPATCHED`
- `AT_PICKUP`
- `IN_TRANSIT`
- `AT_DELIVERY`
- `DELIVERED`
- `CANCELED`
- `EXCEPTION`

### Freight Brokerage

Commercial workflow around finding, qualifying, awarding, and managing carrier capacity.

Objects:

- load
- shipper/customer
- carrier
- broker
- lane
- rate quote
- load posting
- bid
- tender
- award
- margin

Recommended states:

- `LOAD_CREATED`
- `READY_TO_POST`
- `POSTED`
- `BIDDING`
- `CARRIER_SELECTED`
- `TENDERED`
- `ACCEPTED`
- `DISPATCHED`
- `IN_TRANSIT`
- `DELIVERED`
- `INVOICED`
- `CLOSED`
- `CANCELED`

### Load Board

External/internal marketplace surface for load opportunity management.

Objects:

- board
- posting
- bid
- carrier profile
- matching score
- rate band
- bid decision

Primary workflow:

1. Create or import load.
2. Score whether it should be posted.
3. Publish posting.
4. Capture bids.
5. Score carrier fit.
6. Compare bid rate to market and margin.
7. Award or escalate.
8. Route high-risk awards to Encompax.

### Market Intelligence

Analytics layer for planner and broker decisions.

Objects:

- lane profile
- market rate observation
- benchmark rate
- carrier performance profile
- service reliability score
- capacity signal
- rate volatility signal

Outputs:

- expected buy rate
- expected sell rate
- margin exposure
- service risk
- carrier confidence
- lane volatility

## Proprietary Moat Areas

These should be implemented inside SIL, not outsourced to Karrio or copied from reference repos:

- capacity + lane + rate matching
- broker credit and carrier trust scoring
- lane market rate analytics
- real-time load posting orchestration
- Encompax-governed award/exception logic
- planner guidance from shipment performance and market behavior

## Encompax Governance Signals

SIL should send Encompax Platform Overview signals for decisions that affect money, customer commitments, compliance, or execution risk.

Initial signal types:

- `LOAD_AT_RISK`
- `CARRIER_FALLOFF_RISK`
- `TENDER_RESPONSE_DELAY`
- `APPOINTMENT_BREACH_RISK`
- `LANE_RATE_EXCEPTION`
- `LOAD_BOARD_BID_OPPORTUNITY`
- `BROKER_MARGIN_RISK`
- `CARRIER_CREDIT_RISK`
- `CUSTOMER_DELIVERY_COMMITMENT_RISK`
- `MARKET_RATE_VOLATILITY`

Recommended routing:

- `MERIDIAN`: rate, margin, capacity, operational feasibility
- `SENTINEL`: fraud, broker/carrier risk, suspicious bid patterns, compliance exposure
- `ETHOS`: customer promise, fairness, human-impacting service commitments
- `ARCHITECT`: integration failure, provider outage, data inconsistency, automation boundary issues

## Marengo Integration

SIL should enrich Marengo forecasts with:

- `shipping_time_days`
- `average_transit_days`
- `transit_variance_days`
- `on_time_rate`
- `carrier_falloff_rate`
- `tender_acceptance_rate`
- `exception_count`
- lane-specific performance context
- customer/SKU shipment reliability

Marengo remains the forecasting engine. SIL supplies shipment reality.

## First Implementation Sequence

1. Add SIL domain contracts and event taxonomy.
2. Add a transportation planning API surface for loads, lanes, postings, bids, and carrier profiles.
3. Seed mock operational records that mirror real planner workflows.
4. Add SIL dashboard views for:
   - active loads
   - load board opportunities
   - lane/rate intelligence
   - broker/carrier risk
   - Encompax governance escalations
5. Wire SIL signals to Encompax Platform Overview.
6. Wire SIL timing/performance summaries to Marengo forecast parameters.

## Guardrails

- Do not copy implementation code from reference repos.
- Use reference repos only for product patterns and domain vocabulary.
- Keep matching/scoring logic explainable.
- Treat paid carrier APIs and load board posting as integration adapters.
- Keep customer/employer data out of the repo.
- Use mock data until authentication, tenant isolation, and persistence are stabilized.
