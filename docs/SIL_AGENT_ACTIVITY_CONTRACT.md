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
