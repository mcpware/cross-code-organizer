# AI Index for Claude Code Organizer

This file is the canonical high-signal map of the repository for future coding agents. It is meant to let an AI reason about the repo without rereading every tracked file.

If this file conflicts with implementation, trust runtime code in `src/` and behavior asserted in `tests/`. Marketing docs and translated READMEs drift.

## 1. What This Repo Is

Claude Code Organizer (CCO) is a local-first desktop/web utility plus MCP server for inspecting and organizing Claude Code configuration across scopes.

Primary user-facing capabilities:
- Scan Claude Code assets across global and project scopes
- Show effective configuration/memory inheritance
- Move/delete selected item types between scopes
- Preview config files and sessions
- Estimate context budget for always-loaded vs deferred content
- Audit MCP servers for suspicious descriptions or drift
- Expose a smaller MCP tool interface for AI clients

The npm entrypoint is `bin/cli.mjs`. Runtime is plain Node.js ESM, no framework. The UI is static HTML/CSS/JS served by a custom HTTP server in `src/server.mjs`.

## 2. Trust Order

When deciding what is true, use this order:

1. `src/scanner.mjs`, `src/mover.mjs`, `src/server.mjs`, `src/effective.mjs`, `src/security-scanner.mjs`
2. `src/ui/app.js` for actual UI behavior
3. `tests/e2e/dashboard.spec.mjs` and `tests/unit/*.mjs`
4. `README.md`
5. `llms.txt`, translated READMEs, `CONTRIBUTING.md`, `PRIVACY.md`

Important drift:
- Drag-and-drop is advertised in docs but is disabled in the UI.
- "Undo every action" is overstated. UI undo is best-effort restore, not history-backed.
- `src/history.mjs` exists but is currently unused.
- Some translated READMEs still mention older test counts and older wording.
- `server.json` version metadata lags `package.json`.

## 3. Product Architecture

Flow:

1. `bin/cli.mjs` starts dashboard mode or MCP server mode.
2. Dashboard mode launches `src/server.mjs`, optionally opens a browser, and auto-installs a global `/cco` skill under `~/.claude/skills/cco/SKILL.md`.
3. `src/server.mjs` serves the static UI and JSON APIs.
4. `src/scanner.mjs` inventories Claude Code assets across scopes.
5. `src/mover.mjs` performs file/config mutations.
6. `src/effective.mjs` computes effective items shown in UI.
7. `src/security-scanner.mjs` and `src/mcp-introspector.mjs` handle MCP security analysis.
8. `src/tokenizer.mjs` estimates token usage for context budget views.

No database is used. State is discovered live from the filesystem plus some browser-local UI state and cached security results.

## 4. Scope Model

CCO works with:
- `global`: the user's `~/.claude` scope
- project scopes: derived from `~/.claude/projects/*` and decoded back to repo paths

Important implementation detail:
- Every discovered project scope gets `parentId: "global"` in scanner output.
- The sidebar "tree view" is visual, reconstructed from filesystem ancestry in the client.
- Effective inheritance is not the same as the sidebar tree.

Effective behavior is defined in `src/effective.mjs`:
- `memory`: global + ancestor/project memories can apply
- `config`: global + ancestor/project config can apply
- `skill`: global skills participate in project scopes
- `mcp`: global MCP servers participate unless shadowed by same-name project server
- `agent`: global agents participate unless shadowed by same-name project agent
- `command`: same-name global/project command conflicts are surfaced
- `hook`: no effective-rule helper; hooks are shown from scan results, not merged by `effective.mjs`
- global scope only sees its own items

## 5. Categories and Storage Rules

Categories scanned by `src/scanner.mjs`:

| Category | Global source | Project source | Movable | Deletable | Notes |
| --- | --- | --- | --- | --- | --- |
| memory | `~/.claude/memory` | `settings.autoMemoryDirectory` or `~/.claude/projects/<encoded>/memory` | yes | yes | ignores `MEMORY.md`; frontmatter parsed |
| skill | `~/.claude/skills` and managed dir | `<repo>/.claude/skills` | yes | yes | skips `private`; supports symlinks; bundle detection |
| mcp | `~/.claude/.mcp.json`, `~/.mcp.json`, managed file, `~/.claude.json`, settings files | `<repo>/.mcp.json`, project settings, project entry in `~/.claude.json` | yes | yes | move/delete semantics are asymmetric for `.claude.json`-backed project entries |
| config | `~/.claude/CLAUDE.md`, `settings*.json`, managed files | `<repo>/CLAUDE.md`, `<repo>/.claude/CLAUDE.md`, project settings | no | no | shown as locked |
| hook | hook arrays inside settings JSON | hook arrays inside project settings JSON | no | no | shown as locked flattened entries |
| plugin | `~/.claude/plugins/cache/*/*` | none | no | no | global only |
| plan | `plansDirectory` or `~/.claude/plans` | `~/.claude/projects/<encoded>/plans` | implementation says yes, destinations say no | yes | code/docs are inconsistent |
| rule | `~/.claude/rules` | `<repo>/.claude/rules` | UI/server treat as movable, destinations say no | yes | code/docs are inconsistent |
| command | `~/.claude/commands` | `<repo>/.claude/commands` | yes | yes | name conflicts matter in effective mode |
| agent | `~/.claude/agents` | `<repo>/.claude/agents` | yes | yes | project same-name shadows global |
| session | none | `.jsonl` files under project Claude dir | no | yes | preview extracts title + recent user message |

## 6. Runtime File Map

### Entrypoints

- `bin/cli.mjs`
  - CLI entrypoint
  - `--mcp` starts MCP server mode
  - dashboard mode checks `~/.claude`, auto-installs `/cco` skill, checks npm for updates, starts HTTP server, and tries to open browser

### Core Runtime

- `src/scanner.mjs`
  - central inventory engine
  - resolves encoded project paths with backtracking to handle dash/underscore ambiguity
  - collects scopes and items across all supported categories
  - parses settings overrides and several MCP config locations
  - scans in parallel per category

- `src/mover.mjs`
  - mutation layer for move/delete
  - computes destination paths per category
  - edits JSON MCP files or moves files/directories on disk
  - knows project file layout under `<repo>/.claude/*` and project-private storage under `~/.claude/projects/<encoded>/*`

- `src/server.mjs`
  - plain Node HTTP server
  - exposes all dashboard APIs
  - computes context budget
  - hosts security scan endpoints and SSE heartbeat
  - serves UI assets and browserified `effective.mjs`
  - auto-shuts down when no clients remain

- `src/effective.mjs`
  - pure logic for effective item calculation
  - shared by browser and unit tests
  - exports `EFFECTIVE_RULES`, `getAncestorScopes`, `computeEffectiveSets`, `getEffectiveItems`

- `src/security-scanner.mjs`
  - static MCP security scanner
  - deobfuscation + regex/pattern scan + baseline diff + optional `claude -p` judge
  - stores baselines at `~/.claude/.cco-security/baselines.json`

- `src/mcp-introspector.mjs`
  - introspects MCP servers over stdio or HTTP POST
  - hashes tool definitions to compare against cached baselines
  - concurrency-limited

- `src/tokenizer.mjs`
  - token counting abstraction
  - uses optional `ai-tokenizer` when available
  - falls back to bytes/4 heuristic

- `src/mcp-server.mjs`
  - MCP interface for CCO itself
  - separate from the HTTP dashboard server
  - exposes inventory/mutation/security tools for external AI clients

- `src/history.mjs`
  - backup/history module using JSONL manifest under `~/.claude/.config-history`
  - currently not imported anywhere in runtime
  - treat as dormant/unintegrated code

### Frontend

- `src/ui/index.html`
  - three-panel shell plus modals, bulk bar, toast, security panel, context-budget panel
  - loads fonts and `app.js`
  - opens `/heartbeat` EventSource to keep server alive while tab exists

- `src/ui/app.js`
  - entire client application
  - fetches scan data, maintains filters/search/selection/expanded UI state
  - renders scopes/categories/items/detail/security/context budget
  - handles move/delete/bulk/export/security actions
  - contains disabled drag-and-drop setup functions with early returns

- `src/ui/style.css`
  - full dashboard styling
  - supports dark mode via `.dark`
  - includes styling for disabled drag/drop remnants and security panel
  - references some undefined CSS vars in security styles (`--fg`, `--fg2`, `--fg3`, `--bg2`)

## 7. HTTP API in `src/server.mjs`

Main routes:

- `GET /api/version`
- `GET /api/scan`
- `GET /api/context-budget?scope=<id>&limit=<n>`
- `POST /api/move`
- `POST /api/delete`
- `GET /api/destinations`
- `POST /api/restore`
- `POST /api/restore-mcp`
- `GET /api/file-content`
- `GET /api/session-preview`
- `GET /api/browse-dirs`
- `POST /api/export`
- `GET /api/security-status`
- `POST /api/security-scan`
- `POST /api/security-rescan`
- `GET /api/security-baseline-check`
- `GET /api/security-cache`
- `POST /api/security-cache`

Important API behavior:
- `GET /api/context-budget` recursively expands `@import` in `CLAUDE.md` up to depth 5 and strips HTML comments.
- Context budget uses heuristics, not exact Claude internals:
  - system loaded: 18000
  - system deferred: 7000
  - skill boilerplate: 400 if any skills exist
  - MCP overhead: unique server count x 3100
  - `CLAUDE.md` wrapper: 100
  - auto-compact buffer: 33000
- `GET /api/file-content` path check is broad: any path under HOME is allowed, not just scanned repo paths.
- Undo/restore routes use client-captured snapshots, not `src/history.mjs`.

## 8. MCP Server Surface in `src/mcp-server.mjs`

Tools exposed:
- `scan_inventory`
- `move_item`
- `delete_item`
- `list_destinations`
- `audit_security`

Notes:
- Server caches the most recent scan in memory.
- Tool schemas are independent from the dashboard HTTP API.
- MCP mode does not perform browser/dashboard setup from `bin/cli.mjs`.

## 9. UI Behavior in `src/ui/app.js`

State model includes:
- scan data and counts
- selected scope/item
- search/filter/category toggles
- show-effective mode
- tree view vs flat view
- bulk selection
- drag/delete modal state
- security result cache
- context-budget panel state

Behavior that matters:
- Initial selection prefers the deepest scope with items.
- Tree view is visual only; do not infer effective inheritance from it.
- Effective mode explains "why it applies" using `effective.mjs`.
- Session preview is rendered as a chat transcript excerpt.
- Security panel groups findings by server and lets the user jump back to the MCP item.
- Move button may still appear for item kinds whose destination list is empty.
- Locked items open explanatory/prompt flows rather than performing mutations.
- Drag-and-drop functions exist but are currently short-circuited.

## 10. Mutation Semantics and Edge Cases

Known mutation rules from `src/mover.mjs` and tests:

- File-backed categories move by filesystem move/copy semantics.
- Project command/agent/rule/skill destinations live under `<repo>/.claude/...`.
- Project memory and plan destinations live under `~/.claude/projects/<encoded>/...`.
- Project MCP destination is always `<repo>/.mcp.json`.
- MCP move can read from project entries embedded in `~/.claude.json`, but destination normalization writes to `.mcp.json`.
- MCP delete only handles top-level `mcpServers` in the owning JSON file; deleting project MCP entries stored inside `~/.claude.json.projects[repoDir].mcpServers` is not fully symmetric.
- `sharesGlobalClaudeDir(scope)` avoids moves that would collapse distinct scopes into the same `.claude` directory.

## 11. Security Scanner Details

`src/security-scanner.mjs` implements four layers:

1. Deobfuscation
2. Pattern-based detection
3. Tool baseline diffing
4. Optional LLM judgment via local `claude -p`

Deobfuscation covers:
- zero-width chars
- tag chars
- variation selectors
- bidi controls
- HTML comments
- Unicode normalization
- base64-like decoding
- escaped sequences
- separate leetspeak pass in scanning

Scanner output highlights:
- prompt injection
- tool poisoning
- data exfiltration
- credentials/secrets access
- command execution
- suspicious hooks/persistence
- toolset drift vs baseline

Important gaps:
- Hook scanning branch is effectively dead because scanned hook items do not carry the `mcpConfig` field the scanner expects.
- Cross-server reference detection exists in code comments/history but is intentionally disabled due false positives.
- Baseline check mainly surfaces new/changed tool sets; changed descriptions without tool-hash changes are not a separate concept.

## 12. Context Budget Model

`GET /api/context-budget` approximates what Claude Code loads into context.

It accounts for:
- configs (`CLAUDE.md`, settings)
- rules
- skills
- MCP server configs
- `MEMORY.md` excerpt
- fixed system overhead

It classifies content into:
- always loaded
- deferred/on-demand
- summarized totals for 200K and 1M context windows

This is an estimation engine. It is useful for relative comparisons but not a formal Claude runtime guarantee.

## 13. Test Suite as Behavioral Spec

### Unit Tests

- `tests/unit/test-effective-rules.mjs`
  - effective rule semantics and shadowing/conflict behavior

- `tests/unit/test-edge-cases.mjs`
  - scanner/path/effective edge cases

- `tests/unit/test-move-destinations.mjs`
  - destination validity for supported item kinds

- `tests/unit/test-path-correctness.mjs`
  - project path encoding/decoding correctness

### End-to-End

- `tests/e2e/dashboard.spec.mjs`
  - main executable spec
  - spins up a temporary HOME and real CLI process
  - covers API responses, mutations, restore flows, sidebar, effective mode, export, context budget, security scan UI/API, scanner correctness, path traversal resistance, category parity, new categories, sessions, and visual tree behavior

- `tests/e2e/playwright.config.mjs`
  - chromium-only, single worker, headless by default

### Manual/Stale QA Scripts

- `tests/pw-fix-prompt.cjs`
- `tests/pw-published-smoke.cjs`
- `tests/pw-qa.cjs`
- `tests/pw-scanner-upgrade.cjs`
- `tests/pw-windows-fix.cjs`

These are ad hoc QA helpers. Some reference stale selectors or older UI structure and should not be treated as authoritative specs.

## 14. Docs and Metadata

Canonical docs:
- `README.md`: primary user-facing documentation and install guide
- `AI_INDEX.md`: this file, canonical AI map

Support docs:
- `CONTRIBUTING.md`: useful structure overview, but outdated in places
- `PRIVACY.md`: local-first/privacy claims; CDN note is stale
- `llms.txt`: short AI-facing summary; terse and partially drifted

Metadata/config:
- `package.json`: package metadata, scripts, dependency truth
- `package-lock.json`: generated lockfile
- `.mcp.json`: local MCP config example
- `server.json`: registry metadata, version currently stale
- `glama.json`: listing metadata
- `Dockerfile`: minimal MCP-only container entrypoint
- `.gitignore`, `.npmignore`: important for distribution boundaries
- `LICENSE`: MIT

Translated READMEs:
- `README.es.md`
- `README.id.md`
- `README.it.md`
- `README.ja.md`
- `README.ko.md`
- `README.pt-BR.md`
- `README.th.md`
- `README.tr.md`
- `README.vi.md`
- `README.zh-CN.md`
- `README.zh-HK.md`
- `README.zh-TW.md`

Treat them as user-facing translations of `README.md`, not canonical implementation docs.

## 15. Plugin and Skill Packaging

Repo includes both an installed-skill path and Claude plugin metadata:

- `skills/organize/SKILL.md`
  - skill shipped in repo form

- `.claude-plugin/plugin.json`
- `.claude-plugin/settings.json`
- `.claude-plugin/.mcp.json`
- `.claude-plugin/skills/organize.md`
  - plugin packaging metadata and mirrored skill docs

`bin/cli.mjs` separately auto-installs a global `/cco` skill in the user's home Claude directory on dashboard startup.

## 16. Research Area

Purpose:
- Benchmarks and writeup for MCP tool-poisoning detection work that informed the security scanner and related experiments

Files:
- `research/activation-probe-tool-poisoning.md`
  - narrative report of experiments comparing text methods vs activation probes

- `research/benchmark-mcptox.mjs`
  - benchmarks CCO scanner against MCPTox poisoned descriptions
  - note: imports `research/src/security-scanner.mjs`, which does not exist in this repo layout; path appears broken/stale
  - note: hardcoded dataset path points outside repo

- `research/reproduce-experiments.ipynb`
  - notebook covering:
    - scanner vs MCPTox
    - activation probe on MCPTox
    - adversarial attempts to break TF-IDF
    - same-vocabulary intent-pair experiments
    - scaled 100-pair experiment with Sentence-BERT and length control

- `research/datasets/README.md`
  - dataset inventory

Included dataset files:
- `adversarial_poisoned.json`: 30
- `adversarial_poisoned_v2.json`: 30
- `adversarial_poisoned_v3.json`: 30
- `hard_clean.json`: 30
- `hard_poisoned.json`: 30
- `hard_v2_clean.json`: 20
- `hard_v2_clean_no_reassurance.json`: 20
- `hard_v2_poisoned.json`: 20
- `hard_v3_clean.json`: 100
- `hard_v3_matched_clean.json`: 8
- `hard_v3_matched_poisoned.json`: 8
- `hard_v3_poisoned.json`: 100
- `mcptox_clean_descriptions_labeled.json`: 362
- `mcptox_poisoned_descriptions_labeled.json`: 485
- `neutral_clean.json`: 15
- `neutral_poisoned.json`: 15

These JSON files are plain arrays of labeled examples used by the notebook and writeup. They are not part of app runtime.

## 17. Visual Assets

Tracked media under `docs/` are screenshots/demo assets for README/docs:
- `docs/3panel.png`
- `docs/cptoken.png`
- `docs/demo.gif`
- `docs/reloaded mcp form diff scope.png`
- `docs/repeateditem.png`
- `docs/securitybutton.png`
- `docs/securitypanel.png`

Treat them as illustrative assets, not implementation inputs.

## 18. Known Mismatches, Dead Code, and Risks

High-value discrepancies:

- `src/history.mjs` is unused while docs imply a real undo/history system.
- Drag-and-drop code remains in CSS/JS, but `initSortable()` and drop-zone setup return early, so DnD is disabled.
- `CONTRIBUTING.md` says core logic is in scanner/mover, but `src/server.mjs` now contains major business logic for context budget and security caching/routes.
- `PRIVACY.md` mentions SortableJS via CDN, but current HTML has no SortableJS include.
- `llms.txt` still claims drag-and-drop and full undo as active core behavior.
- `server.json` version (`0.10.2`) lags `package.json` (`0.14.13`).
- `src/security-scanner.mjs` hook scan path is effectively unreachable.
- `src/server.mjs:isPathAllowed` is broader than necessary.
- `src/mover.mjs` comments and destination behavior disagree on plan/rule mobility.
- CSS in `src/ui/style.css` references undefined security color vars.
- Some Playwright helper scripts target stale selectors.
- `research/benchmark-mcptox.mjs` appears stale/broken relative to current repo layout.

## 19. Distribution Boundaries

Published npm package intentionally excludes:
- tests
- docs media
- plugin packaging files
- translated READMEs
- many metadata/support files

See `.npmignore` for exact boundaries. The Docker image is minimal and runs MCP mode only:

```dockerfile
CMD ["node", "bin/cli.mjs", "--mcp"]
```

## 20. What a Future AI Usually Does Not Need to Re-read

Usually safe to rely on this index for:
- high-level architecture
- category/storage rules
- entrypoints and major runtime responsibilities
- known drift/dead code
- test coverage map
- research asset inventory

Re-read source when changing:
- scanning or path resolution: `src/scanner.mjs`, related unit tests
- move/delete semantics: `src/mover.mjs`, e2e mutation tests
- effective inheritance: `src/effective.mjs`, `tests/unit/test-effective-rules.mjs`
- context budget: `src/server.mjs`, context-budget e2e tests
- security scan logic: `src/security-scanner.mjs`, security e2e tests
- frontend interaction: `src/ui/app.js`, `src/ui/index.html`, `src/ui/style.css`

## 21. Fast File Checklist

If you need a minimal reread set, start here:

1. `package.json`
2. `bin/cli.mjs`
3. `src/scanner.mjs`
4. `src/mover.mjs`
5. `src/server.mjs`
6. `src/effective.mjs`
7. `src/security-scanner.mjs`
8. `src/ui/app.js`
9. `tests/e2e/dashboard.spec.mjs`
10. `tests/unit/test-effective-rules.mjs`

That set covers most real behavior.
