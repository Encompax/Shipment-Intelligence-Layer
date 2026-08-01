# SIL Agent Activity Contract

SIL can prepare evidence for agent review, but it does not own final governance authority. Encompax Core remains the system of record for seat routing, council decisions, human overrides, and audit permanence.

## Provider Readiness

The SIL backend exposes a read-only readiness endpoint:

```text
GET /api/shipment-intelligence/agent-activity/readiness
```

The endpoint reports whether provider credentials appear configured on the backend and whether the current workspace has enabled the provider. It never returns API keys or secrets.

Supported staged providers:

- `MANUAL`
- `OPENAI`
- `ANTHROPIC`
- `HUGGINGFACE`
- `GEMINI`

## Execution Boundary

Default execution mode is `DRY_RUN`. Live provider calls should remain disabled until:

- provider keys are stored in backend environment variables or Secret Manager
- per-review token and cost ceilings are configured
- the workspace has explicitly enabled the provider
- Encompax seat contracts are active
- audit capture includes provider, model reference, confidence, evidence, usage, and override reason

## Evidence Packets

SIL prepares operational packets for:

- load-board bid review
- dispatch readiness
- shipment exceptions
- document packets
- inbound receiving
- market-rate review

Those packets can be routed to Encompax Core for governed review before execution.

## Support Agent Transport

The current support agent is a deterministic `MANUAL` advisory implementation. It proves the interaction contract without calling an external model:

```text
GET  /api/shipment-intelligence/agent/contract
GET  /api/shipment-intelligence/loads/:loadId/agent/explanation
POST /api/shipment-intelligence/loads/:loadId/agent/proposals
GET  /api/shipment-intelligence/agent/governance-decisions
POST /api/shipment-intelligence/loads/:loadId/agent/execute
```

All production requests require a verified Firebase bearer token. The backend reloads the Encompax profile, requires active SIL access, and derives the workspace from `orgScope`; browser-supplied workspace identifiers cannot change tenant scope.

A proposal validates the load state transition, stores its evidence envelope, and publishes it to Platform Overview with `X-Encompax-Module: sil`. Execution requires a matching load, proposed state, and central `EXECUTE_ALLOWED` disposition. The local proposal is then marked `EXECUTED` to prevent replay. Conditional, missing, rejected, or unavailable decisions remain held.

## Operator Surfaces

The web workspace exposes this contract through a compact assistant attached to the selected load. It can explain the current state, prepare a transition proposal, show the latest governance disposition, and execute only after approval. The UI does not receive provider credentials or decide whether execution is permitted.

A future mobile client should reuse the same authenticated endpoints and evidence envelope rather than introducing a separate agent or governance path. Device-specific capabilities may change presentation and notifications, but identity, organization scope, proposals, decisions, and execution authorization remain server-owned.
