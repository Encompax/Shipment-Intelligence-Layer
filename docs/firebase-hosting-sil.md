# SIL Firebase Hosting

SIL should deploy as its own Firebase Hosting site so `sil.encompax.io` can serve the Shipment Intelligence Layer application without replacing the public Encompax landing page.

## Target Architecture

- Public brand: `encompax.com`, `www.encompax.com`
- Platform namespace: `encompax.io`
- SIL app: `sil.encompax.io`
- SIL frontend Hosting site: `encompax-sil`
- SIL frontend build output: `frontend/dist`
- SIL backend/API: Cloud Run or another hosted API service, not Firebase Hosting static files

## One-Time Firebase Setup

Run these from the SIL repo root:

```powershell
firebase hosting:sites:create encompax-sil --project encompax-prod
firebase target:apply hosting sil encompax-sil --project encompax-prod
```

Then in Firebase Hosting, attach `sil.encompax.io` to the `encompax-sil` site, not the public `encompax-prod` landing-page site.

If `sil.encompax.io` was first added under the public site, remove it there after the new SIL site exists, then add it to the SIL site.

## Deploy

```powershell
cd D:\projects\reference-repos\Shipment-Intelligence-Layer\frontend
npm run build

cd D:\projects\reference-repos\Shipment-Intelligence-Layer
firebase deploy --only hosting:sil --project encompax-prod
```

## Runtime Boundary

Firebase Hosting only serves the SIL frontend. The SIL backend still needs a hosted API URL before production use.

For local development, the frontend can proxy to:

```text
http://localhost:3001
```

For production, the frontend should call a hosted SIL API such as:

```text
https://api.encompax.io
```

or a module-specific API route:

```text
https://api.encompax.io/sil
```

