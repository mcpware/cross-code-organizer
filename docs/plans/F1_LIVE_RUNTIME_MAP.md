# F1 — External Runtime Reality Map — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f1--external-runtime-reality-map`](../QA_PLAN.md#f1--external-runtime-reality-map)

## User problem

A user running several independently launched coding-agent sessions cannot see which processes belong to each session, how much memory they consume, which effective configuration produced them, which MCPs are duplicated, or the scope within which an MCP is actually shared.

## Outcome

Provide a neutral, read-only, privacy-bounded join from CCO's effective configuration inventory to arbitrary supported live sessions and their runtime topology. Clearly separate measured facts, declarations, bounded inference, unknowns, and unsupported observations.

## In scope

- Detect same-user Claude Code, Codex, OpenCode, and DSH sessions where the platform supports it.
- Do not require sessions to be launched, imported or owned by CCO.
- Show session age, process/thread count, tree RSS, direct MCP matches, shared-runtime nodes, duplicate instances, owner scope, and observation confidence.
- Model sharing scope explicitly: session, extension host, project, app runtime, OS-user pool, or remote service.
- Join a live node to an effective static source only when the adapter can preserve the evidence path; otherwise report the relationship as unknown.
- Explain when short-lived connections or platform limitations prevent attribution.
- Put backend identity and low-level diagnostics under Advanced.

## Non-goals

- No configuration migration.
- No policy writes, quarantine, automatic stopping, or background optimization.
- No token/context accounting or historical cost charts; those belong to F14.
- No claim that process names reveal semantic user intent.
- No attempt to become a replacement agent workspace, ACP host, or native session dashboard.

## Existing prototype input

The frozen `feat/mcp-runtime-doctor` work may be mined for collectors, privacy boundaries, fixtures, and UI lessons. Its `1MCP Doctor` product framing and mixed read/write scope are not approved.

## Locked decisions

- The normal UI says Runtime Reality Map, MCP Runtime, and Shared MCP Pool.
- CCO must work without 1MCP or IntentProbe.
- `shared` is not a Boolean conclusion. Every shared claim carries an owner scope and evidence source.
- A common Cline Hub PID, Roo extension host, Zed project store, or Kiro Crew runtime does not by itself prove that its MCP backend processes are shared.
- Command lines, environment variables, raw sockets, private paths, and secret values never reach the browser.
- Refresh is user-visible and bounded; continuous monitoring is not assumed.

## Open decisions for Nicole

- Default refresh model: manual, foreground polling, or an explicit monitoring toggle.
- Which summary numbers belong on the main screen versus Advanced.
- Whether session stop is removed from F1 entirely or retained disabled behind a future F5 marker.

## Delivery slices

1. Freeze the runtime observation schema and privacy contract.
2. Implement collectors behind platform capability flags.
3. Build empty, partial, error, and high-count UI states.
4. Add observation-confidence and methodology explanations.
5. Complete F1 QA and package verification.

## Acceptance criteria

- Useful with zero, one, and many sessions, and with no shared runtime.
- At least one fixture covers sessions launched outside CCO by two different harness families.
- Fixtures distinguish Cline's shared Hub from session-built MCP managers, Roo's extension-host singleton, Zed's project store and a Kiro Crew multiplexed runtime.
- Shared runtime totals are measured once; per-session attribution is labelled and never multiplied into a false host total.
- Independent OS checks agree with bounded fixture counts and RSS methodology.
- Unobserved short-lived traffic remains Unknown rather than guessed.
- Unsupported platforms fail safely and honestly.
- Runtime observation has measured latency and idle/active resource cost.
- A dated QA report passes every F1 gate.

## Implementation-session boundary

The F1 session may refactor the frozen prototype into a generic read-only vertical slice. It must not implement migration, policy, lifecycle controls, or IntentProbe receipt ingestion.

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-16 | Separate observation from control. | Runtime visibility can ship safely before mutation semantics are settled. |
| 2026-10-16 | Move token/context semantics to F14. | Process topology and token accounting use different evidence and failure modes; combining them would make F1 too broad. |
| 2026-10-16 | Make external ownership the differentiator. | Kiro Crew already has a strong resource view for sessions registered in its own manager; CCO must explain the independently launched environment instead of becoming another harness. |
| 2026-10-16 | Replace Boolean sharing with owner scope. | Cline, Roo, Zed and Kiro Crew share at different process/project/app boundaries; one `shared` flag would be materially misleading. |

## Research basis

A maintainer primary-source audit reviewed [Cline](https://github.com/cline/cline), [Roo Code](https://github.com/RooCodeInc/Roo-Code), [Zed](https://github.com/zed-industries/zed), and [Kiro Crew](https://github.com/kirodotdev/KiroCrew). It found mature native dashboards and shared runtimes, but no reviewed product joined arbitrary independently launched harnesses to cross-product effective configuration and live MCP ownership. Implementation must revalidate the pinned upstream revisions recorded in the QA evidence bundle.
