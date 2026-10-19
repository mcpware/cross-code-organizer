# F4 — Runtime Policy and Isolation — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f4--runtime-policy-and-isolation`](../QA_PLAN.md#f4--runtime-policy-and-isolation)

## User problem

A user needs an explicit, persistent answer to whether each capability is shared, session-specific, available on demand, under review, quarantined, or disabled.

## Outcome

Create an explainable policy model whose effective state can be previewed and safely applied across supported scopes.

## In scope

- Versioned states: Shared, Isolated, On-demand, Review, Quarantine, and Disabled.
- Scope, inheritance, precedence, effective-policy explanation, and conflicts.
- Capability support checks against harness and runtime adapters.
- Transactional policy changes with affected-session preview and audit record.

## Non-goals

- No automatic optimization or quarantine.
- No organization/team enforcement; that belongs to F12.
- No invented equivalence where a harness cannot express a requested state.

## Locked decisions

- Unknown capability semantics default to Review.
- Effective state always identifies its winning source.
- A requested but unsupported state remains visible as a conflict; CCO does not pretend it was applied.

## Open decisions for Nicole

- Scope hierarchy for user, harness, project, session, and capability policies.
- Default policy for newly discovered MCPs.
- Whether policy is stored centrally by CCO, projected into harness files, or both.

## Delivery slices

1. Policy schema, precedence truth table, and migration rules.
2. Read-only effective-policy rendering.
3. Preview and transactional mutation for one supported path.
4. Conflict handling and additional adapters.

## Acceptance criteria

- Truth-table tests cover all states, scopes, defaults, and collisions.
- Concurrent/stale writes fail with a conflict.
- Unknown future states and incompatible stored versions fail safely.
- Policy changes are reversible where they mutate harness/runtime config.
- UI never shows an unsupported policy as effective.

## Implementation-session boundary

The F4 session owns policy schema, evaluation, and explicit policy mutation. Resource automation and security receipt decisions remain F5 and F6.
