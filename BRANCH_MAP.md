# Encompax-core Branch Map

Audit date: 2026-03-20

| Branch | Category | Last Updated | Ahead/Behind if available | Main Purpose | Recommended Action | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `main` | baseline | 2025-07-23 | `0 ahead / 0 behind` vs local baseline | Initial scaffold and root repo anchor | keep active | Too thin to use alone for deployment |
| `origin/dev` | integration | 2025-11-25 | `21 ahead / 0 behind` vs `main` | First substantial connected app baseline with frontend/backend wiring | compare into integration branch | Current stabilization baseline |
| `origin/feature/shipment-intelligence` | feature | 2026-03-16 | `40 ahead / 0 behind` vs `main` | Shipment intelligence, SIL, warehouse metrics, UI expansion | compare into integration branch | Appears to build on `dev` rather than diverge from it |
| `origin/claude/evaluate-repo-integration-Yk9Ge` | experimental-ai | 2026-03-17 | `44 ahead / 0 behind` vs `main` | Control-plane/admin additions and explicit `encompax.io` deployment stack | cherry-pick selectively | High-value branch, but deploy workflow assumes `main` is release-ready |
| `origin/claude/continue-pdf-markdown-wGm4C` | experimental-ai | 2026-03-18 | `52 ahead / 0 behind` vs `main` | Bug/security sweep plus expanded inventory and warehouse functionality | compare into integration branch | Newest meaningful branch; review for mixed source/generated files |
| `recovery/encompax-detached-2026-03` | archive-reference | local preserved | n/a | Saved reference branch for detached local commits | archive only | Preserve until classified |

## Classification Notes

- No branch currently earns `candidate for release` without a dedicated integration pass.
- No branch should be used for deploy directly today.
- No branch currently looks safe to delete.
