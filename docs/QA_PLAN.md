# CCO Product QA Plan

Last updated: 2026-10-16 PT
Owner: Nicole (risk acceptance) + feature QA session (evidence)
Status: **Draft paired with `docs/LIVING_PLAN.md`**

This plan defines the minimum evidence required before a CCO feature can be integrated and the additional evidence required before it can be described as shipped. It does not authorize implementation, merging, publishing, or destructive live-machine tests.

## Release rule

A feature is ready for integration only when all three are true:

1. Its approved requirements and non-goals are traceable to tests or inspected evidence.
2. Every required QA row is PASS, or Nicole explicitly accepts a documented residual risk.
3. Package, privacy, security, platform, and documentation checks appropriate to the change pass.

A feature is shipped only after the final release checklist also passes, including installation and smoke testing of the exact public artifact after publication.

Passing unit tests alone is not release evidence. A green test suite on an unpublished tag is not a shipped release.

## Required evidence bundle per feature

Each QA session produces one dated Markdown report under `docs/qa/` containing:

- feature packet ID, approved plan link, branch, commit, and dirty-worktree state;
- environment matrix and exact commands;
- acceptance-criterion table with `PASS`, `FAIL`, or `UNVERIFIED`;
- test counts and failures, including intentionally skipped cases and reasons;
- screenshots only for visual behavior that DOM assertions cannot establish;
- privacy/data-flow review and secret-leak checks;
- mutation, rollback, stale-state, and partial-failure evidence where applicable;
- resource measurements for runtime/background work;
- package contents, install smoke, and documentation-claim comparison;
- unresolved risks and the smallest next action.

## Core QA matrix

Every feature selects all applicable rows; `N/A` requires a reason.

| Area | Required checks |
|---|---|
| Requirements | Every acceptance criterion maps to code/test/evidence; no unapproved adjacent feature entered the diff. |
| Regression | Targeted unit tests, affected E2E flows, then full unit/E2E suites before integration. |
| Privacy | Enumerate every value crossing process/API/UI/storage boundaries; verify redaction, retention, opt-in, and no content upload. |
| Local security | Loopback/host/origin checks, path allowlists, symlink boundaries, body limits, command construction, dependency audit, and no secret-bearing logs. |
| Reversibility | Preview fingerprint, stale-preview rejection, exact backup, apply result, undo, edited-target refusal, and partial-failure recovery. |
| Process safety | Same-user ownership, PID start identity, executable/harness identity, CCO self-protection, PID reuse, disappearing process, and graceful timeout. |
| Resource use | Idle and loaded CPU/RSS, sampling interval, number of child processes, cgroup/task pressure where available, bounded storage, and shutdown cleanup. |
| Platform | Linux native, macOS, Windows native, and WSL according to declared support; unsupported behavior is explicit and safe. |
| UX/accessibility | Keyboard path, focus, labels, empty/loading/error/partial states, narrow viewport, high-data volume, confirmation copy, and no backend jargon in normal mode. |
| Concurrency | Multiple browser tabs, overlapping scans, config changed between preview/apply, simultaneous sessions, and server restart. |
| Compatibility | No shared runtime, supported runtime, incompatible version, unhealthy runtime, mixed direct/shared MCPs, and older stored transactions/policies. |
| Accounting | Keep active context, cumulative processed input, cache, output, reasoning, quota, credits and cost authority separate; preserve source, unit, precision, timestamp and completeness. |
| Packaging | `npm pack --dry-run`, allowlisted files, clean tarball install, Node support range, CLI flags, dashboard start, and no research/cache/secret artifacts. |
| Documentation | README, privacy notice, schemas, help text, release notes, and UI agree with observed behavior; no WIP claim appears as shipped. |
| Supply chain | `npm audit --omit=dev`, pinned release actions, provenance, registry version agreement, and post-publish install verification. |

## Standard test environments

Use fixtures or disposable test homes for mutations. Do not modify Nicole's active harness configuration merely to obtain QA evidence.

Minimum scenarios:

- zero, one, five, and high-count concurrent sessions;
- two or more independently launched harness families that CCO did not start;
- zero MCPs, direct-only MCPs, shared-only MCPs, and mixed topology;
- sharing scopes represented separately: session, extension host, project, app runtime, OS-user pool, and remote service;
- duplicate stateless MCPs and distinct stateful browser MCPs;
- no runtime engine, healthy engine, unhealthy engine, incompatible engine, and engine disappearing during refresh;
- no IntentProbe, installed but stopped, warm scanner ready, malformed/late receipt, and version mismatch;
- clean paths, spaces/unicode, symlinks, Windows drive paths, UNC paths, stale paths, and permission errors;
- empty, normal, and high-volume inventories;
- admission fixtures with nested/cyclic/missing imports, shadowed scopes, always-on/catalog/on-demand/event-triggered inputs, hidden vendor content, and multiple count methods;
- usage fixtures with cache snapshots, duplicate events, retries, compaction, model changes, interrupted turns, missing final usage, and schema drift;
- clean shutdown and forced interruption during each transaction phase.

Real-machine observation may supplement fixtures for resource accuracy. Destructive controls on live sessions require a separate, explicit test target and confirmation; they are never inferred from approval of this plan.

## Packet-specific QA gates

### P0 — Release recovery

- Confirm the exact npm trusted-publisher package, organization, repository, workflow filename, and environment tuple through authenticated npm UI/API evidence.
- Verify the release job uses OIDC and does not fall back to a long-lived token.
- Re-run only the intended version; verify idempotency if npm or MCP Registry already contains it.
- Verify npm version/dist-tag, MCP Registry version, GitHub Release, provenance, checksums, and clean install output.
- Compare the installed tarball behavior with release notes and README.

### F1 — External Runtime Reality Map

- Synthetic `/proc`/process fixtures cover parent churn, PID reuse, zombie/disappearing processes, unrelated same-name commands, and multiple users.
- Compare reported RSS/process/thread counts with an independent OS command on a bounded fixture.
- Verify measured/declared/inferred/unknown labels, owner scope, and short-lived socket limitations.
- Cover Cline's shared Hub plus session-built MCP managers, Roo's extension-host singleton, Zed's project store and a Kiro Crew multiplexed runtime; no fixture may reduce these to the same Boolean `shared` state.
- Verify a shared PID/tree is measured once in host totals. Any per-session split is labelled attribution and does not multiply process/MCP counts by tenant count.
- Verify the map remains useful when every session was launched outside CCO and no runtime engine adapter is installed.
- Browser receives no command lines, environment variables, raw sockets, private paths, or secret values.
- Refresh, error, empty, high-count, and unsupported-platform UI states pass DOM and accessibility checks.

### F13 — Session Admission Preview

- Golden fixtures cover each supported harness/cwd/profile/model tuple, source scope, precedence rule, effective/shadowed item, and load mode.
- Resolve nested imports, cycles, duplicates, missing targets, symlinks, unicode/spaces, Windows/UNC paths, permission failures and path escape without duplicate counting.
- Verify every number exposes its tokenizer or heuristic, model assumption, confidence and freshness; incompatible methods are not silently summed.
- Verify visible subtotal, hidden vendor content, unavailable runtime additions and unsupported adapter fields remain distinct.
- Default preview starts no agent, hook or MCP child process, performs no network request, and writes no harness configuration.
- Scenario-diff arithmetic matches component changes and produces no real mutation; any later action handoff keeps preview/fingerprint/rollback boundaries.
- Browser/API/storage payload review proves that secret values, environment values and private file bodies are excluded.

### F14 — Action-linked Context Evidence

- Frozen fixtures for the minimum harness pair required by the approved F1/F13 case reconcile active context, per-request/turn usage and cumulative usage independently against native source records.
- Test input, net-new input, cache read, cache write, output, reasoning and total under both subset and additive provider semantics; reject double counting.
- Test duplicate snapshots, partial streams, retries, compaction, retained/dropped context, model switches, interrupted turns, missing final events, rotated logs and unsupported schema versions.
- Every observation includes harness/adapter version, session/turn/request identity where available, model, timestamp, source, unit, precision and completeness.
- Per-tool/MCP cases distinguish native exact, payload estimate, request association, derived amplification and unavailable; copy and UI never call association an exact marginal bill.
- API-list-price estimate, provider estimate, subscription quota, internal credits and actual billed money remain separate labels and fields.
- Verify no OAuth credential reuse, private API dependency, TLS interception, or raw prompt/source/command/tool payload persistence.
- High-session and long-log fixtures meet pre-approved scan latency, CPU, RSS and storage budgets; incremental refresh does not rescan unmodified history without reason.
- The QA report names the F1/F13 finding or approved action that requires each metric family and demonstrates why native UI alone is insufficient; an unlinked dashboard or history chart fails scope review.

### F2 — Runtime Engine Compatibility

- Contract tests run against fake absent, available, healthy, degraded, incompatible, externally managed, and crashing adapters.
- Run the same external-attachment, identity, isolation, lifecycle, failure and rollback cases against pinned Kiro Crew Gateway and local 1MCP; record PASS, FAIL or UNVERIFIED per case with source/runtime evidence.
- Kiro Crew- or 1MCP-specific fields do not leak into generic stored policy or ordinary UI.
- Adapter timeout/crash cannot block the main inventory or leave orphan processes.
- Version/capability negotiation has explicit compatibility fixtures.
- Absence or installation failure of either engine leaves F1 inventory operational.
- A CCO-owned broker implementation in the diff is an automatic scope failure.

### F3 — Consolidate into Shared Pool

- Golden previews cover eligible, isolate, review, unsupported, conflicting, and already-shared cases.
- Apply and rollback run against disposable real config trees for every supported harness/path type.
- Inject failure before backup, after backup, midway through writes, during health verification, and during rollback.
- Verify no credential value appears in logs, UI, transaction metadata, or snapshots.
- Prove stateful browser MCPs are excluded by default.

### F4 — Runtime Policy and Isolation

- Truth-table tests cover every policy state, scope, precedence collision, default, and unsupported capability.
- Effective-policy explanation identifies the winning source.
- Stale policy edits and concurrent writers return conflicts instead of overwriting.
- Policy migration/versioning and unknown future enum values fail safely.

### F5 — Lifecycle and Resource Guardrails

- Test exact-target confirmation, same-user checks, PID/start-time revalidation, self-tree refusal, graceful stop, timeout, and disappearing target.
- Idle detection uses controlled clocks and activity fixtures; defaults remain off.
- Threshold crossing, hysteresis, cooldown, restart loop prevention, and storage bounds are tested.
- Measure monitor overhead at idle and with high session count.

### F6 — Runtime Security and Quarantine

- Validate IntentProbe receipt schema/version, redaction, ordering, deduplication, retention, replay, malformed input, and late delivery.
- Verify missing receipts display `unknown`, never `allow`.
- Quarantine preview/apply/restore covers active use, concurrent policy changes, partial failure, and target edits.
- Run known clean, warn, and block fixtures; report false-positive/false-negative evidence without overstating security guarantees.
- If Hugging Face artifacts are published, verify model card, license, checksums, artifact/version mapping, download path, and offline fallback.

### F7 — Hygiene Findings v2

- Each deterministic rule has positive, negative, boundary, and platform fixtures.
- Heuristic rules include confidence labels and a reviewed false-positive set.
- Suppression reason, expiry, scope, and reappearance after expiry are tested.
- Score arithmetic exactly reconciles with visible findings.

### F8 — Relationship Graph

- Graph fixtures cover cycles, missing nodes, duplicate identities, partial observations, stale edges, and high node counts.
- Every edge resolves to evidence and confidence; blast-radius results match a direct traversal oracle.
- Keyboard and non-visual alternatives expose the same information as any graphical view.

### F9 — Headless CLI and JSON

- JSON Schema validation, golden output, stdout/stderr separation, stable exit codes, redaction, and deterministic ordering.
- Compatibility tests read at least one prior schema version.
- CI fixtures cover clean, warning, failure, unsupported, and internal-error outcomes.
- Headless mode performs no mutation unless a future separately approved contract adds it.

### F10 — Personal Vault and Reusable Profiles

- Prove vault paths are outside every harness discovery root and remain inert.
- Copy/apply/remove/rollback tests cover conflicts, missing references, secret references, idempotency, and edited targets.
- Settings-fragment merges use semantic fixtures for arrays, nested objects, deletion, ordering, and unsupported keys.

### F11 — Semantic Portability and Adapter Expansion

- Each harness-pair/artifact-type slice has field mapping, unsupported-field, semantic-diff, round-trip, and behavior fixtures.
- Inventory-only adapters cannot expose unsupported mutation controls.
- Source remains unchanged unless the approved operation explicitly says otherwise.

### F12 — Team Baselines

- Baseline schema/version/signature verification, drift, exception, expiry, precedence, and offline behavior.
- Inspect exchanged payloads to prove exclusion of prompts, sessions, paths, credentials, and private content.
- Audit mode and enforcement mode remain distinguishable in API, UI, and exit codes.

## Visual QA rule

Use DOM assertions and accessibility inspection for behavior. Capture screenshots only for layout, hierarchy, overflow, color, responsive behavior, or visual ambiguity. A visual pass must inspect at least desktop and narrow widths, long names, large counts, error states, and mixed runtime topology.

## Performance budgets

Each runtime feature plan must set numeric budgets before implementation. At minimum record:

- cold and warm snapshot latency;
- idle and active CPU;
- CCO RSS excluding managed MCP/runtime processes;
- additional child-process count;
- bytes retained per hour/day;
- maximum scan/refresh concurrency;
- shutdown time and orphan-process count.

The PM session chooses acceptable thresholds after the F1 baseline measurement. QA must not invent passing thresholds after seeing results.

## QA stop conditions

Stop integration and return to the feature plan when:

- observed behavior requires a new product decision;
- a mutation cannot be made stale-safe or recoverable;
- secrets or private content cross an undocumented boundary;
- backend-specific behavior leaks into the generic product contract;
- unsupported platforms appear to work but are untested;
- the feature materially increases idle resource use without an approved budget;
- documentation needs caveats that contradict the promised user outcome.

## Final release checklist

- Approved feature plan and completed QA report exist.
- Full unit and E2E suites pass from a clean checkout.
- Dependency and code-scanning results are reviewed.
- Packed artifact contents and clean-install smoke pass.
- Version metadata, release notes, README, translations selected for the release, privacy notice, schemas, and UI copy agree.
- Published npm, MCP Registry, GitHub Release, provenance, and checksums are verified.
- The installed public artifact is tested, not merely the repository checkout.
- Only then may the feature be marked shipped in `docs/LIVING_PLAN.md` and public roadmap copy.
