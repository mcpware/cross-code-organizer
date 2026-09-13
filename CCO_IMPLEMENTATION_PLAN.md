# CCO Implementation Plan

This plan turns the gap analysis and backlog into an execution order for the current CCO codebase.

It is written against the current runtime structure:
- scanner: `src/scanner.mjs`
- effective logic: `src/effective.mjs`
- mutation layer: `src/mover.mjs`
- server/API: `src/server.mjs`
- UI: `src/ui/app.js`, `src/ui/index.html`, `src/ui/style.css`
- tests: `tests/unit/*.mjs`, `tests/e2e/dashboard.spec.mjs`

## Guiding Principles

1. Prefer read-only intelligence before edit flows.
2. Preserve CCO's current strengths: file inventory, effective view, context budget, MCP security scan.
3. Introduce richer metadata through backward-compatible item enrichment rather than rewriting the whole app at once.
4. Distinguish clearly between:
   - exists on disk
   - parsed successfully
   - active/effective
   - ignored/suppressed
   - blocked by policy

## Target End State

CCO should be able to answer, for every important surface:

- What exists?
- Where did it come from?
- Does it apply?
- If not, why not?
- Is it duplicated, risky, or governed by policy?

## Proposed Data Model Changes

Before building major new UI, enrich the scanner item model.

Add shared metadata fields such as:
- `sourceType`
  - `userSettings`, `projectSettings`, `localSettings`, `policySettings`, `flagSettings`, `plugin`, `builtin`, `managed`, `claudeai`, `dynamic`
- `activeState`
  - `active`, `shadowed`, `ignored`, `suppressed`, `locked`, `informational`
- `activeReason`
- `ignoredReason`
- `policyReason`
- `signature`
  - especially for MCP and plugin-derived identity
- `subtype`
  - transport type, setting group, skill execution context, marketplace source type, etc.
- `details`
  - category-specific structured data for the detail pane

Do not make all item types movable/deletable. Many of the new surfaces should stay read-only initially.

## Category Strategy

Do not explode the sidebar into dozens of categories.

Recommended approach:
- keep existing categories like `mcp`, `skill`, `hook`, `plugin`, `config`
- add one new virtual category: `setting`
- enrich existing categories with structured metadata and badges

Suggested `setting` groups:
- `permissions`
- `mcp_policy`
- `plugins_marketplaces`
- `runtime_behavior`
- `memory_sessions`
- `worktree_plans`
- `remote_assistant`

## Phase 1: Foundations

Goal:
- make the scanner/API capable of carrying richer semantics without breaking current UI

Backend work:
- enrich `src/scanner.mjs` item shape with shared metadata
- add helper parsers for settings-derived virtual items
- centralize provenance helpers
- add MCP signature helper reuse for CCO-side dedup/conflict logic

API work:
- extend `/api/scan` payload rather than adding many new endpoints immediately
- keep old fields intact so current UI still works during migration

UI work:
- add badge rendering infrastructure in `src/ui/app.js`
- add detail sections for structured metadata

Test work:
- add unit tests for provenance/active-state helpers
- extend e2e assertions to tolerate richer item payloads

Files likely touched:
- `src/scanner.mjs`
- `src/server.mjs`
- `src/ui/app.js`
- `src/ui/style.css`
- `tests/unit/*`
- `tests/e2e/dashboard.spec.mjs`

## Phase 2: Effective Settings Explorer

Goal:
- introduce parsed settings as first-class inventory

Backend work:
- parse `settings.json`, `settings.local.json`, managed settings, and related config into virtual `setting` items
- preserve source path and setting key path
- attach setting group and normalized value summaries

Effective logic:
- extend or parallel `src/effective.mjs` with settings-specific precedence logic
- source ordering should support:
  - user
  - project
  - local
  - flag
  - policy

UI work:
- add `Settings` category in sidebar
- render grouped setting rows
- show source, effective value, overridden value, and raw file origin in detail pane

Initial scope:
- `outputStyle`
- `language`
- `statusLine`
- `plansDirectory`
- `autoMemoryEnabled`
- `autoMemoryDirectory`
- `assistant`
- `channelsEnabled`
- `worktree.*`

Test work:
- unit tests for settings precedence
- e2e fixtures with user/project/local/policy overlaps

## Phase 3: Policy-Aware Active/Ignored State

Goal:
- teach CCO to distinguish between present config and live config

Backend work:
- detect and annotate:
  - managed-only hooks
  - managed-only permission rules
  - managed-only MCP allowlists
  - plugin-only customization locks
- mark items as ignored/suppressed when policy says they do not apply

UI work:
- badges such as `Ignored`, `Managed Only`, `Plugin Only`, `Shadowed`, `Suppressed`
- detail panel text explaining why the item does not apply

This phase should specifically improve:
- hooks
- skills
- agents
- MCP
- settings entries

Test work:
- add policy fixtures to e2e tests
- assert that ignored items are still visible but clearly marked

## Phase 4: MCP Deep Inspector

Goal:
- make MCP the strongest part of the product

Backend work:
- enrich MCP items with:
  - transport type
  - scope type
  - approval state
  - signature identity
  - policy allow/deny status
  - plugin-provided/source-provided origin
  - normalized endpoint/command summary
- detect duplicate servers by signature, not just name
- unwrap proxy URLs where possible for display identity

UI work:
- MCP detail panel sections:
  - Identity
  - Transport
  - Scope / source
  - Approval
  - Policy
  - Dedup / conflicts
  - Security findings

Possible API additions if needed:
- lightweight MCP signature or effective-governance endpoint

Test work:
- signature-based duplicate scenarios
- managed-vs-user allow/deny overlays
- `.mcp.json` approval-state fixtures

## Phase 5: Parsed Skill Metadata

Goal:
- move skills from markdown preview to structured capability objects

Backend work:
- expand current skill frontmatter parsing in `src/scanner.mjs`
- extract fields such as:
  - allowed tools
  - `when_to_use`
  - argument hint
  - user-invocable
  - model
  - effort
  - shell
  - execution context
  - hooks presence
  - path scope

UI work:
- skill metadata card in detail pane
- badges for hidden/user-invocable/fork/model/effort/shell
- optional lint warnings for malformed or incomplete metadata

Test work:
- unit tests for parsing edge cases
- e2e cases with representative `SKILL.md` frontmatter

## Phase 6: Plugin and Marketplace Inventory

Goal:
- make plugins and marketplaces first-class instead of just plugin cache folders

Backend work:
- enrich plugin scanning with:
  - built-in vs marketplace vs managed distinction
  - plugin id / source / marketplace
  - provided surfaces: skills, hooks, MCP
  - plugin config presence
- optionally parse marketplace config from settings-derived entries

UI work:
- plugin detail sections:
  - Source
  - Marketplace
  - Provided MCP/skills/hooks
  - Config state
  - Governance/trust badges

Later extension:
- marketplace trust diagnostics
- impersonation warnings based on reserved/blocked name heuristics

## Phase 7: Permission Center

Goal:
- expose permission posture clearly

Backend work:
- parse permission settings into virtual `setting` entries plus optional dedicated summaries
- compute:
  - default mode
  - rule counts by source
  - additional directories
  - managed-only rule policy state

UI work:
- permission summary card
- rule provenance list
- readable mode explanations

This should remain read-only at first.

## Phase 8: Runtime Behavior and Session Surfaces

Goal:
- expose the non-file settings that shape Claude behavior

Scope:
- output style
- language
- status line
- worktree config
- plans directory
- auto-memory and transcript retention
- assistant / remote defaults
- channels-related settings

Optional advanced view:
- "runtime behavior" summary panel showing the behavior-affecting settings currently in play

## Phase 9: Cleanup and Internal Consistency

Goal:
- reduce confusion while richer features land

Recommended cleanup:
- decide whether `src/history.mjs` should be integrated or removed
- remove or clearly hide dead drag-and-drop UX
- resolve plan/rule move inconsistencies
- tighten `GET /api/file-content` path rules
- fix undefined CSS vars in security styles
- align docs and UI affordances with actual capabilities

This work should happen incrementally alongside feature delivery.

## Recommended Milestone Breakdown

### Milestone 1

Ship:
- Phase 1 foundations
- Phase 2 effective settings explorer
- Phase 3 policy-aware active/ignored state

Outcome:
- CCO becomes trustworthy for "what applies?"

### Milestone 2

Ship:
- Phase 4 MCP deep inspector
- Phase 5 parsed skill metadata

Outcome:
- CCO becomes materially better for governance and skill understanding

### Milestone 3

Ship:
- Phase 6 plugin/marketplace inventory
- Phase 7 permission center
- selected Phase 8 runtime settings

Outcome:
- CCO becomes a broader Claude Code configuration intelligence tool

## Testing Strategy

Add tests in the same order as the features:

1. Unit tests for parsing and precedence
2. Unit tests for policy suppression and active-state reasons
3. E2E fixtures that combine:
   - user/project/local/policy settings
   - file-defined and plugin-defined MCP
   - skill frontmatter variations
   - managed-only restriction scenarios

Recommended new test themes:
- effective settings precedence
- ignored-by-policy visibility
- MCP signature duplicates
- plugin-provided vs file-provided surfaces
- output style / language / worktree / memory setting visibility

## Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Sidebar clutter | Too many categories will hurt usability | Use one new `setting` category and enrich existing categories |
| Semantics drift from Claude Code | CCO could make incorrect claims | Keep provenance and active-state logic explicit and tested |
| Overbuilding edit flows | Editing complex settings too early can create risk | Start read-only, add mutations later only where safe |
| MCP overcomplexity | Governance logic can sprawl | Focus first on identity, approval, policy, and dedup |
| Confusing raw vs effective | Users may want both views | Always expose both raw source and effective status |

## Immediate Next Step

Start with Phase 1 plus the narrowest useful slice of Phase 2:

- enrich item metadata
- add virtual `setting` items for a small set of keys
- render provenance + active-state badges

That gives the rest of the roadmap a clean foundation without forcing a full rewrite.
