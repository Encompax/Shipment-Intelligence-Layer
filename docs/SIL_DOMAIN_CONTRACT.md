# SIL Domain Contract

Date: 2026-05-22

## Purpose

This document defines the first stable vocabulary for expanding SIL from shipment visibility into freight planning, brokerage, load board workflow, and transportation management.

The contract is intentionally implementation-neutral. Backend models, APIs, and UI widgets should use this vocabulary so future Karrio, TMS, carrier, load board, Marengo, and Encompax integrations can connect cleanly.

## Primary Entities

### Load

A commercial freight movement opportunity or obligation.

Fields:

- `loadId`
- `customerId`
- `customerName`
- `origin`
- `destination`
- `pickupWindowStart`
- `pickupWindowEnd`
- `deliveryWindowStart`
- `deliveryWindowEnd`
- `equipmentType`
- `mode`
- `weight`
- `handlingRequirements`
- `hazmat`
- `temperatureControlled`
- `status`
- `targetSellRate`
- `targetBuyRate`
- `marginTarget`
- `source`

### Shipment

An executed or executing physical movement tied to a load, order, or fulfillment record.

Fields:

- `shipmentId`
- `loadId`
- `orderId`
- `carrierId`
- `carrierName`
- `serviceLevel`
- `trackingNumber`
- `state`
- `stops`
- `documents`
- `cost`
- `estimatedDelivery`
- `actualDelivery`
- `exception`
- `source`

### Stop

A pickup, delivery, crossdock, terminal, or appointment point.

Fields:

- `stopId`
- `shipmentId`
- `sequence`
- `type`
- `facilityName`
- `address`
- `city`
- `state`
- `postalCode`
- `appointmentStart`
- `appointmentEnd`
- `arrivedAt`
- `loadedUnloadedAt`
- `departedAt`
- `status`

### Lane

A recurring origin/destination pattern used for planning and market analytics.

Fields:

- `laneId`
- `originRegion`
- `destinationRegion`
- `mode`
- `equipmentType`
- `averageTransitDays`
- `transitVarianceDays`
- `onTimeRate`
- `marketRateLow`
- `marketRateMedian`
- `marketRateHigh`
- `lastUpdatedAt`

### Carrier Profile

Operational and commercial carrier identity used for scoring and awarding.

Fields:

- `carrierId`
- `carrierName`
- `mcNumber`
- `dotNumber`
- `insuranceStatus`
- `safetyStatus`
- `creditStatus`
- `serviceScore`
- `falloffRate`
- `onTimeRate`
- `laneHistory`
- `blocked`
- `preferred`

### Load Posting

An internal or external publication of a load opportunity.

Fields:

- `postingId`
- `loadId`
- `board`
- `postedRate`
- `visibility`
- `status`
- `postedAt`
- `expiresAt`
- `bidCount`
- `bestBidRate`
- `bestCarrierId`

### Bid

A carrier or broker response to a load posting.

Fields:

- `bidId`
- `postingId`
- `loadId`
- `carrierId`
- `bidRate`
- `currency`
- `estimatedPickupCommitment`
- `estimatedDeliveryCommitment`
- `message`
- `status`
- `receivedAt`
- `score`

### Market Rate Observation

Rate intelligence for a lane or comparable movement.

Fields:

- `observationId`
- `laneId`
- `source`
- `rate`
- `rateType`
- `mode`
- `equipmentType`
- `observedAt`
- `confidence`

## State Machines

### Shipment State

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

### Load Brokerage State

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

### Bid State

- `RECEIVED`
- `SHORTLISTED`
- `REJECTED`
- `AWARDED`
- `WITHDRAWN`
- `EXPIRED`

## Matching Inputs

The first explainable matching score should consider:

- lane fit
- equipment fit
- pickup timing fit
- delivery timing fit
- rate fit
- service reliability
- carrier falloff risk
- insurance/safety/credit status
- prior customer or lane history

The matching engine should return:

- `score`
- `scoreBand`
- `recommendedAction`
- `evidence`
- `governanceSignalRequired`

## Encompax Signal Shape

SIL should use the existing Encompax Platform Overview intake contract.

Required fields:

- `sourceModule`: `SHIPMENT_INTELLIGENCE_LAYER`
- `signalId`
- `signalType`
- `severity`
- `confidenceScore`
- `businessDomains`
- `description`
- `affectedEntities`
- `metrics`
- `recommendedActions`
- `tags`
- `rawPayloadRef`

Common affected entities:

- `loads`
- `shipments`
- `customers`
- `carriers`
- `lanes`
- `postings`
- `bids`

## First Governance Signal Types

| Signal Type | Trigger | Likely Seat |
| --- | --- | --- |
| `LOAD_AT_RISK` | Shipment/load may miss pickup, delivery, or service commitment. | MERIDIAN |
| `CARRIER_FALLOFF_RISK` | Carrier likely to reject, fail, or bounce. | SENTINEL |
| `TENDER_RESPONSE_DELAY` | Tender has not been accepted inside policy window. | MERIDIAN |
| `APPOINTMENT_BREACH_RISK` | Pickup/delivery appointment risk is elevated. | MERIDIAN |
| `LANE_RATE_EXCEPTION` | Buy/sell rate is outside expected lane band. | MERIDIAN |
| `LOAD_BOARD_BID_OPPORTUNITY` | Bid may be favorable but needs governed review. | MERIDIAN |
| `BROKER_MARGIN_RISK` | Margin is low, negative, or volatile. | MERIDIAN |
| `CARRIER_CREDIT_RISK` | Carrier credit/trust profile requires review. | SENTINEL |
| `CUSTOMER_DELIVERY_COMMITMENT_RISK` | Customer-facing commitment may be unreliable. | ETHOS |
| `MARKET_RATE_VOLATILITY` | Lane market movement changes planning assumption. | ARCHITECT |

## Marengo Forecast Enrichment Output

SIL can feed Marengo forecast parameters using:

- `customer_id`
- `sku`
- `shipping_time_days`
- `lead_time_days`
- `cycle_time_days`
- `source`: `shipment_intelligence_layer`

Additional context should remain in SIL:

- lane
- carrier
- tender acceptance
- falloff
- rate variance
- exception history

Marengo consumes summarized timing and reliability, while Encompax consumes governed decision signals.
