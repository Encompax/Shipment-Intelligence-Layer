# SIL Intake Release: 2026-09-15

## Deployment

- Project: `encompax-prod`, region: `us-central1`.
- Service: `encompax-sil-api`.
- Candidate revision: `encompax-sil-api-00021-zaq`.
- Durable verification / production revision: `encompax-sil-api-00022-sop`.
- Image digest: `sha256:7d7db336f3a2fda046c96e634594f3f2af8c35b21d2e837348a92c7be895d6cf`.
- Build: `100015af-8942-4bd9-a775-408d19115420`.
- Runtime: `encompax-sil-runtime@encompax-prod.iam.gserviceaccount.com`.
- Upload bucket: `encompax-prod-sil-intake`, `US-CENTRAL1`, uniform access and
  public access prevention enforced.
- Authoritative Firestore rules deployed from Encompax-core. No Hosting rebuild
  or Encompax-core API/PostgreSQL deployment was performed.

The owner confirmed all earlier SIL data was disposable mock data. No backfill
or export of instance-local mock records was required. New intake is stored in
Firestore and private Cloud Storage, not the Cloud Run instance filesystem.

## Verification

- 21 backend tests passed, including canonical membership and storage failures.
- 53 Firestore rules tests passed, including normal signup/profile edits and
  blocked identity/access escalation through overlapping rules.
- Six deployment preflight tests passed without contacting cloud services.
- Two synthetic organizations uploaded CSV originals and imported loads,
  carriers, lanes, and market rates. Cross-organization references were denied.
- 21 live checks passed on the candidate revision, then again on a second
  revision of the same image, and again through the production service URL.
- Saved source/upload IDs, SHA-256 values, previews, queue receipts, and imported
  records survived revision replacement. Sequential duplicate load import skipped.
- Runtime custom-token signing and single-use launch code redemption passed.
- Public Hosting API health returned 200; unauthenticated intake returned 401.
- Synthetic Auth accounts, profiles, launch codes, tenant records, and upload
  objects were removed after verification. The bucket's default soft-delete
  policy may retain recoverable object versions temporarily.
- No error-severity logs were found for the tested candidate in the inspected
  one-hour window. This is a bounded smoke test, not a long-running soak.

The first seed attempt completed intake/import assertions but stopped on a test
harness expecting 200 instead of the launch endpoint's correct 201 response.
The harness was corrected; subsequent full verification runs passed. Credentials
were kept in process memory/environment, not written into evidence files.

## Pilot Follow-ups

- Brian's employee classification is correct, but his profile's SIL access was
  still `pending` at release. Grant access through trusted administration with
  matching canonical organization entitlement and membership before his SIL pilot.
- Existing active non-synthetic SIL profile eligibility passed the canonical
  organization/member checks. No real account permissions were changed here.
- Invite/claim onboarding supports the customer path. Employee client assignments
  do not yet enable cross-client SIL tenant switching.
- Keep the pilot at intake, mapping, and review. Postings, bids, shipments,
  appointments, and LEAN records still need durable storage work.
- Update transitive `qs` from 6.15.3 to a patched release in a focused dependency
  change. Production audit found one moderate vulnerable package, no high/critical
  packages; no exposed trigger was identified in the current JSON/multipart and
  simple-query-parser configuration.

Deployment used the reviewed local working tree before the coordinated SIL and
Encompax-core release commits. The image digest above identifies the deployed
build independently of those commits.
