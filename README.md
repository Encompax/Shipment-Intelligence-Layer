# Shipment Intelligence Layer

Shipment Intelligence Layer (SIL) is the supply-chain and physical-movement operations module inside the Encompax family, operating under Encompax Core governance. It provides transportation command, shipment visibility, carrier review, load-board intelligence, market-rate pressure checks, inventory-adjacent planning, and LEAN operating tools for teams that need a practical starting point before adopting deeper Marengo analytics or additional Encompax modules.

This repo contains the shipping intelligence stack as a standalone platform ecosystem.

## What's Inside

- `frontend`: Vite + React operator UI with transportation command, shipment intelligence, inventory, LEAN operating tools, and governance-linked panels.
- `backend`: Core API services, shipment intelligence domain logic, load matching, carrier quote adapters, market-rate analysis, workflow events, and Encompax-ready governance signal drafts.
- `docs`: Product, architecture, integration, and deployment notes for SIL.
- `infra`: Firebase configuration and deployment support assets.
- `INTEGRATION_ROADMAP.md`: Integration roadmap and governance-aligned connector strategy.

## Source Of Truth

This folder is the canonical local source for SIL:

`D:\projects\reference-repos\Shipment-Intelligence-Layer`

Other folders under `D:\projects\reference-repos` are reference material only. They can inspire structure and workflows, but product code for SIL should be added here.
