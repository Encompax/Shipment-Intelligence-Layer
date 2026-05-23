# Encompax-core Deployment Readiness

Audit date: 2026-03-20

## Is This Repo Currently Deployable?

Not yet as a release branch, but the stabilization baseline is healthier than the original detached state.

Evidence:

- `main` is only a minimal scaffold and does not contain the later deployment assets.
- Backend TypeScript build now succeeds on `stabilization-encompax-2026-03`.
- Frontend build still could not be fully verified here because Vite/esbuild hit sandbox process restrictions.
- Firebase hosting configuration remains incomplete in the checked-out repo state:
  - [infra/firebase.json](/c:/Users/CR856/Documents/Encompax-core/infra/firebase.json) is empty
  - no `.firebaserc` detected

## What Branch Appears Most Deployable?

Most deploy-oriented branch:

- `origin/claude/evaluate-repo-integration-Yk9Ge`

Why:

- contains `.github/workflows/deploy.yml`
- contains `docker-compose.yml`
- contains backend/frontend/SIL Dockerfiles
- contains nginx config with `encompax.io` and `www.encompax.io`

Important caution:

- that workflow deploys on push to `main`, but `main` does not currently reflect the same deployment stack
- this means the branch shows deployment intent, but the release branch strategy is not yet aligned

## Likely Public Directory / Build Output

- Frontend likely expects Vite output from `frontend/dist`
- Backend expects compiled TypeScript output in `backend/dist`
- Docker/nginx branch suggests the frontend would be containerized and served behind nginx rather than Firebase hosting

## Firebase Config Review

- [infra/firebase.json](/c:/Users/CR856/Documents/Encompax-core/infra/firebase.json): present but empty
- [infra/firestore.rules](/c:/Users/CR856/Documents/Encompax-core/infra/firestore.rules): present
- `.firebaserc`: not found

Assessment:

- Firebase config looks incomplete or stale
- Firebase does not currently look like the primary deployment path for the latest branch direction

## Domain Consistency Review

- `encompax.io` and `www.encompax.io` are referenced consistently in the nginx config on `origin/claude/evaluate-repo-integration-Yk9Ge`
- No staging domain was clearly detected
- No `smiley-zone` domains were detected in this repo audit

## What Is Needed Before Deployment

1. Compare and integrate the needed deploy stack into the stabilization branch
2. Re-run frontend build verification in an environment where esbuild can spawn normally
3. Decide whether deployment is Docker/nginx-based, Firebase-based, or intentionally both
4. Align deploy workflow trigger branch with the actual release branch
5. Confirm environment variable contract and secrets needed for backend, SIL, nginx, and frontend
