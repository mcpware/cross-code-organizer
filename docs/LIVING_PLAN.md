# CCO Living Product Plan

Last updated: 2026-10-16 PT
Owner: Nicole (product decisions) + PM session (requirements and sequencing)
Status: **Draft for product approval — no feature implementation is authorized by this document**

This is the single source of truth for CCO product direction and delivery order. It replaces the backlog portions of `README.md`, `docs/CONTROL_PLANE_PLAN.md`, and older review notes. Those files remain evidence or public documentation until a later documentation session reconciles them.

## Product outcome

CCO is the neutral local reality and policy layer for a person's existing AI coding environment. It does not require sessions to be launched inside CCO. It should let a user answer, from one understandable interface:

1. What configurations, capabilities, sessions, and MCP processes exist?
2. Before a session starts, what will be loaded, why, and with what estimated context cost?
3. During and after a session, what is active context versus cumulative token use, and what evidence supports each number?
4. What is active, inherited, duplicated, costly, risky, or stale?
5. Which resources are shared and which must remain isolated?
6. What safe, reversible action can CCO take now?
7. What happened after the action, and how can the user undo it?

The primary customer is an individual developer running several coding-agent sessions on one computer. Enterprise policy is a later extension of the same local model, not the starting point.

## Locked product decisions

- **CCO is the product.** `1MCP` is not a separate user-facing area or prerequisite.
- **CCO is not another agent harness.** Its first-party advantage is observing and explaining independently launched tools across product boundaries, then planning reversible external changes.
- The user-facing concepts are **MCP Runtime**, **Shared MCP Pool**, **Live Session Map**, **Resource Usage**, **Duplicate Detection**, **Session Isolation**, **Quarantine**, and **Runtime Security**.
- CCO must remain useful when 1MCP is absent. It discovers direct MCP processes and can offer a safe path to a shared runtime.
- When 1MCP is present, CCO may import or adopt it through a replaceable backend adapter. Advanced diagnostics may identify the engine; ordinary product copy should not require the user to know what 1MCP is.
- CCO owns inventory, policy, security boundaries, migration UX, evidence, and rollback. A shared-runtime engine is an implementation detail.
- CCO does not build a new MCP broker while an adoptable open-source engine can satisfy the approved boundary. Kiro Crew Gateway and 1MCP must be evaluated through the same adapter contract before any CCO-owned broker is proposed.
- The policy vocabulary is: **Shared**, **Isolated**, **On-demand**, **Review**, **Quarantine**, and **Disabled**.
- Browser automation and other stateful per-session tools default to **Isolated**. Low-frequency stateless services may be candidates for **Shared**. CCO must show evidence and let the user decide.
- IntentProbe is a complementary scanner and receipt producer. It is not presented as a universal hard security boundary.
- A token ring, historical usage chart, or generic session list is not a standalone CCO product area. Official harnesses and mature open-source tools already provide them.
- A shared daemon, per-app MCP singleton, session resource table, token meter, or context compactor is not a moat by itself. Cline, Roo, Zed, Aider and Kiro Crew contain verified implementations of those components.
- CCO's context advantage is the explanation-to-action loop: resolve what will load, preserve source and confidence, reconcile runtime evidence, preview a safe change, and roll it back.
- Active context, cumulative processed input, cache read/write, output, reasoning, quota, credits, estimated cost, and actual billed cost are different measures. CCO never combines them under an ambiguous `tokens` or `cost` label.
- Per-tool attribution must state its precision: exact native count, payload estimate, request association, derived re-read amplification, missing, or unsupported. Association is never represented as an exact marginal bill.
- Every mutation is preview-first, narrowly scoped, revalidated immediately before execution, recorded, and reversible wherever technically possible.
- Product work follows: requirement discussion -> approved Living Plan slice -> separate implementation session -> QA evidence -> integration decision.

## Current product truth

### Public baseline

- npm `latest` is **0.19.3**.
- The repository contains and tags **v0.20.0**, but npm and GitHub Releases do not expose it as the current public release.
- The latest v0.20.0 publish run completed its test, audit, pack, and provenance stages, then npm returned `E404` on publish. The package exists at 0.19.3, so the observed failure is a publication-authority/configuration problem, not evidence that the package name is absent.
- GitHub reports 383 stars and 33 forks at this review. There are zero open issues and five open discussions.

### Shipped capability groups in the v0.20 codebase

1. Cross-harness inventory for Claude Code, Codex CLI, OpenCode, and DeepSeek Harness.
2. Effective-context and source/scope explanation where an adapter declares its precedence model.
3. Context-budget estimates, including supported import expansion.
4. Hygiene score and exact-duplicate, reversible repair.
5. Unified memory search and source-aware Markdown editing.
6. Static MCP security scanning, change baselines, and click-through remediation.
7. MCP enable/disable controls and copy-only skill portability.
8. Session Distiller, image trimming, export, backup, and undo flows.
9. Local, opt-in privacy metrics and hardened loopback dashboard access.

### Frozen work in progress

Branch `feat/mcp-runtime-doctor` contains an uncommitted, unpushed Linux runtime-observation prototype. It already demonstrates that CCO can group sessions, attribute direct MCP processes, inspect a shared runtime, show resource pressure, detect selected risks, and stop a revalidated session. It is **not** an approved product implementation yet.

The prototype must be treated as input to F1, not merged as-is. In particular, the current `1MCP Doctor` framing must be replaced by generic CCO runtime language, and the read-only observation contract must be separated from later mutation and policy work.

### Live-machine evidence informing the roadmap

A local snapshot on 2026-10-16 observed 12 Claude/Codex sessions, a shared runtime with 17 configured MCP servers, approximately 1.85 GB of runtime memory, 99 processes, and 352 of 512 cgroup tasks. It also found floating package specifications and credential-shaped command-line arguments without returning their values. This is one machine snapshot, not market prevalence, but it validates the personal-user problem: resource use, duplication, ownership, and isolation are difficult to see today.

Persistent loopback socket observation is incomplete by design; short-lived requests can disappear between snapshots. CCO must report this limitation instead of inferring a complete client map.

### Open-source architecture audit correction

A maintainer primary-source audit of [Cline](https://github.com/cline/cline), [Roo Code](https://github.com/RooCodeInc/Roo-Code), [Zed](https://github.com/zed-industries/zed), [Aider](https://github.com/Aider-AI/aider), and [Kiro Crew](https://github.com/kirodotdev/KiroCrew) changes the competitive baseline:

- Cline has an OS-singleton shared Hub but constructs MCP managers while building each session runtime. CCO must distinguish shared control plane from shared MCP backend rather than treating either label as proof.
- Roo shares one MCP set only inside one extension host; Zed shares context servers at project scope. Runtime records therefore need an explicit owner scope, not a Boolean `shared` field.
- Aider already provides a useful preflight token breakdown. F13 must explain cross-harness precedence, load mode, unknowns and scenario differences rather than reproduce `/tokens`.
- Kiro Crew already provides multi-harness ACP orchestration, shared runtime support, per-session process-tree resource views, and a sophisticated MCP backend pool with host budgets and shareability evidence. CCO must not rebuild this stack by default.
- Kiro Crew's resource API starts from sessions registered in its own `SessionManager`. CCO's differentiated first slice is a neutral join across arbitrary supported sessions already launched by editors and terminal harnesses: effective config -> live process/MCP topology -> evidence -> reversible plan.
- Kiro and Devin's named official public repositories do not contain their product cores. Adapters for them must use documented or locally observable contracts and label internal details unknown.

## Delivery map

There is one blocking release gate and **14 feature packets**. The number is deliberately based on independently reviewable user outcomes, not UI screens or code modules. Every row links to its own Living Plan; the master roadmap does not authorize implementation by itself.

| Order | ID | Feature packet | User outcome | Depends on | Decision |
|---:|---|---|---|---|---|
| 0 | P0 | [Release recovery and product-truth reset](plans/P0_RELEASE_RECOVERY.md) | Users can install the intended tested baseline—v0.20.0 if recoverable, otherwise a superseding version—and public claims match what is actually available. | None | Do first |
| 1 | F1 | [External Runtime Reality Map](plans/F1_LIVE_RUNTIME_MAP.md) | Join independently launched supported sessions to process trees, MCP ownership scope, memory, age, duplication, confidence and observation limits without making CCO their launcher. | P0 | Differentiated first slice |
| 2 | F13 | [Session Admission Preview](plans/F13_SESSION_ADMISSION_PREVIEW.md) | Before launch, see the resolved cross-harness local sources, precedence, load mode, estimated footprint, unknowns, and a scenario difference that can later be checked against F1. | P0, current inventory/effective-context model | Build after F1 schema is stable |
| 3 | F2 | [Runtime Engine Compatibility](plans/F2_SHARED_RUNTIME_ADAPTER.md) | Test Kiro Crew Gateway and 1MCP against one backend-neutral external-client contract; adopt a working engine and document gaps before proposing any new broker. | F1 | Research/spike before pool work |
| 4 | F14 | [Action-linked Context Evidence](plans/F14_CONTEXT_TOKEN_LEDGER.md) | Normalize only the context/token evidence needed to explain a cross-harness discrepancy or support an approved CCO action; do not recreate native meters. | F13, F1 | Narrow, after the reality join |
| 5 | F3 | [Consolidate into Shared Pool](plans/F3_SHARED_POOL_MIGRATION.md) | Preview, migrate, verify, and roll back eligible direct MCP configurations without requiring 1MCP knowledge. | F2, F13 | Build next |
| 6 | F4 | [Runtime Policy and Isolation](plans/F4_RUNTIME_POLICY.md) | Assign Shared, Isolated, On-demand, Review, Quarantine, or Disabled policy per capability and scope. | F2, F3 | Build next |
| 7 | F5 | [Lifecycle and Resource Guardrails](plans/F5_RESOURCE_GUARDRAILS.md) | Start, stop, restart, idle-stop, and set resource thresholds with explicit ownership and safe defaults. | F1, F4 | Build next |
| 8 | F6 | [Runtime Security and Quarantine](plans/F6_RUNTIME_SECURITY.md) | Connect IntentProbe receipts to CCO, explain decisions, quarantine safely, and restore after review. | F4, stable receipt contract | Build after control plane |
| 9 | F7 | [Hygiene Findings v2](plans/F7_HYGIENE_FINDINGS.md) | Find broken references, unreachable MCPs, stale paths, semantic overlap, floating packages, and secret-exposure risks with evidence. | F1, adapter contracts | Build after runtime core |
| 10 | F8 | [Context and Runtime Relationship Graph](plans/F8_RELATIONSHIP_GRAPH.md) | Trace session -> admission source -> runtime evidence -> policy -> MCP/tool and show blast radius before a change. | F13, F1, F14, F4, F7 | Build after data model stabilizes |
| 11 | F9 | [Headless CLI and JSON Contract](plans/F9_HEADLESS_CLI.md) | Run inventory, findings, admission previews, runtime snapshots, and policy checks in scripts or CI with stable schemas and exit codes. | F13, F1, F7 | Build after contracts stabilize |
| 12 | F10 | [Personal Vault and Reusable Profiles](plans/F10_PERSONAL_VAULT.md) | Park inactive artifacts, reuse reviewed settings fragments, and apply project profiles with preview and rollback. | Reversible transaction model | Conditional, after core runtime |
| 13 | F11 | [Semantic Portability and Adapter Expansion](plans/F11_PORTABILITY.md) | Add conversions and new harnesses one verified artifact type and harness pair at a time. | Stable adapter and diff contracts | Later |
| 14 | F12 | [Team Baselines](plans/F12_TEAM_BASELINES.md) | Define, audit, and optionally enforce shared team policy without weakening local privacy or rollback. | F4, F9, F11 | Last / enterprise extension |

## Why this order

```text
P0 public baseline
  -> F1 observe independently launched process and MCP reality
      -> F13 explain the effective configuration that should create that reality
      -> F2 test/adopt an existing runtime engine
      -> F14 add only action-linked context/token evidence (also consumes F13)
          -> F3 move safely
              -> F4 decide shared vs isolated
                  -> F5 control resources
                  -> F6 quarantine with security evidence
      -> F7 improve findings
          -> F8 join admission, runtime, usage and blast radius
          -> F9 expose stable automation contracts
              -> F12 support teams

F10 and F11 remain later, parallel candidates after the transaction and adapter
contracts stop moving.
```

External runtime observation comes first because it is the part the reviewed harnesses do not provide across one another, and because CCO already has a frozen prototype to mine. Admission explanation then joins CCO's existing static strengths to that runtime schema. Engine evaluation comes before migration so a solo maintainer does not build infrastructure already available under an open-source license. Token/context work remains downstream and action-linked because native products already provide mature meters. Reversible migration comes before automatic optimization. Policy comes before quarantine. Stable data contracts come before CI and team enforcement.

## Feature packet contracts

Each packet below is the boundary for one future implementation session. A session may split the packet further after PM approval, but it may not silently pull work from another packet.

### P0 — Release recovery and product-truth reset

Outcome: v0.20.0 is either published and verified, or deliberately superseded by a new version with a documented reason.

In scope:

- Verify the npm trusted-publisher tuple and package ownership without exposing credentials.
- Rerun the idempotent release workflow only after the publisher configuration is correct.
- Verify npm, MCP Registry, GitHub Release, provenance, install smoke, and `latest` dist-tag.
- Reconcile public roadmap statuses and remove claims that refer only to unmerged runtime work.
- Decide whether the 34 MB activation-research corpus remains in CCO or is replaced by compact fixtures and links to IntentProbe.

Acceptance:

- A clean machine can install the intended public version and run `--help`, `--version`, and the dashboard.
- All registries expose the same version.
- README, release notes, package metadata, and runtime behavior agree.

Non-goal: add runtime features during release recovery.

### F13 — Session Admission Preview

Outcome: before starting a session, a user can see which visible local sources will be admitted, why they apply, how they load, their estimated context footprint, what remains unknowable, and how that manifest relates to F1's observed runtime topology.

In scope:

- Resolve the selected harness, working directory, profile, model, scope and precedence path without launching an agent session.
- List applicable instruction and memory files, skill metadata/body load mode, plugins, hooks, built-in/user tools, MCP servers/tool schemas, and other adapter-declared startup inputs.
- Classify each component as always-on, catalog/description-only, on-demand, event-triggered, runtime-only, hidden vendor content, unavailable, or unsupported.
- Report token method and confidence per component: supported native exact count, model tokenizer estimate, serialized-schema estimate, character heuristic, unknown, or hidden.
- Compare bounded scenarios such as disable, move scope, on-demand, shared, or isolated, then hand the selected change to CCO's existing preview/rollback path.

Acceptance:

- The same fixture resolves to a deterministic manifest with source, precedence, load mode, method, confidence, and unknowns.
- CCO never presents visible-local totals as the complete vendor prompt when hidden system content exists.
- Default preview does not launch an agent, execute a hook, call a tool, or start an MCP process.
- Optional active MCP schema probing, if approved later, is separately consented, bounded, redacted, and visibly different from static preview.

Non-goal: predict the task's eventual conversation length, exact bill, model quality, or whether the model will invoke a tool.

### F1 — External Runtime Reality Map

Outcome: a user can understand current session and MCP resource use across independently launched supported harnesses without moving those sessions into a CCO-owned runtime or changing anything.

In scope:

- Same-user session/process discovery with platform capability labels and no requirement that CCO launched the process.
- Session age, RSS, process/thread counts, direct MCPs, shared-runtime nodes, duplicate instances, owner scope, and observation confidence.
- Join effective static configuration evidence to live process and transport evidence where the adapter can do so safely.
- Represent `shared within extension host`, `shared within project`, `shared app runtime`, `OS-user pool`, and `remote service` separately.
- Clear distinction between measured, inferred, unavailable, and unsupported data.
- Generic CCO terminology; backend engine details live under Advanced diagnostics.

Acceptance:

- Useful with zero, one, and many sessions; with and without a shared runtime.
- No command line, config content, secret value, raw socket record, or unrelated user process reaches the browser.
- Short-lived connections and unsupported platforms are shown as unknown, not guessed.

Non-goal: token/context accounting, migration, policy writes, quarantine, or automatic stopping. Token and context semantics belong to F14.

### F14 — Action-linked Context Evidence

Outcome: where a runtime/configuration diagnosis needs it, a user can inspect normalized context evidence without mixing incompatible counters or rebuilding the harness's native usage dashboard.

In scope:

- Add no adapter merely to show a number already clear in the native harness. Claude Code and Codex remain the first candidates only when a concrete F1/F13 discrepancy or action requires their evidence.
- Separate active context occupancy/limit, request or turn usage, cumulative processed input, fresh input, cache read/write, output, reasoning, compaction, quota, credits, and cost authority.
- Preserve source adapter/version, timestamp, model, unit, precision, completeness, and missing/interrupted state for every observation.
- Attribute tool/MCP effects as exact native count, direct serialized payload estimate, request association, derived re-read amplification, or unavailable; never upgrade one class into another.
- Show session/turn/tool evidence only when it produces an action or diagnosis that the native harness does not already explain; generic history charts remain out of scope.
- Link recommendations to F13 scenario preview and later CCO policy/migration actions.

Acceptance:

- Ledger totals reconcile with native harness counters for frozen fixtures within an approved tolerance and explain any non-reconciling fields.
- Active context is never computed by summing cumulative input; reasoning is not double-counted when it is a subset of output.
- Compaction, cache snapshots, duplicated events, interrupted turns, missing final usage, model changes, and schema drift remain explicit.
- API-equivalent estimates, subscription quota, credits, and actual billed money are visibly distinct.
- No OAuth token scraping, TLS interception, prompt/tool-result upload, or unsupported private API is required.

Non-goal: reproduce provider invoices, assign a fabricated exact marginal token bill to each tool call, or compete with native quota/status-line UI.

### F2 — Runtime Engine Compatibility

Outcome: CCO can prove whether an existing shared MCP engine can serve independently launched harnesses through a stable, backend-neutral contract before any migration or new broker work begins.

In scope:

- A versioned adapter contract for health, capabilities, inventory, session/client evidence, lifecycle support, and config import/export.
- States for absent, available, healthy, degraded, incompatible, and externally managed runtimes.
- A bounded compatibility experiment for both the existing local 1MCP runtime and Kiro Crew Gateway.
- A written capability matrix covering external-client attachment, identity, pool key, stateful isolation, lifecycle, resource evidence, failure containment, install footprint, licensing and rollback.
- A read-only adapter only for an engine that passes the minimum boundary; otherwise an explicit no-fit result and smallest missing contract.
- One-click setup may be proposed only after an engine passes the compatibility experiment and install source, version pinning, consent, rollback, licensing and platform behavior are specified.

Acceptance:

- CCO continues to work when the adapter or engine is missing or broken.
- UI and stored policy do not depend on 1MCP-specific names or file layout.
- A fake adapter can exercise the contract without installing any engine.
- No CCO-owned broker is proposed without code-level evidence that both evaluated engines fail the required boundary.

### F3 — Consolidate into Shared Pool

Outcome: a user can reduce duplicate eligible MCP processes safely.

In scope:

- Eligibility analysis with reasons: share candidate, must isolate, needs review, unsupported.
- Preview showing source configs, proposed shared destination, changed loading behavior, and expected resource effect as an estimate.
- Backup, fingerprint, apply, post-change health verification, transaction record, and rollback.
- Partial-failure recovery and stale-preview rejection.

Acceptance:

- No silent overwrite, deletion, credential copying to logs, or partial success reported as complete.
- Rollback restores the exact pre-change configuration when targets have not independently changed.
- Stateful browser MCPs default to excluded/isolated.

### F4 — Runtime Policy and Isolation

Outcome: a user can explicitly choose which capabilities are shared and which belong to one session.

In scope:

- Policy schema for Shared, Isolated, On-demand, Review, Quarantine, and Disabled.
- Scope and precedence rules with an effective-policy explanation.
- Conflict detection between harness config, runtime capability, and CCO policy.
- Preview of affected sessions before a policy mutation.

Acceptance:

- Every effective state names its source and precedence path.
- Unknown capability semantics default to Review, not Shared.
- Policy changes are transactional and auditable.

### F5 — Lifecycle and Resource Guardrails

Outcome: a user can recover resources without killing the wrong process or losing work unexpectedly.

In scope:

- Explicit start, graceful stop, restart, and detach where supported.
- Optional idle-stop and resource thresholds, off by default.
- Ownership checks, PID/start-time revalidation, CCO self-protection, graceful timeout, and escalation policy.
- Per-session and per-runtime memory/task trends from bounded local samples, not unlimited background telemetry.

Acceptance:

- The default remains read-only.
- Every destructive control names the exact target and consequence before confirmation.
- PID reuse, stale views, child-process churn, and unsupported runtimes fail closed.

### F6 — Runtime Security and Quarantine

Outcome: suspicious capability or runtime events can be reviewed and contained with explainable evidence.

In scope:

- Versioned IntentProbe receipt ingestion for registration-time and runtime events.
- Evidence view for subject type, decision, signal versions, redacted static spans, thresholds, and policy action.
- Manual quarantine first; any automatic action requires a later separately approved policy.
- Restore/review flow and false-positive reporting without uploading private scan contents by default.
- Optional Hugging Face model card/artifact mirror as a distribution experiment for discovery and reproducibility; CCO integration must not depend on page traction or an online scan API.

Acceptance:

- Missing, late, incompatible, or malformed receipts do not become fabricated safety verdicts.
- Raw prompts, arguments, responses, credentials, and private paths remain local and are retention-bounded.
- Quarantine is reversible and names the exact object and sessions affected.

### F7 — Hygiene Findings v2

Outcome: findings are actionable evidence, not a generic score.

In scope:

- Broken references, unreachable MCPs, stale paths, conflicting or shadowed definitions, floating package versions, command-line secret exposure, and narrowly defined semantic overlap.
- Severity, evidence, confidence, affected scope, recommended action, and reversibility for each rule.
- Suppression with reason and expiry.

Acceptance:

- Deterministic rules have fixtures for true and false cases.
- Heuristic findings are labelled and never presented as proven compromise.
- A score never hides the underlying counts and evidence.

### F8 — Context and Runtime Relationship Graph

Outcome: a user can see why a capability is present, what admission/runtime/usage evidence exists, and what a proposed change will affect.

In scope:

- A normalized graph model joining config sources, admission-manifest components, inheritance, policies, sessions, usage observations, runtime instances, MCP servers, tools, hooks, and security receipts.
- Filtered paths and blast-radius preview; the first UI can be a tree/table before a graphical canvas.

Acceptance:

- Every edge has a source, timestamp where relevant, and confidence/precision class.
- Cycles, missing nodes, and partial runtime observations render without crashing or implying certainty.
- The graph reuses canonical inventory rather than creating a second scanner.

### F9 — Headless CLI and JSON Contract

Outcome: users can automate the same evidence CCO shows in the dashboard.

In scope:

- Versioned JSON for inventory, findings, runtime snapshots, and policy checks.
- Stable exit codes, redaction rules, human summaries, schema files, and compatibility policy.
- CI examples that are read-only by default.

Acceptance:

- JSON stdout contains no progress noise; diagnostics go to stderr.
- Golden fixtures and backward-compatibility tests cover schema evolution.
- No mutating CI mode ships without a separate approved contract.

### F10 — Personal Vault and Reusable Profiles

Outcome: a user can keep a reviewed artifact inactive and later reuse it without rebuilding a bundle from memory.

In scope:

- A CCO-owned inert vault, not a fake harness scope.
- Copy-first artifact storage, settings fragments with semantic preview, and reusable project profiles.
- Secret references rather than casual duplication of credential values.

Acceptance:

- Harnesses cannot load vault contents accidentally.
- Applying a profile is idempotent, conflict-aware, transactional, and reversible.
- This packet proceeds only after fresh user validation; GitHub discussion #13 alone is not sufficient demand.

### F11 — Semantic Portability and Adapter Expansion

Outcome: users can move supported customizations without false claims of equivalence.

In scope:

- One artifact type and harness pair per sub-slice.
- Field mapping, unsupported-field preservation, semantic diff, capability gates, and copy-first behavior.
- Candidate harnesses from the public roadmap are Cursor, Windsurf, and Aider; their order requires fresh usage evidence.

Acceptance:

- Round-trip and behavior fixtures exist for every declared mapping.
- Unsupported semantics remain visible and block one-click conversion when necessary.

### F12 — Team Baselines

Outcome: a team can compare local effective state with an approved baseline while keeping local content private.

In scope:

- Signed/versioned baseline format, audit mode, drift explanation, exceptions, and CI consumption.
- Enforcement is optional and later than audit.

Acceptance:

- Personal paths, prompts, session content, and credentials are excluded from baseline exchange.
- Local exceptions and organization policy precedence are explicit.
- This packet does not redefine CCO around enterprise buyers.

## Items deliberately not promoted to core roadmap

- **Empirica-specific vectors, findings, and calibration UI:** useful inside Empirica, but not a general CCO control-plane concern. Generic runtime/context inputs may use an adapter later.
- **CLI-Anything dependency:** the underlying request for extensible actions is valid, but no dependency is accepted without a concrete CCO workflow and security contract.
- **External scanner engine marketplace:** defer until the core finding and receipt schemas are stable.
- **Automatic quarantine or automatic session killing:** not before manual workflows produce false-positive and recovery evidence.
- **Generic token meter or cost tracker as a standalone product area:** native harnesses and mature open-source tools already cover rings, quotas and historical charts. F14 exists only to normalize semantics, preserve provenance, connect observations to F13/F4 actions, and keep API-equivalent cost separate from actual subscription spend.

## Session workflow

For each packet:

1. The PM session opens the existing feature-specific Living Plan in `docs/plans/`, resolves its open requirements with Nicole, and records the decisions there.
2. Nicole explicitly approves the feature plan.
3. A fresh implementation session receives only that approved scope, relevant files, non-goals, and acceptance criteria.
4. The implementation session updates the plan with decisions and produces a bounded diff; it does not merge, publish, or widen scope by itself.
5. A QA session follows `docs/QA_PLAN.md`, records evidence, and reports pass/fail/unknown for every acceptance criterion.
6. Integration happens only after failures and unknowns are resolved or explicitly accepted by Nicole.

Every feature-session handoff must contain:

- packet ID and approved objective;
- user story and non-goals;
- exact starting branch/commit and dirty-worktree warning;
- interfaces allowed to change;
- privacy, security, reversibility, and platform constraints;
- acceptance criteria and required QA rows;
- stop conditions and unresolved product decisions;
- required documentation and evidence artifacts.

## Decision gates still requiring Nicole

These are intentionally deferred until their packet reaches planning:

- Whether CCO installs a shared-runtime engine or only guides/imports an existing installation.
- Default threshold values and whether idle-stop ever becomes opt-out.
- Retention duration for runtime samples and IntentProbe receipts.
- F14 retention duration for normalized usage observations and whether text-free aggregates survive source-log deletion.
- Whether F13 ever performs explicit active MCP schema probing or remains static/cache-only by default.
- Whether the Personal Vault has enough real demand for F10.
- Which harness follows the current four adapters.
- Which organization owns any Hugging Face model/dataset pages and what artifact subset is mirrored.

## Evidence ledger

| Evidence | Retrieved | What it supports | Limits / adverse point |
|---|---|---|---|
| `README.md`, `AI_INDEX.md`, `docs/CONTROL_PLANE_PLAN.md`, `docs/REPO_REVIEW_2026-09-11.md`, `docs/releases/v0.20.0.md` at local `39cf32f` plus frozen WIP | 2026-10-16 | Shipped claims, old roadmap, architecture, release intent, runtime prototype boundary | README contains unmerged runtime claims and stale roadmap statuses |
| GitHub issues 2, 3, 4, 6, 11, 12, 17, 27, 32, 33, 35, 37 and associated comments | 2026-10-16 | All issue demand and defect history reviewed | All are closed; no open issue is current backlog evidence |
| GitHub discussions 7, 8, 9, 10, 13 and comments | 2026-10-16 | Runtime context idea, Empirica scope decision, Personal Vault/template proposal | Discussions are old and are not proof of broad demand |
| GitHub repository/actions/releases API | 2026-10-16 | 383 stars, 33 forks, zero open issues, five discussions, v0.20 workflow state | Counts are time-sensitive |
| npm registry for `@mcpware/cross-code-organizer` | 2026-10-16 | `latest` remains 0.19.3 | Does not reveal npm account configuration |
| Publish run `38975225907` | 2026-10-16 | v0.20 tests/pack/provenance passed; npm publish returned E404 permission/not-found response | Exact npm-side misconfiguration still needs authenticated account inspection |
| Local runtime snapshot from `feat/mcp-runtime-doctor` | 2026-10-16 | Personal-machine resource and topology problem exists | One machine; socket sampling is incomplete |
| `notable-repos/1mcp-app-agent` README/source, Apache-2.0 | 2026-10-16 | First backend supports aggregation, templates, lazy/async loading, lifecycle | CCO must not inherit 1MCP as its product vocabulary or hard dependency |
| IntentProbe `README.md`, `ROADMAP.md`, `docs/V0_2_DEMO_PACK.md` on local `1716099` worktree | 2026-10-16 | Warm JSONL receipt capability and honest research-preview limits | Worktree is ahead/dirty; integration must target a versioned stable contract |
| Public primary sources linked from the feature packets, including Cline, Roo Code, Zed, Aider, Kiro Crew, Claude Code, Cursor and Kiro documentation | 2026-10-16 | Official harness matrix, open-source prior art, threat model, accounting ontology, and F13/F14 sequencing | Product landscape changes quickly; adapter claims require revalidation during implementation |
| Installed Codex `0.163.0` generated app-server schemas and Claude Code `2.1.261` local transcript key-shape inspection | 2026-10-16 | Supported local usage primitives, tool event fields, and absence of a stable exact per-tool token field in reviewed interfaces | Local schema/log formats can drift; internal-only Codex notifications are not an implementation contract |

## Change policy for this plan

- Update the `Last updated`, status, packet state, decision log, and evidence ledger whenever a product decision changes.
- Never mark a feature shipped from a code diff alone; require QA evidence and public-version verification where applicable.
- New ideas enter as evidence or an option first. They become ordered packets only after the user problem, boundary, dependency, and acceptance criteria are defined.
- If README roadmap and this document disagree, this document governs planning; README governs only public claims about a published release.

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-16 | Make CCO the user-facing product and treat 1MCP as a replaceable adapter. | Users understand the problem CCO solves; they should not need to know or install a separately branded runtime first. |
| 2026-10-16 | Prioritize individual local runtime control before enterprise baselines. | It matches the intended customer and can be built/tested by a solo developer in bounded slices. |
| 2026-10-16 | Freeze the current runtime prototype pending feature-plan approval. | It proves feasibility but mixes observation, control, backend branding, and future security work. |
| 2026-10-16 | Put release recovery before new features. | npm users still receive 0.19.3 while the repository claims v0.20 capability. |
| 2026-10-16 | Separate the roadmap into 14 implementation packets. | Each packet has one reviewable user outcome and can be handed to a fresh implementation session. |
| 2026-10-16 | Add F13 before runtime control and keep it separate from F14. | Pre-launch resolution is a bounded static user outcome; live/retrospective accounting has different sources, privacy risks, failure modes, and QA. |
| 2026-10-16 | Reject a generic token meter or session list as CCO's differentiator. | Claude, Codex, Cursor, Copilot, Kiro, Qwen, Cline, Roo, Zed, Junie, Factory and open-source dashboards already commoditize those surfaces. |
