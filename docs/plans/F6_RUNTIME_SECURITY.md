# F6 — Runtime Security and Quarantine — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f6--runtime-security-and-quarantine`](../QA_PLAN.md#f6--runtime-security-and-quarantine)

## User problem

Static installation-time scans cannot explain or contain suspicious runtime tool definitions, calls, or responses. Scanner evidence also becomes useless if CCO cannot connect it to the affected capability and provide a safe action.

## Outcome

Ingest versioned IntentProbe receipts, explain them in CCO, and support manual, reversible quarantine and restore.

## In scope

- Versioned receipt contract for registration-time and runtime subjects.
- Redaction, ordering, deduplication, replay, retention, compatibility, and missing-receipt states.
- Evidence view: subject type, decision, signal/scanner versions, thresholds, redacted spans, and resulting policy action.
- Manual quarantine, affected-session preview, restore, and false-positive workflow.
- Optional Hugging Face model card/artifact mirror for discovery and reproducibility.

## Non-goals

- No universal security guarantee.
- No automatic quarantine in the first slice.
- No cloud scanning requirement or upload of private prompts, arguments, responses, credentials, or paths.

## Locked decisions

- Missing, malformed, incompatible, or late receipts result in Unknown, not Allow.
- IntentProbe remains a complementary research-preview signal.
- Quarantine uses the F4 policy model and is reversible.
- CCO works offline after required local artifacts are installed.

## Open decisions for Nicole

- Which runtime subject types ship first: definitions, pre-call arguments, or post-call responses?
- Receipt retention duration and whether full redacted evidence or summaries are stored.
- Whether Hugging Face hosts probe-only artifacts, model cards, datasets, demos, or a subset.
- What evidence would be required before any automatic quarantine policy is considered.

## Delivery slices

1. Freeze and version the receipt schema in IntentProbe and CCO fixtures.
2. Read-only ingestion and evidence UI.
3. Manual quarantine preview/apply/restore.
4. Feedback/export path with privacy review.
5. Optional Hugging Face distribution experiment.

## Acceptance criteria

- Known allow/warn/block fixtures and malformed/late/version-mismatch cases behave as specified.
- No private raw event content crosses an undocumented boundary.
- Quarantine and restore survive stale state and partial failure.
- The exact object and affected sessions are shown before action.
- Public copy preserves IntentProbe's documented limitations.

## Implementation-session boundary

The F6 session consumes stable F4 policy and IntentProbe receipt contracts. If either contract is not stable, implementation stops at fixtures and interface review.
