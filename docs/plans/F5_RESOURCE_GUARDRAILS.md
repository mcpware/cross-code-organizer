# F5 — Lifecycle and Resource Guardrails — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f5--lifecycle-and-resource-guardrails`](../QA_PLAN.md#f5--lifecycle-and-resource-guardrails)

## User problem

Forgotten or runaway sessions consume memory and process limits, but killing the wrong process can lose work or stop unrelated applications.

## Outcome

Provide explicit lifecycle controls and optional resource guardrails with exact ownership, stale-state protection, and safe defaults.

## In scope

- Start, graceful stop, restart, and detach where the relevant adapter supports them.
- Same-user, PID/start-time, executable/harness, and CCO self-tree validation.
- Optional idle-stop and memory/task thresholds, off by default.
- Bounded local sampling for trends, hysteresis, cooldown, and restart-loop prevention.

## Non-goals

- No default automatic killing.
- No semantic claim about what a session is doing from process metadata.
- No OS-wide process manager.

## Locked decisions

- Read-only remains the default mode.
- Every destructive action names the exact target and consequence before confirmation.
- Unsupported or stale targets fail closed.

## Open decisions for Nicole

- Whether v1 includes only explicit stop/restart or also opt-in idle-stop.
- Graceful timeout and whether escalation beyond `SIGTERM` is ever allowed.
- Numeric performance, retention, and threshold defaults after F1 baselines exist.

## Delivery slices

1. Explicit lifecycle controls with identity revalidation.
2. Resource sampling and budget measurement.
3. Threshold notifications without automation.
4. Optional automatic action only after separate approval and recovery evidence.

## Acceptance criteria

- PID reuse, disappearing targets, child churn, wrong user, and self-tree attempts are refused.
- Graceful stop and restart results are verified and recorded.
- Monitoring overhead stays within pre-approved numeric budgets.
- Automated controls, if later approved, include hysteresis, cooldown, and recovery.
- Live destructive QA uses only an explicitly approved disposable target.

## Implementation-session boundary

The F5 session may add only the approved lifecycle slice. It cannot turn notification thresholds into automatic termination without a Living Plan decision update.
