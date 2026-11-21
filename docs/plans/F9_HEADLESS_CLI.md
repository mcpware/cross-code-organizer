# F9 — Headless CLI and JSON Contract — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f9--headless-cli-and-json`](../QA_PLAN.md#f9--headless-cli-and-json)

## User problem

CCO evidence is available only through the interactive dashboard, so users cannot script repeatable audits or use stable results in CI.

## Outcome

Expose read-only inventory, admission previews, findings, runtime snapshots, and policy checks through versioned JSON schemas and predictable exit codes.

## In scope

- Headless commands for approved read-only domains.
- F13 admission-manifest output only after its schema is stable; the CLI reuses that contract and does not perform a second resolution pass with different semantics.
- Versioned JSON Schema, deterministic ordering, redaction, stdout/stderr separation, and compatibility policy.
- Human summaries and CI examples.
- Explicit clean, warning, policy-failure, unsupported, and internal-error outcomes.

## Non-goals

- No headless mutations.
- No remote SaaS requirement.
- No promise of backward compatibility before the schema policy is approved.

## Locked decisions

- JSON stdout contains data only; progress and diagnostics use stderr.
- CI is read-only by default.
- Private paths/content follow the same or stricter redaction contract as the dashboard.

## Open decisions for Nicole

- Command shape and naming.
- First stable schema version and compatibility duration.
- Which findings should cause a non-zero policy exit versus a warning result.

## Delivery slices

1. Inventory JSON and schema.
2. Admission manifest after F13 schema stability.
3. Findings/policy result and exit-code contract.
4. Runtime snapshot after F1 schema stability.
5. CI examples and compatibility fixtures.

## Acceptance criteria

- All output validates against the declared schema.
- Golden fixtures prove deterministic order and redaction.
- At least one prior schema version remains readable after a version change.
- Exit codes distinguish policy result from internal failure.
- Headless execution performs no mutations.

## Implementation-session boundary

The F9 session exposes existing stable contracts. It must not invent missing domain semantics inside CLI serialization.
