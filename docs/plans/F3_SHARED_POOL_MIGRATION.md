# F3 — Consolidate into Shared Pool — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f3--consolidate-into-shared-pool`](../QA_PLAN.md#f3--consolidate-into-shared-pool)

## User problem

The same stateless MCP may be started independently by several sessions, wasting memory and obscuring ownership. Moving config manually risks broken paths, lost credentials, or an unrecoverable partial migration.

## Outcome

Let a user preview, apply, verify, and roll back consolidation of eligible MCPs into a shared pool.

## In scope

- Eligibility results: share candidate, must isolate, needs review, unsupported, and already shared.
- Preview of exact sources, destination, loading change, conflicts, and estimated resource effect.
- Fingerprinted backup, transaction manifest, stale-preview check, apply, health verification, and rollback.
- Partial-failure recovery across supported harness/config types.

## Non-goals

- No automatic migration.
- No assumption that every MCP is shareable.
- No policy editor beyond the decision required for this transaction.
- No migration until F2 selects an existing engine or a later approved plan supplies code-level evidence for a different implementation.

## Locked decisions

- Browser/stateful automation defaults to Must Isolate.
- Unknown semantics default to Needs Review.
- Credentials may be moved only through approved config semantics and never copied into logs or browser payloads.
- Source config is not deleted until the shared target verifies healthy.

## Open decisions for Nicole

- Which MCP categories are preclassified in v1, if any?
- Must v1 support multiple harness configs in one atomic transaction?
- What post-migration observation period is required before success?

## Delivery slices

1. Eligibility and preview only, reusing the selected engine's real pool/shareability contract rather than inventing a parallel promise.
2. Transaction/backup format and dry-run oracle.
3. One harness plus one runtime apply/verify/rollback path.
4. Failure injection and recovery.
5. Additional harnesses only as separately reviewed sub-slices.

## Acceptance criteria

- Every eligibility outcome has a reason and evidence.
- No silent overwrite, destructive partial success, or secret-bearing record.
- Rollback restores exact bytes unless an independently edited target requires refusal.
- Health failure preserves or restores the last working state.
- Stateful browser MCP fixtures never enter the shared pool by default.

## Implementation-session boundary

The F3 session owns migration transactions only. It consumes the F2 adapter contract and may not redesign it casually or add lifecycle automation.

## Research constraint

Kiro Crew's source demonstrates that identical MCP handshakes do not prove process-global state is safe to share. `Unknown` and `Needs Review` remain first-class outcomes; CCO must not upgrade a successful probe into proof of safe co-tenancy.
