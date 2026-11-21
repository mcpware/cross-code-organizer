# F7 — Hygiene Findings v2 — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f7--hygiene-findings-v2`](../QA_PLAN.md#f7--hygiene-findings-v2)

## User problem

The current score covers a narrow set of static conditions. Users need evidence for broken, unreachable, stale, conflicting, risky, or wasteful configuration and runtime state.

## Outcome

Expand CCO from a score into an evidence-first finding system with clear confidence, action, suppression, and reversibility.

## In scope

- Broken references, unreachable MCPs, stale paths, shadowed/conflicting definitions, floating package versions, command-line secret exposure, and narrowly specified semantic overlap.
- Finding schema: rule/version, severity, confidence, evidence, affected scope, recommended action, and reversibility.
- Suppression with reason, scope, and expiry.
- Score reconciliation with visible findings.

## Non-goals

- No unsupported claim that a finding proves malware or compromise.
- No opaque AI-generated cleanup action.
- No automatic fixes except separately approved deterministic/reversible rules.

## Locked decisions

- Deterministic and heuristic findings are visibly different.
- Every score deduction is traceable to findings.
- Sensitive evidence is redacted before reaching UI or logs.

## Open decisions for Nicole

- Initial v2 rule set and severity weights.
- Whether semantic overlap ships locally in v2 or remains research until a false-positive benchmark exists.
- Suppression defaults and expiry UX.

## Delivery slices

1. Versioned finding schema and score reconciliation.
2. Deterministic static rules.
3. Runtime-backed rules using F1 evidence.
4. Suppression/expiry.
5. Heuristic semantic overlap only after evaluation approval.

## Acceptance criteria

- Every deterministic rule has positive, negative, boundary, and platform fixtures.
- Heuristic rules include a reviewed false-positive set and confidence label.
- Visible counts exactly reproduce the score.
- Suppressions are auditable and reappear after expiry.
- Recommended actions state whether they are previewable and reversible.

## Implementation-session boundary

Each F7 implementation session takes a bounded rule group. It may not add a scanner model or mutation flow merely because the finding schema can represent one.
