# Shipment Intelligence Layer Repo Scope

Audit date: 2026-05-23

## What Belongs In This Repo

- Shipment Intelligence Layer product code
- Transportation command workflows
- Shipment visibility, tracking, carrier quote, and carrier review services
- Load-board posting, bid scoring, matching, and market-rate analytics
- Inventory-adjacent planning views that support shipment and transportation decisions
- LEAN operating-system templates that help teams standardize work before deeper analytics are needed
- Encompax-ready operational signals, evidence packets, and governance routing context
- Deployment assets for the SIL module

## What Does Not Belong In This Repo

- Encompax Core council execution logic or final governance authority
- Marengo statistical analytics that belong in the Marengo product
- Kardia quality management workflows unless represented as external integration signals
- Unmodified reference-repo source copied wholesale from other systems
- Company-private data, customer secrets, carrier credentials, or production API keys

## Relationship To Encompax Core

SIL is a governed operating module. It should prepare operational facts, risk indicators, evidence, and recommended actions for Encompax Core.

Encompax Core remains the parent governance/control plane. SIL should call or emit to Encompax rather than duplicating council-seat authority inside this repo.

## Relationship To Marengo

SIL is the practical logistics and execution layer. Marengo is the deeper analytics and forecasting layer.

SIL can provide shipment, lane, rate, carrier, inventory, and operating-standard signals to Marengo. Marengo can return forecast or statistical insight that SIL displays or routes into Encompax.

## Reference Repo Policy

Other folders under `D:\projects\reference-repos` are reference material. They can inform SIL architecture and workflow design, but productized functionality must live in this repo.

## Intended Primary Working Branch

Recommended canonical branch:

`main`

Recommended safety branch before replacing any remote:

`staging/sil-canonical-2026-05`
