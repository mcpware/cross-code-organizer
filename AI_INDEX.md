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
- Search: `createServer`, `/api/scan`, `/api/move`, `/api/delete`, `/api/context-budget`, `/api/security-scan`, `/api/file-content`, `/api/session-preview`, `/api/export`
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
- Purpose: Extract conversation summary from full session JSONL, reduce size by ~90%, create backup + index
- Creates: 
  - `{sessionId}/backup-{origId}.jsonl` — copy of original session
  - `{sessionId}/index.md` — distilled conversation with tool result summaries
  - Injects distiller context message into distilled session
- Tests: `tests/unit/test-trim-images.mjs` (integration)
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
- `test-security-features.mjs` — security scanner patterns
- `test-trim-images.mjs` — image block redaction in sessions

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
- Version strings: stale in `server.json`, `.claude-plugin/plugin.json`, `src/mcp-server.mjs`
- `history.mjs`: dormant, not called by any live code path
