# F14 — Action-linked Context Evidence — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f14--action-linked-context-evidence`](../QA_PLAN.md#f14--action-linked-context-evidence)

## User problem

Harnesses expose token numbers with different meanings. A current context snapshot, cumulative processed input, cached input, output, quota percentage, credits and API-equivalent dollars are often shown beside each other and mistaken for the same measure. Tool and MCP activity is visible, but an exact per-tool token bill usually is not. Existing dashboards can therefore produce confident but incompatible totals.

## Outcome

Provide the smallest local, provenance-preserving context evidence needed to explain a cross-harness discrepancy or support an approved CCO action. Reconcile against native harness evidence and state exactly how strong any tool/MCP attribution is; do not recreate native usage dashboards.

## In scope

- Claude Code and Codex are first candidates, not automatic deliverables. Each adapter starts only from a named F1/F13 diagnosis or action that native UI cannot explain.
- Supported local interfaces: documented statusline/telemetry/app-server events and durable transcript records. Private provider APIs, OAuth-token reuse and TLS interception are excluded.
- Observation identity: harness, adapter version, session/thread, request/turn where available, model, timestamp, source record and completeness state.
- Metric vocabulary:
  - active context occupancy and context limit;
  - request/turn input and cumulative processed input;
  - fresh/net-new input where natively exposed;
  - cache read and cache creation/write;
  - output and reasoning semantics;
  - compaction and retained/dropped evidence where exposed;
  - quota, credits, API-list-price equivalent, provider estimate and actual billed cost as separate authorities.
- Attribution vocabulary:
  - **Native exact** — the source reports tokens for that exact component;
  - **Payload estimate** — CCO counts serialized arguments, result or schema using a named method;
  - **Request-associated** — a request is tagged as using a tool/MCP result;
  - **Derived amplification** — estimated later re-reading under an explicit formula;
  - **Unavailable** or **Unsupported**.
- Turn and session reconciliation, including duplicated snapshots, partial streams, interrupted turns, compaction and model changes.
- Minimal historical persistence required for reconciliation and trend/action evidence, subject to an approved retention decision.
- Recommendations only when they connect to F13 scenario preview or an approved F3/F4/F5 action.
- Default presentation is attached evidence on the relevant F1/F13 node or finding, not a standalone analytics home.

## Non-goals

- No provider invoice reconstruction or subscription-value claim.
- No fabricated exact marginal token count per tool call.
- No replacement for native quota/statusline UI.
- No storage or upload of raw prompts, source code, command output, tool arguments or tool results for analytics.
- No generic observability backend, replay viewer or chart suite.
- No historical token dashboard whose only value is reproducing a native Cline, Zed, Aider, Kiro Crew or vendor view.
- No use of internal-only protocol fields as the sole production contract.

## Locked decisions

- `Active context` and `Processed input` are separate top-level concepts.
- Cache read/write remain separate from fresh input and are never hidden inside one ambiguous total.
- Reasoning tokens follow the source's subset/additive semantics; the adapter declares the rule.
- A number without source, unit, time, precision and completeness is invalid ledger data.
- Tool activity, payload size and token attribution are separate facts.
- Missing final usage after an interruption remains missing; CCO does not extrapolate a false exact total.
- API-equivalent dollars are estimates and never labelled as the amount paid under a subscription.

## Open decisions for Nicole

- Retention: current session only, bounded rolling window, or text-free durable aggregates.
- Main UI: session ledger table, relationship-graph drilldown, or a compact summary attached to F1 cards.
- Whether CCO may configure official local OTel exporters for the user, or only read an existing endpoint/file.
- Acceptable reconciliation tolerance for estimated versus native counters.
- Whether derived re-read amplification belongs in v1 or waits until exact active-context reconciliation is stable.
- Whether first release is read-only or can hand one recommendation to F13 preview.

## Delivery slices

1. Name one approved F1/F13 diagnosis or action that requires context evidence.
2. Freeze only the schema and metric semantics required for that case, retaining the full provenance/precision vocabulary.
3. Implement frozen native fixtures for the minimum harness pair involved.
4. Reconcile against native commands/events on disposable sessions.
5. Attach the evidence to the originating finding and prove that removing it would make the decision materially weaker.
6. Add no history chart or second metric family without another approved use case.
7. Complete F14 QA, privacy review and performance measurement.

## Acceptance criteria

- For every supported fixture, active context, per-turn/request use and cumulative processed use are independently reproducible.
- Native totals reconcile within the approved tolerance; differences name the exact field, source semantics and missing records.
- Duplicate snapshot records, compaction, cache changes, model switches, retries, interrupted turns and missing final events do not inflate exact totals.
- Reasoning is not double-counted; cache read/write is not mislabeled as fresh input.
- Each tool/MCP row shows attribution class and method; no request association is described as marginal tokens.
- Source schema drift fails visibly and preserves the last valid evidence without silently reinterpreting fields.
- Raw prompts, source, command output, arguments, results, credentials and OAuth tokens are absent from stored analytics and browser payloads.
- High-count session fixtures stay inside pre-approved CPU, RSS, latency and storage budgets.
- A dated QA report passes every F14 gate.

## Implementation-session boundary

The F14 session builds normalized read-only evidence for one approved action-linked case. It must not broaden into a standalone token product, process control, replay, invoice estimation, all-harness support, config mutation, or a general telemetry platform.

## Research basis

A primary-source review of [Cline task management](https://github.com/cline/cline/blob/main/docs/core-workflows/task-management.mdx), the [Zed Agent Panel](https://zed.dev/docs/ai/agent-panel), [Aider commands](https://aider.chat/docs/usage/commands.html), and [Kiro context management](https://kiro.dev/docs/cli/chat/context/) confirms mature native accounting in Cline and Zed, Aider preflight counts and Kiro Crew runtime metrics; only action-linked normalization is justified.

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-16 | Use a ledger ontology rather than one token total. | Harness counters describe different denominators and time windows. |
| 2026-10-16 | Keep Claude Code and Codex as first candidates, not automatic scope. | An adapter starts only when a named F1/F13 case requires evidence that native UI cannot supply. |
| 2026-10-16 | Reject exact per-tool billing as a v1 claim. | Reviewed public interfaces expose activity, payloads and request association, but not a universal exact marginal token field. |
