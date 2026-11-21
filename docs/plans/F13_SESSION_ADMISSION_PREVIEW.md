# F13 — Session Admission Preview — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f13--session-admission-preview`](../QA_PLAN.md#f13--session-admission-preview)

## User problem

Before opening a coding-agent session, a user cannot reliably see which instructions, memories, skills, plugins, hooks, tools and MCP schemas will apply for the chosen harness and working directory. File size, token cost, precedence and load timing are spread across different scopes and harness rules. The user discovers the overhead only after the session has started.

## Outcome

Given one selected harness, working directory, profile and model, produce a deterministic pre-launch manifest of visible local inputs: why each item applies, when it loads, its estimated footprint and method, which parts are unknown, how it differs from another bounded scenario, and which later F1 runtime observations could confirm or contradict it.

## In scope

- Claude Code, Codex CLI, OpenCode and DeepSeek Harness only where the current adapter can declare verified resolution semantics.
- Resolve user, project, local and managed sources with the adapter's explicit precedence model.
- Inventory instruction and memory files, imported content, skill descriptions and bodies, plugins, hooks, built-in/user tool catalogs, MCP server/tool schemas and adapter-declared startup metadata.
- Load-mode vocabulary: **Always-on**, **Catalog only**, **On-demand**, **Event-triggered**, **Runtime-only**, **Hidden vendor content**, **Unavailable**, and **Unsupported**.
- Count-method vocabulary: **Native exact**, **Model tokenizer estimate**, **Serialized-schema estimate**, **Character heuristic**, **Unknown**, and **Hidden**.
- Per-component source, scope, precedence path, effective/shadowed state, load mode, token estimate, method, confidence and warnings.
- Bounded scenario comparison for disabling, moving scope, converting to on-demand, sharing, isolating or removing duplicate visible inputs.
- Handoff to an existing or later approved CCO preview-first mutation. F13 itself stays read-only.
- Exportable, versioned manifest fixture for QA and later F14 reconciliation.

## Default safety contract

- Preview does not launch a coding-agent session.
- Preview does not execute hooks, prompts, skills or tools.
- Preview does not start or connect to an MCP process by default.
- Secret values, environment values, file bodies, tool arguments and private paths do not enter telemetry or browser payloads beyond the minimum redacted display contract.
- Hidden system prompts and provider-side transformations remain `Hidden` or `Unknown`; CCO never invents their size.
- An optional active MCP schema probe is a separate unresolved product decision. If later approved, it must be explicit, bounded, time-limited, redacted and visibly separated from static/cache evidence.

## Non-goals

- No prediction of final conversation length, output tokens, task quality, latency or actual bill.
- No claim that a configured skill/tool will be selected by the model.
- No generic prompt linter or prompt-writing coach.
- No universal exact count when the complete provider request is unavailable.
- No reproduction of Aider-style file/token itemization unless CCO also adds verified precedence, load-mode, cross-harness comparison or an action handoff.
- No automatic optimization or configuration write.

## Locked decisions

- This is a pre-launch explanation, not another context ring.
- The selected harness/cwd/profile/model tuple is part of the manifest identity.
- Estimate and unknown are allowed to coexist; visible subtotal is never labelled complete when hidden content exists.
- Counts from different tokenizers or heuristics are not silently summed without a displayed method and compatibility rule.
- Scenario savings are estimates until F14 can compare them with runtime evidence.
- F13 ships after the F1 observation schema stabilizes and before F14. It reuses CCO's inventory/effective-context strengths and emits expectations that later runtime evidence can reconcile.

## Open decisions for Nicole

- Whether v1 supports only one selected tuple at a time or includes side-by-side harness comparison.
- Whether the main screen shows a compact manifest with Advanced detail, or opens directly into the existing context-budget view.
- Whether active MCP schema probing belongs in F13 v1, a later slice, or never.
- Which tokenizer packages may be shipped locally and the acceptable package-size/security trade-off.
- Whether a scenario comparison may deep-link into an already shipped mutation, or remains copy-only until its target feature is approved.

## Delivery slices

1. Freeze the admission-manifest schema, load-mode vocabulary, count-method vocabulary and privacy boundary.
2. Implement one complete Claude Code fixture and one Codex fixture without active processes.
3. Add source/precedence explanation and explicit hidden/unknown rows.
4. Add one scenario diff that changes only a disposable fixture and reports estimated savings.
5. Extend only to adapters whose resolution rules can be verified.
6. Complete F13 QA and package-content review.

## Acceptance criteria

- Identical inputs produce a stable manifest with deterministic ordering and versioned adapter identity.
- Nested includes, cycles, missing files, symlinks, shadowed sources and unsupported fields are represented without duplicate counting or path escape.
- Every numeric component identifies tokenizer/method, model assumption, confidence and freshness.
- Always-on, description/catalog-only, on-demand and event-triggered content remain separate.
- Hidden vendor content and unresolved runtime additions remain visible unknowns.
- Default preview starts zero agent/MCP/hook child processes and performs no network request.
- Scenario deltas reconcile arithmetically with their component changes and do not mutate the real config.
- A dated QA report passes every F13 gate.

## Implementation-session boundary

The F13 session may extend the canonical inventory and context-resolution adapters only as required to emit the admission manifest. It must not parse live session usage, build historical charts, start MCP servers by default, change config, or implement F14.

## Research basis

A maintainer primary-source review covered [Aider commands](https://aider.chat/docs/usage/commands.html), [Claude Code status lines](https://code.claude.com/docs/en/statusline), [Cursor context](https://cursor.com/docs/agent/prompting), and the [Zed Agent Panel](https://zed.dev/docs/ai/agent-panel). Aider already has a useful `/tokens` breakdown; the remaining opportunity is verified cross-scope resolution, load timing, cross-harness comparison and reconciliation with external runtime evidence.

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-16 | Split pre-launch admission from runtime accounting. | They use different sources, have different unknowns, and can be implemented and QA'd independently. |
| 2026-10-16 | Put F13 after the differentiated F1 schema. | The code audit showed generic preflight token itemization is prior art; CCO's value is joining the expected manifest to independently observed runtime reality. |
| 2026-10-16 | Default to static/cache-only inspection. | A preview must not spend resources or trigger executable MCP/hook behavior merely to estimate a future session. |
