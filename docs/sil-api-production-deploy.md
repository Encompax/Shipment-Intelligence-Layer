# SIL API Production Deploy

SIL frontend hosting and SIL backend API should deploy separately:

- Frontend: Firebase Hosting site `encompax-sil`, custom domain `sil.encompax.io`.
- Backend API: Cloud Run service such as `encompax-sil-api`.
- Frontend API base: `VITE_API_BASE_URL=https://api.encompax.io/api` once the API gateway exists, or the Cloud Run service URL during early smoke testing.

## Current Boundary

The backend keeps Prisma/SQLite for local development and the remaining operational tables. Firestore-primary mode now includes intake profiles, upload metadata, queued requests, loads, carriers, lanes, and market rates in addition to workspace, governance, workflow, and document metadata. Original intake files require private Cloud Storage. Postings, bids, shipments, appointments, and LEAN records are not yet durable. Follow [the durable intake rollout](SIL_DURABLE_INTAKE.md) before real customer uploads.

## Backend Deploy

Requires Google Cloud SDK on PATH:

```powershell
.\scripts\deploy-sil-api-cloudrun.ps1 -UploadBucket "YOUR-PRIVATE-INTAKE-BUCKET"
```

Useful environment values:

```text
ALLOWED_ORIGINS=https://sil.encompax.io,http://localhost:5173
ENCOMPAX_API_BASE_URL=https://api.encompax.io/api
SIL_FIRESTORE_ENABLED=true
SIL_FIRESTORE_PRIMARY_ENABLED=true
SIL_FIRESTORE_PROJECT_ID=encompax-prod
SIL_UPLOAD_BUCKET=YOUR-PRIVATE-INTAKE-BUCKET
```

## Frontend Build

For production:

```powershell
cd frontend
$env:VITE_API_BASE_URL="https://api.encompax.io/api"
npm run build
```

Then deploy only the SIL hosting target:

```powershell
firebase deploy --only hosting:sil
```

Do not deploy this repository's legacy Firestore rules to the shared project.
Encompax-core owns the production rules. No rule change is required for these
API-only nested intake collections. Ordinary account creation and uploads do not
require a hosting deploy or API revision. Code changes do.

If Firebase CLI is not on PATH, use the known local Firebase CLI cache path already used for Encompax deploys.

## Operator Exports

Transportation Command now supports browser-generated print packets:

- Bill of Lading
- Shipment Manifest
- Dispatch Packet

Future export candidates:

- Rate confirmation
- Carrier tender packet
- Proof-of-delivery evidence packet
- Exception/governance audit record
- CSV exports for loads, bids, carrier scorecards, and lane rates
