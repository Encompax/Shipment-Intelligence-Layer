# SIL Intake Ownership Migration

The `20260914120000_scope_sil_intake` migration adds nullable `orgScope` columns to
`Datasource` and `Job`, plus the exact string `Job.dataSourceRef`. The existing
numeric `dataSourceId` remains for compatibility and is never used as proof of
ownership. Upload ownership comes from its parent job.

Apply this migration before starting the updated API, and regenerate Prisma Client
when building it. Intake and job routes now require a verified SIL authentication
context even during local development. An organization ID in a URL, body, or
custom header does not grant access.

## Existing Records

No existing row is deleted or automatically assigned. Existing sources, jobs, and
uploads with no verified owner are hidden from all customer intake endpoints,
including direct preview/import requests by ID. This intentionally fails closed.

Do not assign all historical rows to the first signed-in organization or infer
ownership from a filename, source name, numeric hash, or customer name. An operator
must establish provenance independently before assigning a source and its jobs to
the same organization, filling `dataSourceRef` with the verified source ID. Keep
ambiguous records unowned. Prior imports in the shared default workspace also need
an explicit provenance review; this migration does not move them.

## Import Behavior

New uploads validate source ownership before storing a file. Lists, previews, and
imports filter by the authenticated organization. Foreign and unowned IDs return
the same 404 response as missing IDs. Load duplicate detection is scoped to that
organization. Imported loads, carriers, lanes, and market rates carry its workspace
ID; carrier and lane import IDs include organization identity to avoid cross-client
name/route collisions.

## Remaining Limits

In Firestore-primary mode, intake sources, upload receipts, queued job requests,
loads, carriers, lanes, and market-rate observations now use organization-scoped
Firestore collections. Original file bytes use the private `SIL_UPLOAD_BUCKET`.
See [durable intake rollout](SIL_DURABLE_INTAKE.md) before deploying this mode.
Existing local records are not automatically copied or reassigned.

Local development still uses SQLite/file uploads and an in-memory job placeholder.
The cloud job queue persists requests but does not run a connector worker.
Postings, bids, shipments, appointments, and LEAN records remain instance-local.

The broader SIL domain endpoints have separate authorization and persistence
responsibilities. This patch does not certify all of SIL for customer production.
