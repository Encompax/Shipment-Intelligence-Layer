# Durable SIL Intake

## Storage Boundary

With `SIL_FIRESTORE_PRIMARY_ENABLED=true`, the authenticated organization's
`silWorkspaces/{orgScope}` subcollections store `intakeSources`, `intakeUploads`,
`intakeJobs`, `loads`, `carriers`, `lanes`, and `marketRates`. No client-supplied
organization selects the storage destination. Cloud reads and writes never fall
back to the instance's SQLite database. Empty collections stay empty.

Original CSV/XLSX/XLS bytes are written to `SIL_UPLOAD_BUCKET` with unique object
names under a hashed organization prefix and a create-only generation precondition.
Receipts retain SHA-256, object generation, uploader identity, exact source ID, and
creation time. Preview/import fetch that generation and verify the hash. API
responses omit storage paths and generations; there are no public download URLs.
Load/carrier changes and their creation/update events are committed in one batch.

An upload receipt marked `Completed` means file storage completed, not that mapping
or an import completed. `/api/jobs` stores queued requests, but no background
connector worker exists yet. No Google/Microsoft data sync is activated here.

## Rollout Gate

1. Choose a private bucket in the approved project/location. Enforce uniform
   bucket-level access and public access prevention. Do not use a public asset
   bucket or grant `allUsers` / `allAuthenticatedUsers` access.
2. Grant the SIL Cloud Run runtime service account bucket-scoped
   `roles/storage.objectCreator` and `roles/storage.objectViewer`, plus its existing
   Firestore and Firebase Auth access. The application does not need bucket-admin,
   object-overwrite, or object-delete access. Check effective inherited IAM too.
3. Keep the authoritative Encompax-core Firestore rules in place. Nested SIL
   collections are API-only; do not deploy SIL's older rules to the shared project.
4. Run `npm.cmd test` in `backend` and `scripts/test-sil-deploy-preflight.ps1`
   from the SIL repository. The latter shadows gcloud and never contacts Google.
   Deploy from the SIL repository with
   `scripts/deploy-sil-api-cloudrun.ps1 -UploadBucket "YOUR-PRIVATE-INTAKE-BUCKET"`.
   The script checks bucket privacy and stops on native-command failures. It
   updates named environment values without clearing unrelated values/secrets.
   Use `-NoTraffic -Tag intake-candidate` to stage a revision first. The default
   dedicated runtime is `encompax-sil-runtime@encompax-prod.iam.gserviceaccount.com`;
   set `-ServiceAccount` explicitly when using another project.
   The existing Docker startup applies the SQLite ownership migration for local
   staging tables. Firestore collections do not need a SQL migration. This does
   not alter Encompax-core's PostgreSQL database.
5. With synthetic, authorized test organizations, create one source and upload a
   small CSV. Capture source/upload IDs, hash, and imported record IDs. Verify
   preview, mapping, load/carrier/lane import, and queue receipt retrieval.
6. Deploy a second revision of the same code, then retrieve those same records
   and preview/import the original upload. Verify records in the second
   organization remain inaccessible. Confirm the empty organization has no demo
   records and the runtime logs show no storage/permission failures.
7. Only after that cloud smoke test should the controlled intake pilot accept
   authorized customer files. Use files below 25 MiB for the pilot; the API's
   local 50 MiB cap does not override hosting/proxy request limits.

No deployment is needed after each onboarding, upload, import, or service assignment.
Deploy only changed code/configuration, and migrate when a schema changes. This
increment needs an SIL API deployment, not a homepage or employee-console rebuild.

## Authorization and Live Verification

SIL verifies Firebase tokens with revocation checking. Active profile access alone
is insufficient: the canonical organization must be active with an active SIL
entitlement, and its canonical member must be active, match the authenticated UID,
and include `sil` in `moduleKeys`. Employee client assignments do not yet switch
the SIL tenant; requests use the profile's home organization.

Encompax-core's Firestore rules protect profile identity/access fields and exclude
protected collections from the generic owner rule. Matching allows are additive;
an overlapping generic allow must never override the protected collection rules.

`scripts/verify-sil-durable-intake.cjs` supports `audit`, `seed`, `verify`, and
`cleanup` phases. Supply the tagged Cloud Run URL, an external artifact state file,
and a short-lived `GOOGLE_OAUTH_ACCESS_TOKEN` environment variable. It is explicitly
scoped to `encompax-prod` and `encompax-prod-sil-intake`. The seed phase creates
synthetic identities and two isolated organizations; verification uses only their
records. No credentials are written to the state file. Run `verify` against the
second revision, then `cleanup` even after a test failure. Cleanup removes only
validated synthetic identities, launch codes, tenant documents, and upload objects.
The audit phase reads access eligibility without changing real accounts.

## Existing Data and Failure Recovery

No old SQLite records or files are automatically migrated into Firestore/Storage.
Export known-owned records and originals from the old revision before retiring it;
review provenance before any backfill. Ambiguous or unowned records stay hidden.
Do not turn primary mode off as a rollback strategy for new customer records.

Objects are saved before their receipt. If metadata acknowledgement fails, the API
returns an error, not success. An unreferenced private object can remain. Operators
must reconcile aged objects against receipts before cleanup; never delete an object
solely because the client did not receive a response. No automatic retention or
garbage-collection policy is enabled by this change.

## Remaining Work

This is intake durability, not end-to-end logistics certification. Postings, bids,
shipments, appointments, and LEAN records still use local SQLite. Import mapping
history and resumable/idempotent concurrent import runs need a further increment.
Load duplicate detection covers sequential retries, not simultaneous requests.
Lane and rate writes are separate; a failed rate write can leave its lane saved.
Keep the first pilot at intake/mapping/review until the downstream records and
authorization boundaries are verified.

The isolated tests use Firestore/Storage SDK fixtures, two API server instances,
and synthetic organizations. They do not prove production IAM, TLS, proxy limits,
real Cloud Storage connectivity, or actual Cloud Run revision survival.

References: [Cloud Run filesystem lifecycle](https://cloud.google.com/run/docs/container-contract#file_system),
[Cloud Storage uploads](https://cloud.google.com/storage/docs/uploading-objects-from-memory),
[Storage IAM roles](https://cloud.google.com/storage/docs/access-control/iam-roles).
