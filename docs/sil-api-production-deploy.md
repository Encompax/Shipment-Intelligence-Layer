# SIL API Production Deploy

SIL frontend hosting and SIL backend API should deploy separately:

- Frontend: Firebase Hosting site `encompax-sil`, custom domain `sil.encompax.io`.
- Backend API: Cloud Run service such as `encompax-sil-api`.
- Frontend API base: `VITE_API_BASE_URL=https://api.encompax.io/api` once the API gateway exists, or the Cloud Run service URL during early smoke testing.

## Current Boundary

The backend keeps Prisma/SQLite available for local demos and staged operational tables. Customer-facing records now have a Firestore-first path when `SIL_FIRESTORE_PRIMARY_ENABLED=true`: workspace profile, selected products, governance signals, workflow events, and shipment document metadata. Dense operational logistics history can still move to Cloud SQL/Postgres later when reporting and joins demand it.

## Backend Deploy

Requires Google Cloud SDK on PATH:

```powershell
.\scripts\deploy-sil-api-cloudrun.ps1
```

Useful environment values:

```text
ALLOWED_ORIGINS=https://sil.encompax.io,http://localhost:5173
ENCOMPAX_API_BASE_URL=https://api.encompax.io/api
SIL_FIRESTORE_ENABLED=true
SIL_FIRESTORE_PRIMARY_ENABLED=true
SIL_FIRESTORE_PROJECT_ID=encompax-prod
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
