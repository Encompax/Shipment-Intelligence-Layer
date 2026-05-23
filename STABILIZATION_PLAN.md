# Encompax-core Stabilization Plan

Audit date: 2026-03-20

## Recommended Stabilization Branch

- `stabilization-encompax-2026-03`

## Best Current Branch To Use As Comparison Baseline

- `origin/dev`

Reason:

- It is the first substantial connected application branch after the very thin `main`
- Later branches appear to stack on top of it
- It provides the cleanest practical baseline for comparing shipment, control-plane, and deploy additions

## Branches To Review First

1. `origin/claude/evaluate-repo-integration-Yk9Ge`
   Why first: it contains the strongest explicit deployment intent for `encompax.io`
2. `origin/claude/continue-pdf-markdown-wGm4C`
   Why second: it is the newest branch and appears to include bug/security passes plus substantial operational work
3. `origin/feature/shipment-intelligence`
   Why third: it introduces the shipment intelligence/SIL layer that later work likely depends on

## Reviewed Findings

- `origin/feature/shipment-intelligence` should be treated as the functional integration branch for SIL and warehouse intelligence.
- `origin/claude/evaluate-repo-integration-Yk9Ge` should be mined for deploy stack and control-plane additions, not merged wholesale.
- `origin/claude/continue-pdf-markdown-wGm4C` should be reviewed with extra care because it mixes valuable fixes with generated `.js` output and broad surface-area changes.
- `recovery/encompax-detached-2026-03` should be preserved until the detached local commits are explicitly classified.

## Branches Likely Containing Meaningful Work

- `origin/dev`
- `origin/feature/shipment-intelligence`
- `origin/claude/evaluate-repo-integration-Yk9Ge`
- `origin/claude/continue-pdf-markdown-wGm4C`
- `recovery/encompax-detached-2026-03`

## Branches Likely Safe To Archive Later

None should be archived yet.

## Safe Next Steps For Human Approval

1. Compare `origin/feature/shipment-intelligence` into `stabilization-encompax-2026-03`
2. Extract deploy/control-plane assets from `origin/claude/evaluate-repo-integration-Yk9Ge`
3. Extract bug/security fixes from `origin/claude/continue-pdf-markdown-wGm4C` while excluding generated-file noise
4. Classify the commits on `recovery/encompax-detached-2026-03`
5. Cut `release/encompax-prod` only after frontend verification and deployment-path alignment

## Recommended Release Branch Names

- `release/encompax-prod`
- Optional: `release/encompax-staging`
