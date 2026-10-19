# F11 — Semantic Portability and Adapter Expansion — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — discovery required**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f11--semantic-portability-and-adapter-expansion`](../QA_PLAN.md#f11--semantic-portability-and-adapter-expansion)

## User problem

Users repeat customizations across coding harnesses, but formats and runtime semantics differ. Blind file copying can silently change behavior.

## Outcome

Add one verified artifact type and harness pair per sub-plan, with semantic diff, unsupported-field preservation, and copy-first behavior.

## In scope candidate

- Field mapping and capability matrix for one artifact/harness pair.
- Semantic preview and explicit unsupported fields.
- Copy-first conversion, rollback where a target is created, and round-trip fixtures.
- Inventory-only adapter support before mutation support.

## Non-goals

- No universal converter.
- No claim that similarly named features behave identically.
- No simultaneous addition of Cursor, Windsurf, and Aider.

## Locked decisions

- Each harness pair/artifact type receives its own approved sub-plan.
- Unsupported semantics block one-click conversion when behavior could change materially.
- Source artifacts remain unchanged by default.

## Open decisions for Nicole

- Next harness based on current usage evidence, not the old README list alone.
- First artifact type after portable skills.
- Required round-trip fidelity and what losses may be accepted.

## Discovery gate

Collect current official format/precedence documentation and user demand for candidate harnesses. Select exactly one harness and one artifact type before changing this status to Approved.

## Acceptance criteria candidate

- Mapping and unsupported-field behavior are documented and fixture-tested.
- Semantic diff predicts the actual target behavior within declared limits.
- Round trips preserve all supported information.
- Unsupported mutations remain disabled in API and UI.

## Implementation-session boundary

No session receives “add more harnesses” as an open-ended task. The handoff must name one exact pair and artifact type.
