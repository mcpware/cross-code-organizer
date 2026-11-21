# F12 — Team Baselines — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — later enterprise extension**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f12--team-baselines`](../QA_PLAN.md#f12--team-baselines)

## User problem

Teams may eventually need to compare each developer's effective local setup with an approved policy without collecting private session or configuration content.

## Outcome

Define a privacy-preserving, versioned baseline format with audit, drift explanation, exceptions, and optional later enforcement.

## In scope candidate

- Signed/versioned baseline format.
- Local audit and drift explanation.
- Scoped exceptions with owner, reason, and expiry.
- Headless consumption through F9.
- Separate audit and enforcement modes.

## Non-goals

- No enterprise-first redesign of CCO.
- No upload of prompts, sessions, paths, credentials, or private file content.
- No enforcement in the first slice.

## Dependencies

- F4 policy semantics must be stable.
- F9 schemas and exit codes must be stable.
- F11 must establish how supported artifacts vary across harnesses.
- Individual-user runtime work must already deliver value independently.

## Open decisions for Nicole

- Whether real team demand exists.
- Baseline distribution and signature ownership.
- Organization versus local exception precedence.
- Whether enforcement belongs in CCO or an external policy system.

## Discovery gate

Obtain concrete team workflows and privacy requirements before approval. Audit-only is the default proposal.

## Acceptance criteria candidate

- Baseline exchange excludes all prohibited private fields.
- Signature/version, drift, exception, expiry, precedence, and offline behavior are tested.
- UI and CLI clearly distinguish audit from enforcement.
- Local CCO remains functional without a team baseline or network service.

## Implementation-session boundary

No implementation begins until individual-user runtime, policy, and CLI contracts are stable and Nicole explicitly promotes this plan.
