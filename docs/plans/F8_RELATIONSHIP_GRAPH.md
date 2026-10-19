# F8 — Context and Runtime Relationship Graph — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f8--relationship-graph`](../QA_PLAN.md#f8--relationship-graph)

## User problem

Inventory lists do not show why a capability reaches a session, how pre-launch admission relates to observed runtime/usage evidence, or how many sessions and policies a proposed change will affect.

## Outcome

Provide a source-backed path from session to harness, admission component, config source, usage observation, effective policy, runtime instance, MCP/tool, and security evidence, including pre-change blast radius.

## In scope

- Normalized node/edge model over existing canonical inventory, F13 admission manifests, F14 ledger observations, and runtime data.
- Evidence, timestamp where relevant, and confidence/precision for every edge.
- Path filtering, partial-state handling, and change-impact preview.
- Accessible tree/table representation before or alongside a graphical canvas.

## Non-goals

- No second scanner or duplicate inventory database.
- No graph visualization before the relationship model is correct.
- No inferred edge shown as a measured fact.

## Locked decisions

- Canonical inventory remains the source of nodes.
- Graphical presentation is optional; accessible equivalent information is mandatory.
- Missing and stale edges remain visible as incomplete evidence.

## Open decisions for Nicole

- First user journey: explain current load, diagnose duplication, or preview a policy change.
- Whether v1 ships as an expandable path/table or full canvas.
- Maximum default graph size and filtering strategy.

## Delivery slices

1. Graph schema and traversal oracle.
2. One end-to-end path for a single session/MCP.
3. Blast-radius preview.
4. High-volume filtering and accessible UI.
5. Optional canvas visualization.

## Acceptance criteria

- Every edge resolves to evidence and a confidence class.
- Cycles, missing nodes, duplicates, partial runtime observations, and stale edges are safe.
- Blast-radius results match independent traversal fixtures.
- Keyboard and non-visual users can obtain the same facts.
- High-volume fixtures stay inside an approved performance budget.

## Implementation-session boundary

The F8 session builds relationships from F13/F1/F14/F4/F7 contracts. It cannot change those semantics solely to simplify visualization.
