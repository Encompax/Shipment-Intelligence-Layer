# Shipment Intelligence Layer Source Of Truth

Canonical local product folder:

`D:\projects\reference-repos\Shipment-Intelligence-Layer`

## Boundary

This folder is the one true source for Shipment Intelligence Layer product code, documentation, and deployment preparation.

Folders beside it under `D:\projects\reference-repos` are reference repositories or supporting material only. They may be inspected for patterns, architecture, or workflow inspiration, but they should not become runtime dependencies unless code is intentionally copied, adapted, reviewed, and committed into this SIL folder.

## Product Role

SIL is an Encompax-governed logistics and operations module. Its near-term focus is:

- Transportation command
- Shipment intelligence
- Load board and bid review
- Carrier selection and credit-risk visibility
- Market-rate and lane-pressure analytics
- Inventory-adjacent planning visibility
- LEAN operating tools and brandable operating-system templates
- Encompax governance signal generation

## Governance Boundary

SIL should generate structured operational signals and evidence packets that can route into Encompax Core. Encompax Core remains the parent governance/control plane.

SIL should not duplicate Encompax council logic, agent-seat execution, or final governance authority. It should prepare clean operational context, recommended actions, and evidence.

## Reference Material

Reference folders currently include logistics, TMS, WMS, Karrio, Fleetbase, load-board, and LEAN operations material. Their purpose is inspiration and gap analysis only.

When reference material is promoted into SIL, record the productized capability in this repo and keep the implementation aligned with SIL naming, data contracts, and Encompax governance flow.

## GitHub Replacement Plan

This local folder can replace the existing GitHub repository once the correct remote URL and target branch are confirmed.

Recommended sequence:

1. Initialize local git in this folder.
2. Commit the current canonical SIL state.
3. Add the correct GitHub remote.
4. Push to a staging branch first when possible.
5. Force-replace the live branch only after confirming the target repository and branch.
