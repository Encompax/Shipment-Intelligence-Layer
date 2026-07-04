# SIL Persistence Readiness

SIL currently supports a staged persistence model:

- local Prisma/SQLite for development and demo workflow records
- Firestore mirroring for governance signals and workflow events
- planned Firestore-first workspace persistence for customer use
- optional Cloud SQL/Postgres later for high-volume relational logistics records

## Readiness Endpoint

```text
GET /api/shipment-intelligence/persistence/readiness
```

The endpoint reports the active workspace, current runtime store, Firestore mirror status, record counts, and blockers that prevent real customer data from being used safely.

## Customer Data Boundary

SQLite is acceptable for local demos and smoke testing, but it is not a durable customer system of record. Before real customer data is used, SIL should enforce:

- authenticated users
- tenant/workspace ownership
- Firestore or managed database persistence
- governed import jobs with error correction records
- audit history for overrides, dispatch decisions, documents, and agent review activity
- Secret Manager storage for provider credentials

## Recommended Path

Use Firestore first for the objects that need fast product progress and clean tenant isolation:

- workspaces
- selected products and modules
- governance signals
- workflow events
- import jobs
- mapping profiles
- document metadata
- agent readiness and review metadata

Keep Cloud SQL/Postgres as the later option for dense operational workloads such as shipment history, lane analytics, commercial pricing, and high-volume carrier performance reporting.
