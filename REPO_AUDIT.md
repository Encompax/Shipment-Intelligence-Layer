# Encompax-core Repo Audit

Audit date: 2026-03-20

## Repo Purpose

Evidence-based purpose:

- Root [README.md](/c:/Users/CR856/Documents/Encompax-core/README.md) describes the repo as an "End to end ERP Modular SaaS system for supply chain optimization, analytics, and AI-integrated business operations."
- The checked-in structure separates a React/Vite frontend, an Express/TypeScript backend, Prisma schema/migrations, and infra placeholders.
- Branch history shows an additional control-plane/governance direction on `origin/claude/evaluate-repo-integration-Yk9Ge`, including admin routes, a Control Plane UI, and deploy assets for `encompax.io`.

Current grounded conclusion:

- `Encompax-core` is functioning as the parent ERP/control-plane repo.
- The currently visible implementation is strongly weighted toward supply-chain, shipment intelligence, inventory, and admin/control-plane capabilities.
- This repo aligns with the stated Encompax governance/control-layer intent more than with public arcade or social/game logic.

## Current Workspace State

- Repo root: `C:\Users\CR856\Documents\Encompax-core`
- Current branch: `stabilization-encompax-2026-03`
- Baseline tracking branch: `origin/dev`
- Detached work preserved on `recovery/encompax-detached-2026-03`
- Remote branches detected: `origin/main`, `origin/dev`, `origin/feature/shipment-intelligence`, `origin/claude/evaluate-repo-integration-Yk9Ge`, `origin/claude/continue-pdf-markdown-wGm4C`

## Top-Level Structure

- `backend/`
- `frontend/`
- `infra/`
- `.env.example`
- `docker-compse.yml`
- `README.md`

Framework/deploy indicators found:

- Frontend: React 18 + Vite in [frontend/package.json](/c:/Users/CR856/Documents/Encompax-core/frontend/package.json)
- Backend: Express + TypeScript + Prisma + SQLite in [backend/package.json](/c:/Users/CR856/Documents/Encompax-core/backend/package.json) and [backend/prisma/schema.prisma](/c:/Users/CR856/Documents/Encompax-core/backend/prisma/schema.prisma)
- Infra placeholder: [infra/firebase.json](/c:/Users/CR856/Documents/Encompax-core/infra/firebase.json) exists but is empty
- No `.firebaserc` found under `infra/`
- Deploy stack files for `encompax.io` exist only on `origin/claude/evaluate-repo-integration-Yk9Ge`

## Important Config Files Found

- [README.md](/c:/Users/CR856/Documents/Encompax-core/README.md)
- [frontend/package.json](/c:/Users/CR856/Documents/Encompax-core/frontend/package.json)
- [frontend/vite.config.ts](/c:/Users/CR856/Documents/Encompax-core/frontend/vite.config.ts)
- [backend/package.json](/c:/Users/CR856/Documents/Encompax-core/backend/package.json)
- [backend/prisma/schema.prisma](/c:/Users/CR856/Documents/Encompax-core/backend/prisma/schema.prisma)
- [backend/.env.example](/c:/Users/CR856/Documents/Encompax-core/backend/.env.example)
- [infra/firebase.json](/c:/Users/CR856/Documents/Encompax-core/infra/firebase.json)
- [infra/firestore.rules](/c:/Users/CR856/Documents/Encompax-core/infra/firestore.rules)

Branch-only deploy config discovered via `git show`:

- `.github/workflows/deploy.yml` on `origin/claude/evaluate-repo-integration-Yk9Ge`
- `docker-compose.yml` on `origin/claude/evaluate-repo-integration-Yk9Ge`
- `nginx/nginx.conf` on `origin/claude/evaluate-repo-integration-Yk9Ge`

## Branch Inventory

| Branch | Last Updated | Evidence-Based Role | Merge Safety Read |
| --- | --- | --- | --- |
| `main` | 2025-07-23 | Minimal baseline scaffold with root README only | Safe baseline reference, not ready as deploy target by itself |
| `origin/dev` | 2025-11-25 | First substantial app buildout: frontend panels, Vite/API connectivity, Prisma schema | Reasonable baseline for comparisons; now used as stabilization baseline |
| `origin/feature/shipment-intelligence` | 2026-03-16 | Large shipment/integration expansion, SIL subsystem, metrics routes, warehouse widgets, roadmap docs | Meaningful work branch; compare carefully before any merge |
| `origin/claude/evaluate-repo-integration-Yk9Ge` | 2026-03-17 | Adds control-plane/admin surface and deploy stack for `encompax.io` | High-value comparison branch; not safe to merge blindly because workflow deploys from `main` |
| `origin/claude/continue-pdf-markdown-wGm4C` | 2026-03-18 | Security/bug sweep plus expanded inventory/warehouse APIs and UI | High-value branch; compare selectively because it introduces mixed `.ts` and generated `.js` files |
| `recovery/encompax-detached-2026-03` | local preserved | Saved reference branch for previously detached local commits | Preserve until reviewed and either integrated or archived |

## Ahead/Behind and Lineage Signals

- `origin/dev` is `21` commits ahead of `main`
- `origin/feature/shipment-intelligence` is `40` commits ahead of `main`
- `origin/claude/evaluate-repo-integration-Yk9Ge` is `44` commits ahead of `main`
- `origin/claude/continue-pdf-markdown-wGm4C` is `52` commits ahead of `main`
- The observed remote branches are largely linear descendants rather than heavily conflicting siblings:
  `main` -> `dev` -> `feature/shipment-intelligence` -> Claude branches

## Reviewed Comparison Findings

- `origin/feature/shipment-intelligence` is the branch where the SIL/integration subsystem first becomes substantial.
- `origin/claude/evaluate-repo-integration-Yk9Ge` is the only branch with explicit deploy infrastructure for `encompax.io`.
- `origin/claude/continue-pdf-markdown-wGm4C` adds the broadest operational feature set, but also mixes TypeScript and emitted JavaScript files, which raises cleanup risk.

## Domain and Deployment Relevance

Detected domain relevance:

- `encompax.io` appears in the deploy workflow and nginx config on `origin/claude/evaluate-repo-integration-Yk9Ge`
- No `smiley-zone` or arcade domain references were detected in the current Encompax checkout
- Firebase hosting is not currently usable from the checked-out state because [infra/firebase.json](/c:/Users/CR856/Documents/Encompax-core/infra/firebase.json) is empty and `.firebaserc` is absent

## Deployability Snapshot

Stabilization branch state is improved but still not release-ready:

- Backend TypeScript build now succeeds on `stabilization-encompax-2026-03`
- Frontend build success still could not be fully confirmed in this environment because of sandbox/esbuild process spawning limits
- `main` still does not contain the later deploy stack files
- The branch with the clearest deployment intent remains `origin/claude/evaluate-repo-integration-Yk9Ge`

## Suspected Deploy Branch Candidates

Most plausible candidates based on evidence:

1. `origin/claude/evaluate-repo-integration-Yk9Ge`
   Reason: only branch with explicit deploy workflow, Dockerfiles, nginx, and `encompax.io` references.
2. `origin/claude/continue-pdf-markdown-wGm4C`
   Reason: newest branch with extensive bug/security/inventory work, but no explicit deploy pipeline evidence.
3. `origin/feature/shipment-intelligence`
   Reason: substantial functional branch, but less deployment-ready than the branch above.

## Preliminary Recommendations

- Preserve all branches.
- Treat `main` as baseline only, not as current release truth.
- Use `origin/claude/evaluate-repo-integration-Yk9Ge` and `origin/claude/continue-pdf-markdown-wGm4C` as the first two comparison branches for stabilization review.
- Keep `recovery/encompax-detached-2026-03` until the detached local work is explicitly classified.
