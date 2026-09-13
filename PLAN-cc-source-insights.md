# CCO — CC Source Insights Plan v2

> Rewritten 2026-03-31 with verified cross-references to both AI indexes.
> Every claim cites which index section or agent verification confirmed it.
> The next AI should verify any claim that touches code they're about to change — don't blindly implement.

---

## How to Use This Plan

**For the next AI session:**

1. Read this plan first.
2. Pick the feature you're implementing.
3. Read the **specific AI_INDEX sections** cited in that feature (not the whole index).
4. Read the **specific source files** listed in that feature (not the whole codebase).
5. Before implementing, **verify** the claims marked with ⚠️ — these are things that might have changed since this plan was written.
6. After implementing, **update the CCO AI_INDEX** (`claude-code-organizer/AI_INDEX.md`) with what you learned.

**Reference files:**
- CCO codebase index: `claude-code-organizer/AI_INDEX.md`
- CC internals index: `CCsrc/AI_INDEX.md`
- CCO source code: `claude-code-organizer/src/`
- CC source code: `CCsrc/` (read-only reference, never modify)

---

## Current State Summary

**What CCO already does well** (confirmed in CCO AI_INDEX §2, §8):
- Scans 10 categories across global + flat project scopes
- Move/delete/undo for most categories
- Category-level effective mode (MCP/agent shadowing, command conflicts, ancestor config/memory)
- Session preview + resume command
- Context budget estimation
- MCP security scanning
- Search/filter, export, bulk operations

**What CCO does NOT do yet** (confirmed in CCO AI_INDEX §8, §9):
- Parse settings files into individual keys
- Key-level effective resolution (which setting value wins and why)
- MCP enable/disable controls
- Rich skill/plugin metadata display
- Policy/managed explainability

---

## Phase 1 — Settings Read Model

### Goal
Turn settings from "here's a JSON file" into "here are the individual settings, their values, and where they came from."

### Why this is the highest priority
CCO AI_INDEX §8 says: "the biggest missing layer is settings truth, not more panels." Every subsequent phase (effective resolution, MCP control, policy explanation) depends on having parsed settings data first.

### What we know from the indexes

**CC settings schema** (CCsrc AI_INDEX §4):
- Setting keys include: `permissions`, `hooks`, `mcpServers`, `allowedMcpServers`, `deniedMcpServers`, `outputStyle`, `language`, `statusLine`, `assistant`, `assistantName`, `autoMemoryEnabled`, `autoMemoryDirectory`, `plansDirectory`, `enabledPlugins`, `pluginConfigs`, `fastMode`, `effortLevel`, `sandbox`, `worktree.symlinkDirectories`, `worktree.sparsePaths`, `channelsEnabled`, `allowedChannelPlugins`, `remote.defaultEnvironmentId`, `autoDreamEnabled`
- Setting sources in merge order (lowest to highest): plugin < userSettings < projectSettings < localSettings < flagSettings < policySettings
- Arrays are concatenated+deduped during merge, scalars use last-wins
- `flagSettings` and `policySettings` are always included regardless of CLI flags

**CCO scanner current state** (CCO AI_INDEX §7, verified by agent):
- Settings files are scanned as `config` category items with `locked: true`
- Scanner does NOT parse settings into individual keys
- Scanner already extracts `hooks` key from settings into `hook` items
- Scanner already extracts `mcpServers` key from settings into `mcp` items
- Scanner reads `autoMemoryDirectory` and `plansDirectory` to customize scan paths

### Feature A1: Parse settings into structured records

**What to build:**
A settings parser that reads settings JSON files and emits per-key records.

**Files to modify:**
- `src/scanner.mjs` — add a `parseSettingsFile()` helper and a `scanSettings()` function

**Data model for each setting record:**
```js
{
  category: "setting",       // new virtual category
  scopeId,                   // "global" or encoded project name
  name,                      // the key path, e.g. "permissions.allow", "outputStyle"
  value,                     // the actual value (could be string, array, object)
  valueType,                 // "string" | "boolean" | "number" | "array" | "object"
  sourceFile,                // which file this came from, e.g. "settings.json"
  sourceTier,                // "user" | "project" | "local" | "managed"
  settingGroup,              // "permissions" | "hooks" | "mcp" | "runtime" | "memory" | "plugins"
  locked: true,              // read-only for now
}
```

**Settings files to read (per scope):**

Global:
- `~/.claude/settings.json` → sourceTier "user"
- `~/.claude/settings.local.json` → sourceTier "local"
- managed settings file (⚠️ verify path — CCsrc AI_INDEX §4 says `managed-settings.json` under managed file path, CCO AI_INDEX §7 says `/etc/claude-code/managed-settings.json` on Linux) → sourceTier "managed"

Project:
- `<repo>/.claude/settings.json` → sourceTier "project"
- `<repo>/.claude/settings.local.json` → sourceTier "local"

**Initial high-signal setting groups to parse:**

| Group | Keys to extract |
|-------|----------------|
| permissions | `permissions.allow`, `permissions.deny`, `permissions.ask` |
| mcp | `mcpServers`, `allowedMcpServers`, `deniedMcpServers` |
| runtime | `outputStyle`, `language`, `statusLine`, `fastMode`, `effortLevel`, `sandbox` |
| memory | `autoMemoryEnabled`, `autoMemoryDirectory`, `plansDirectory` |
| plugins | `enabledPlugins`, `pluginConfigs` |

⚠️ **Verify before implementing:** Read `src/scanner.mjs` to confirm the current `scanConfigs()` shape. The index says settings files are `config` items with `locked: true` — verify this is still true and decide whether setting records should coexist alongside config items or replace them.

**Acceptance:** `/api/scan` returns setting records alongside existing items. Existing config items are NOT removed.

---

### Feature A2: Settings API endpoint

**What to build:**
`GET /api/settings?scope=<scopeId>` — returns parsed settings for a scope.

**Files to modify:**
- `src/server.mjs` — add route handler

**Response shape:**
```json
{
  "sources": [
    { "file": "settings.json", "tier": "user", "path": "/home/.../.claude/settings.json" }
  ],
  "records": [ /* setting records from A1 */ ],
  "groups": {
    "permissions": [ /* records in this group */ ],
    "runtime": [ /* ... */ ]
  }
}
```

⚠️ **Verify before implementing:** Read `src/server.mjs` to understand the existing route pattern (CCO AI_INDEX §9 lists the current routes). Follow the same pattern.

**Acceptance:** UI can request structured settings without parsing raw JSON itself.

---

### Feature A3: Settings panel in UI

**What to build:**
A read-only settings view, either as a new virtual category in the sidebar or a dedicated panel.

**Files to modify:**
- `src/ui/app.js` — rendering logic for settings view
- `src/ui/style.css` — styling for settings rows
- `src/ui/index.html` — only if adding a new panel (might not be needed if using existing item list)

**Design decision (for implementer to decide):**
- Option A: Add `setting` as a new filter pill category in the existing item list
- Option B: Add a dedicated settings panel (like context budget panel)
- Recommendation: start with Option A, it's less UI work and fits the existing pattern

**Per-setting row should show:**
- Key name (e.g. `outputStyle`)
- Value preview (truncated for objects/arrays)
- Source file + tier badge
- Scope badge

**Acceptance:** User can answer "what settings exist in this scope?" without opening raw JSON.

---

## Phase 2 — Effective Settings & Explainability

### Why this comes after Phase 1
You need parsed settings records before you can compare them across scopes. Phase 1 gives you the data; Phase 2 gives you the logic.

### What we know from the indexes

**CC precedence rules** (CCsrc AI_INDEX §4, verified by agent):
- Merge order: plugin < user < project < local < flag < policy
- Some keys IGNORE projectSettings for security: `skipDangerousModePermissionPrompt`, `skipAutoPermissionPrompt`, `useAutoModeDuringPlan`, `autoMode` config
- `policySettings` uses first-source-wins internally (remote > MDM > file > HKCU)
- `rawSettingsContainsKey()` skips policySettings (detects user intent, not policy)

**CCO effective.mjs current state** (CCO AI_INDEX §9, verified by agent):
- Only handles: MCP/agent shadowing (project wins over global), command conflicts, ancestor config/memory inclusion
- Skill: declared in rules but has ZERO resolution logic
- Hook: declared in rules but has ZERO resolution logic
- Config: only ancestor inclusion, no key-level precedence
- MCP: only 2-level (project vs global), not the 3-level (local > project > user) that CC actually uses

### Feature B1: Key-level effective resolution

**What to build:**
Extend `effective.mjs` to resolve which setting value wins for each key, across tiers.

**Files to modify:**
- `src/effective.mjs` — add `resolveSettingKey()` function
- `src/server.mjs` — expose via `/api/settings` or extend `/api/scan`

**Resolution logic (based on CC merge order):**

For each setting key, collect values from all tiers that define it:
1. managed (highest priority — if present, it wins)
2. local
3. project (⚠️ except for security-sensitive keys — see list above)
4. user (lowest priority among user-configurable)

**Per-key state model:**
- `active` — this tier's value is the effective one
- `overridden` — this tier defines a value but a higher-priority tier wins
- `inherited` — no value at this scope, inherited from parent scope
- `managed-locked` — managed config defines this, user cannot override
- `security-excluded` — projectSettings is ignored for this key (security reason)

**Important boundary:** CCO can only observe file-based settings. It cannot see CLI flags, remote managed cache, MDM/plist, or HKCU. The UI must clearly say "based on observable files" not "this is what Claude sees at runtime."

⚠️ **Verify before implementing:** Read `src/effective.mjs` to confirm the current `computeEffectiveSets()` signature. The agent report says it takes `(scopeId, items, scopes, keyFn)` — verify this is still the interface before extending it.

**Acceptance:** For a selected project scope, CCO shows which value wins for each setting key, and which tiers lost.

---

### Feature B2: Override/ignored reason display

**What to build:**
When a user clicks a setting, show why it has its current state.

**Files to modify:**
- `src/ui/app.js` — detail panel for settings
- `src/ui/style.css` — state badges

**Example explanations:**
- "Active — set in project settings.json, overrides global value"
- "Overridden — set here as `markdown` but project local sets `streamlined`"
- "Managed — set by enterprise managed config, cannot be overridden"
- "Security-excluded — projectSettings is ignored for this key"

**Acceptance:** User can click a setting and see current value, source, what lost, and why.

---

### Feature B3: Permission rules table

**What to build:**
Parse `permissions.allow`, `permissions.deny`, `permissions.ask` into a structured table.

**Files to modify:**
- `src/ui/app.js` — render permission rules as table rows
- `src/scanner.mjs` — parse permission arrays into structured records (if not already done in A1)

**Each rule row shows:**
- Tool pattern (e.g. `Bash(*)`, `Edit`)
- Rule type (allow / deny / ask)
- Source file + scope

⚠️ **Verify before implementing:** Check what the actual shape of `permissions` is in a real `settings.json`. The CC schema says `allow`/`deny`/`ask` but verify the array element format.

**Acceptance:** Users can see permission rules by source and spot broad patterns.

---

### Feature B4: Hook explainability

**What to build:**
Show hooks with effective status — which hooks are active, which are overridden by a narrower scope.

**Files to modify:**
- `src/scanner.mjs` — add source tier to hook items
- `src/effective.mjs` — add hook resolution (same event + same type → narrower scope wins)
- `src/ui/app.js` — show effective badges on hook items

**Current state** (CCO AI_INDEX §7): Hooks are already extracted from settings into `hook` items with `locked: true`, but have no effective resolution logic.

⚠️ **Verify before implementing:** Read how `scanHooks()` extracts hooks. The agent report says it creates items per-command with `name = event name`. If two settings files define hooks for the same event, verify how they currently appear (duplicate items? merged?).

**Acceptance:** For each hook, CCO shows event, source, and whether another scope overrides it.

---

## Phase 3 — MCP Control Plane

### What we know from the indexes

**CC MCP internals** (CCsrc AI_INDEX §5):
- 7 scopes: local, user, project, dynamic, enterprise, claudeai, managed
- Dedup by content signature, not name: `getMcpServerSignature()` uses command+args for stdio, normalized URL for HTTP
- Enterprise MCP takes exclusive control when present
- Policy: denylist has absolute precedence, empty allowlist blocks all, undefined allowlist allows all
- User-facing add/remove only supports project, user, local

**CCO MCP current state** (CCO AI_INDEX §7):
- Reads from 5 global sources + 3 project sources
- `.claude.json` project entries have asymmetric move/delete
- No enable/disable controls
- No provenance badges
- Effective mode only does 2-level shadowing (project vs global)

### Feature C1: MCP provenance badges

**What to build:**
Show where each MCP server entry came from.

**Files to modify:**
- `src/scanner.mjs` — add `sourceType` field to MCP items
- `src/ui/app.js` — render source badge

**Source types:**
- `.mcp.json` (user or project)
- `.claude.json` (top-level or project entry)
- `settings.json` / `settings.local.json` (embedded mcpServers)
- managed MCP config

⚠️ **Verify before implementing:** Read `scanMcpServers()` in scanner.mjs. The agent report says it already reads from these sources — check if there's enough info in the item model to derive source type, or if a new field is needed.

**Acceptance:** Every MCP item shows a badge like "from .mcp.json" or "from settings.json".

---

### Feature C2: MCP active/shadowed/disabled state

**What to build:**
Extend effective logic so MCP items show whether they're actually being used by Claude.

**Files to modify:**
- `src/effective.mjs` — extend MCP shadowing to handle same-name across more than 2 levels
- `src/ui/app.js` — show state badges

**State model:**
- `active` — this is the entry Claude will use
- `shadowed` — same name exists at a narrower scope
- `disabled` — user has explicitly disabled this entry
- `duplicate` — same name, same config (redundant entry)
- `conflict` — same name, different config (ambiguous)

⚠️ **Verify before implementing:** Read `effective.mjs` to confirm current MCP shadowing logic. Agent report says it only does project-vs-global. Check if we can extend to handle the `local > project > user` order that CC actually uses.

**Acceptance:** Users can tell which MCP server Claude will actually use when duplicates exist.

---

### Feature C3: MCP enable/disable toggle

**What to build:**
Let users disable/re-enable an MCP server without manually editing JSON.

**Files to modify:**
- `src/mover.mjs` — add `toggleMcpServer()` function
- `src/server.mjs` — add `POST /api/mcp-toggle` endpoint
- `src/ui/app.js` — add toggle button in MCP detail view

**Implementation approach:**
1. For `.mcp.json` entries: add/remove `"disabled": true` in the server config
2. For `settings.json` embedded entries: same pattern
3. For managed/enterprise entries: show as read-only, no toggle

⚠️ **Verify before implementing:** Check how CC actually represents disabled MCP servers. CCsrc AI_INDEX §5 mentions `enabledMcpjsonServers` and `disabledMcpjsonServers` in settings — this might be the mechanism, not a `disabled` field in the server config itself. Read `CCsrc/services/mcp/config.ts` or the relevant AI_INDEX section to confirm.

**Acceptance:** Users can toggle an MCP server on/off from the dashboard.

---

### Feature C4: MCP identity/duplicate detection

**What to build:**
Use content-based identity (not just name) to detect real duplicates vs same-name-different-config.

**Files to modify:**
- `src/scanner.mjs` — add signature computation
- `src/effective.mjs` — use signatures in duplicate detection

**Signature logic** (from CCsrc AI_INDEX §5):
- stdio servers: hash of `command + args`
- HTTP/SSE servers: normalized URL

⚠️ **Verify before implementing:** This depends on whether CCO's MCP items already have enough data in `mcpConfig` to compute signatures. The agent report says scanner stores full `mcpConfig` — so this should be possible.

**Acceptance:** Duplicate MCP entries are classified as "same config" vs "different config."

---

## Phase 4 — Skill & Plugin Provenance

### What we know from the indexes

**CC skill loading** (CCsrc AI_INDEX §6):
- 18 frontmatter fields confirmed: `name`, `description`, `allowed-tools`, `argument-hint`, `arguments`, `when_to_use`, `version`, `model`, `disable-model-invocation`, `user-invocable`, `hooks`, `context`, `agent`, `effort`, `shell`, `paths`
- `paths` frontmatter creates conditional skills (only active when touched files match)
- Skills deduped by `realpath`, not visible path

**CCO current state** (CCO AI_INDEX §7):
- Scanner parses name/description from frontmatter
- `subType` comes from memory frontmatter `type` field
- Skill items have `fileCount` and `bundle` fields
- No parsing of `allowed-tools`, `user-invocable`, `model`, `effort`, `paths`, etc.

### Feature D1: Rich skill metadata

**What to build:**
Parse more frontmatter fields from skill SKILL.md files.

**Files to modify:**
- `src/scanner.mjs` — extend skill frontmatter parsing

**Fields to extract:**
- `allowed-tools` → show as tool list
- `user-invocable` → show as badge (slash command vs AI-only)
- `model` → show if skill forces a specific model
- `effort` → show if skill forces an effort level
- `paths` → show if skill is conditional (only active for certain files)
- `when_to_use` → show in description area

⚠️ **Verify before implementing:** Read the skill scanning code in `scanner.mjs` to see how frontmatter is currently parsed. Extend the existing parser, don't replace it.

**Acceptance:** Skill detail view shows structured metadata beyond just name/description.

---

### Feature D2: Plugin metadata enrichment

**What to build:**
Parse plugin manifests to show more than folder names.

**Files to modify:**
- `src/scanner.mjs` — read plugin manifest files

**Current state** (CCO AI_INDEX §7): plugins are scanned from `~/.claude/plugins/cache/*/*`, global only, locked, no manifest parsing.

⚠️ **Verify before implementing:** Check what files exist inside a plugin cache directory. Look for `plugin.json` or `manifest.json`. CCsrc AI_INDEX §7 says plugin manifests define hooks, commands, agents, skills, output styles, channels, MCP servers, LSP servers, settings, and userConfig — but we need to confirm the actual file format.

**Acceptance:** Plugin rows show name, version, and provided capabilities instead of just folder names.

---

## Phase 5 — Context Budget Refinement

Low priority. Only do after Phase 1-3.

### What we know from CCsrc source audit (2026-03-31)

Verified from `services/compact/compactWarningState.ts` and `utils/context.ts`:

| Constant | CCsrc real value | CCO current value | Action needed |
|----------|-----------------|-------------------|---------------|
| `AUTOCOMPACT_BUFFER_TOKENS` | **13,000** | 33,000 | Fix — wrong by 2.5× |
| `WARNING_THRESHOLD_BUFFER_TOKENS` | 20,000 | not modelled | Add as warning zone |
| `MODEL_CONTEXT_WINDOW_DEFAULT` | 200,000 | hardcoded assumption | OK for now |
| Skill listing budget | 1% of context window in chars (= ~2,000 tokens at 200k) | 400 per skill (different concept, not conflicting) | Consider adding listing budget |

Context window is **model-dependent** (from `getContextWindowForModel()`):
- Default: 200,000
- Sonnet 4.6 with 1M experiment (GrowthBook flag): 1,000,000
- CCO has no way to know which model the user is running — this is a known limitation

**Files to read when implementing:**
- `services/compact/compactWarningState.ts` — AUTOCOMPACT_BUFFER_TOKENS, WARNING_THRESHOLD_BUFFER_TOKENS
- `utils/context.ts` — MODEL_CONTEXT_WINDOW_DEFAULT, getContextWindowForModel logic
- `tools/SkillTool/prompt.ts` — SKILL_BUDGET_CONTEXT_PERCENT (0.01), CHARS_PER_TOKEN (4), DEFAULT_CHAR_BUDGET (8,000)
- `src/server.mjs` in CCO — context budget constants to update

### Feature E1: Fix autocompact buffer constant

**What to change:**
- `src/server.mjs` — find the `33000` autocompact buffer constant, change to `13000`
- This is a one-line fix with no design decisions needed

**Acceptance:** CCO context budget uses the correct autocompact buffer.

---

### Feature E2: Add warning threshold zone

**What to build:**
Show a "warning zone" in the context budget UI when usage is within 20,000 tokens of the autocompact threshold (matching CC's own `WARNING_THRESHOLD_BUFFER_TOKENS`).

**Files to modify:**
- `src/server.mjs` — add warning threshold constant
- `src/ui/app.js` — render warning state in budget panel

**Acceptance:** Budget panel shows a visual warning before autocompact would trigger.

---

### Feature E3: Exclude disabled MCP from budget
If C2/C3 are implemented, disabled MCP servers should not count toward context budget.

### Feature E4: Deferred vs always-loaded accuracy
Path-scoped rules (`paths:` frontmatter) should be counted as deferred, not always-loaded.

### Feature E5: Explanatory footnotes
Add "estimated" / "measured" labels instead of implying exactness. Note that CCO cannot observe the actual model being used, so context window size is an assumption.

---

## Explicitly Deferred

These are not on the near-term roadmap. From the original plan, confirmed still low-priority:

- GrowthBook feature flags panel
- Build type detection
- Migration version display
- Bridge connection status
- Remote-managed settings cache detection
- Session cost history
- Full runtime mirror of CC internals

**Why:** Too brittle, too vendor-internal, not locally observable, or weakly portable.

---

## Execution Order

### Next release: Phase 1 (A1 → A2 → A3)
Settings read model. Everything else depends on this.

### After that: Phase 2 (B1 → B2 → B3 → B4)
Effective settings + permission/hook explainability.

### Then: Phase 3 (C1 → C2 → C3 → C4)
MCP provenance + state + controls.

### Later: Phase 4 (D1 → D2) + Phase 5 (E1-E3)
Skill/plugin enrichment + context budget polish.

---

## For the Next AI: Verification Checklist

Before implementing any feature:

1. Read the specific source files listed in that feature section
2. Verify any claim marked with ⚠️ by checking the actual code
3. If the AI_INDEX says X but the code says Y, trust the code and update the index
4. After implementation, update `claude-code-organizer/AI_INDEX.md` with:
   - Any new files created
   - Any new API endpoints added
   - Any changes to the data model
   - Any claims that turned out to be wrong

**Do NOT:**
- Read every source file before starting
- Trust this plan blindly — it's based on indexes which are based on a point-in-time audit
- Skip the ⚠️ verification steps
- Forget to update the index after finishing
