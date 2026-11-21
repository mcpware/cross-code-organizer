# AI_INDEX.md

## How to use this file
- Navigation only. Not source of truth.
- Read actual source files before making any claim.
- If this conflicts with runtime code, trust `src/` first.

---

## Entry point

### CLI bootstrap
- Entry: `bin/cli.mjs`
- Search: `dashboard`, `mcp`, `autoOpen`, `installSkill`
- Connects to:
  - Dashboard mode — starts `src/server.mjs`
  - MCP mode — starts `src/mcp-server.mjs`

---

## Backend domains

### Harness adapter framework
- Contract: `src/harness/interface.mjs`
- Registry: `src/harness/registry.mjs`
- Shared scanner helpers: `src/harness/scanner-framework.mjs`
- Adapters:
  - Claude Code — `src/harness/adapters/claude.mjs`
  - Codex CLI — `src/harness/adapters/codex.mjs`
  - OpenCode — `src/harness/adapters/opencode.mjs`
  - DeepSeek Harness — `src/harness/adapters/dsh.mjs`
- Search: `validateAdapter`, `registerAdapter`, `listAdapters`, `scanHarness`
- Tests: `tests/unit/test-codex-adapter.mjs`, `tests/unit/test-opencode-adapter.mjs`, `tests/unit/test-dsh-adapter.mjs`
- Connects to:
  - Server — selects one adapter per request and exposes its capabilities
  - Scanner — adapter scanners return the shared inventory shape
  - Frontend — harness selector and capability-gated actions

### Scanner (discovery engine)
- Entry: `src/scanner.mjs`
- Search: `scanAll`, `scanScope`, `discoverProjects`, `CATEGORIES`
- Tests: `tests/unit/test-edge-cases.mjs`, `tests/unit/test-path-correctness.mjs`
- Connects to:
  - Server — called by `GET /api/scan` in `src/server.mjs`
  - Mover — provides item metadata for move/delete in `src/mover.mjs`
  - Context budget — provides item counts for `GET /api/context-budget`

### Mover (mutation layer)
- Entry: `src/mover.mjs`
- Search: `moveItem`, `deleteItem`, `validateMove`, `getValidDestinations`
- Tests: `tests/unit/test-move-destinations.mjs`
- Connects to:
  - Server — called by `POST /api/move`, `POST /api/delete` in `src/server.mjs`
  - MCP server — exposed as `move_item`, `delete_item` tools in `src/mcp-server.mjs`

### Effective mode (category-level resolution)
- Entry: `src/effective.mjs`
- Search: `computeEffective`, `EFFECTIVE_RULES`, `shadowedBy`
- Tests: `tests/unit/test-effective-rules.mjs`
- Connects to:
  - Server — called during scan enrichment in `src/server.mjs`
  - Frontend — badges rendered in `src/ui/app.js`

### HTTP server
- Entry: `src/server.mjs`
- Cross-platform path boundary checks: `src/path-security.mjs`
- Search: `createServer`, `/api/scan`, `/api/move`, `/api/delete`, `/api/save-markdown`, `/api/context-budget`, `/api/security-scan`, `/api/runtime-doctor`, `/api/file-content`, `/api/session-preview`, `/api/export`
- Tests: `tests/e2e/dashboard.spec.mjs`
- Connects to:
  - Scanner — inventory via `scanAll()`
  - Mover — mutations via `moveItem()`, `deleteItem()`
  - Security — via `src/security-scanner.mjs`, `src/mcp-introspector.mjs`
  - Tokenizer — context budget via `src/tokenizer.mjs`
  - Frontend — serves static files from `src/ui/`

### MCP server (external AI interface)
- Entry: `src/mcp-server.mjs`
- Search: `scan_inventory`, `move_item`, `delete_item`, `list_destinations`, `audit_security`
- Connects to:
  - Scanner — via `scanAll()`
  - Mover — via `moveItem()`, `deleteItem()`
  - Security — via `src/security-scanner.mjs`

### Security scanner
- Entry: `src/security-scanner.mjs`
- Search: `scanMcpServer`, `deobfuscate`, `scanText`, `PATTERNS`
- Connects to:
  - MCP introspector — tool definitions via `src/mcp-introspector.mjs`
  - Server — exposed as `/api/security-scan`, `/api/security-rescan`
  - Frontend — results cached and rendered in security panel

### MCP introspector
- Entry: `src/mcp-introspector.mjs`
- Search: `introspect`, `toolHash`, `stdio`, `streamableHttp`
- Connects to:
  - Security scanner — provides tool definitions for scanning

### Tokenizer
- Entry: `src/tokenizer.mjs`
- Search: `countTokens`, `ai-tokenizer`
- Connects to:
  - Server — context budget calculation

### History (dormant)
- Entry: `src/history.mjs`
- Search: `backup`, `restore`
- Note: Code exists but is not called by runtime. Treat as dormant.

### Privacy metrics
- Client state: `src/privacy-metrics.mjs`
- Collector: `infra/metrics-worker/src/index.js`
- D1 schema: `infra/metrics-worker/migrations/`
- Monthly reports: `infra/metrics-worker/queries/monthly-matrix.sql`
- Search: `submitMonthlyActiveSignal`, `cco-mau-v1`, `monthly_active_users`
- Behavior: disabled by default; detailed event aggregates stay local; opted-in installs submit one deduplicated rotating anonymous activity identity per UTC month, with identical-payload retries after delivery failure
- Connects to:
  - Server startup and consent route — `src/server.mjs`
  - Harness Doctor consent UI — `src/ui/app.js`, `src/ui/index.html`
  - First-party Cloudflare Worker + D1 — deduplicates `(month, monthly_id)`

### Live Runtime Map / MCP Runtime Doctor
- Entry: `src/runtime-doctor.mjs`
- Search: `collectRuntimeDoctorReport`, `stopRuntimeSession`, `buildSessions`, `attachDirectMcpProcesses`, `findConnectedSessions`, `collectIntentProbeStatus`, `buildRuntimeFindings`, `commandLineHasSecret`
- Behavior: privacy-bounded Linux snapshot of same-user Claude Code, Codex, OpenCode, and DSH process trees; tree RSS/age/process attribution; configured direct-MCP matching; duplicate direct-instance summary; 1MCP cgroup health and persistent loopback client-socket attribution; IntentProbe install/daemon/hook readiness. Command lines, paths, raw sockets, and credential values are never returned.
- Stop contract: explicit UI confirmation plus opaque PID/start-time identity; server revalidates same user and harness identity and sends only `SIGTERM`; CCO refuses self-containing trees.
- Tests: `tests/unit/test-runtime-doctor.mjs`, `tests/e2e/dashboard.spec.mjs`
- Connects to:
  - Server — `GET /api/runtime-doctor`, `POST /api/runtime/session/stop` in `src/server.mjs`
  - Harness Doctor — session cards, direct/shared topology, duplicate MCP recommendations, IntentProbe readiness, resource/package/credential findings, and stop confirmation in `src/ui/app.js`

---

## Frontend

### Dashboard UI
- Entry: `src/ui/app.js`
- Search: `renderItems`, `openInEditor`, `runSecurityScan`, `contextBudget`, `sessionPreview`, `moveModal`, `deleteModal`, `bulkBar`
- HTML: `src/ui/index.html`
- CSS: `src/ui/style.css`
- Connects to:
  - Server — all `/api/*` endpoints
  - Effective mode — renders scope badges (`.scope-tag`, `st-global`, `st-shadowed`)

---

## Utilities (CLI & offline tools)

### Session Distiller
- Entry: `src/session-distiller.mjs`
- Search: `distillSession`, `distillBlocks`, `DISTILL_LIMITS`
- Usage: `node src/session-distiller.mjs <session.jsonl>` or via `POST /api/session-distill` endpoint
- Purpose: Rebuild a compact independent Claude transcript with fresh UUIDs and a valid linear resume chain; create an exact backup + large-result index
- Creates: 
  - `{sessionId}/backup-{origId}.jsonl` — copy of original session
  - `{sessionId}/index.md` — distilled conversation with tool result summaries
- Appends backup/index metadata to the final conversation record
- Tests: `tests/unit/test-session-distiller.mjs`
- Connects to:
  - Server — `POST /api/session-distill` endpoint in `src/server.mjs`
  - Scanner — reads distill artifacts as session bundles

### Image Trimmer
- Entry: `src/trim-images.mjs`
- Usage: `node src/trim-images.mjs <session.jsonl>` or via `trim-images` skill
- Purpose: Strip base64 image blocks from session JSONL when "image exceeds dimension limit"
- Replaces: All `type: "image"` blocks with `[image redacted]` text placeholders
- Handles: Images in message.content and inside tool_result blocks
- Tests: `tests/unit/test-trim-images.mjs`
- Skill: `~/.claude/skills/trim-images/SKILL.md`

---

## Tests

### Unit tests
- Path: `tests/unit/`
- `test-edge-cases.mjs` — scanner edge cases
- `test-effective-rules.mjs` — effective mode logic
- `test-move-destinations.mjs` — mover destination validation
- `test-path-correctness.mjs` — scope path decoding
- `test-path-security.mjs` — Windows/POSIX allowlist boundaries, drives, casing, and UNC paths
- `test-security-features.mjs` — security scanner patterns
- `test-trim-images.mjs` — image block redaction in sessions
- `test-codex-adapter.mjs` — Codex CLI inventory and scope behavior
- `test-opencode-adapter.mjs` — OpenCode config, instruction, skill, MCP, and plugin discovery
- `test-dsh-adapter.mjs` — DeepSeek Harness settings, profiles, official skill roots, and capability gates
- `test-control-plane.mjs` — local privacy metrics and monthly signal behavior
- `test-runtime-doctor.mjs` — privacy-bounded 1MCP process, cgroup, config, and finding collection
- `test-metrics-worker.mjs` — collector validation, strict schema, and D1 writes

### E2E tests
- Path: `tests/e2e/`
- `dashboard.spec.mjs` — full behavioral contract (scan, UI, move, delete, restore, export, context budget, security, sessions)
- `settings.spec.mjs` — settings-related tests
- Config: `tests/e2e/playwright.config.mjs`

---

## Packaging

- Package: `@mcpware/cross-code-organizer`
- Binary: `bin/cli.mjs`
- npm payload: `bin/`, `src/`, `LICENSE`, `README.md`
- Node: `>=20`

---

## Known drift
- Drag-and-drop: disabled in runtime, still mentioned in docs/tests
- `history.mjs`: dormant, not called by any live code path
