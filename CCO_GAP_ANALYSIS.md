# CCO Gap Analysis

This document compares Claude Code Organizer's current product surface against the Claude Code knowledge surfaced from `CCsrc`.

It is intentionally product-focused. The question is not "what code exists?" but "what does CCO still fail to explain, model, or make actionable?"

## Summary

CCO is already strong at:
- file/disc inventory across scopes
- move/delete workflows for concrete artifacts
- effective view for memories/config/MCP/agents/commands
- context-budget estimation
- MCP security scanning

CCO is still weak at:
- settings schema visibility
- managed-vs-user-vs-project precedence
- policy-aware active vs ignored state
- MCP transport/scope/governance detail
- skill metadata richness
- plugin and marketplace trust/governance
- permission mode and rules explainability
- remote/worktree/assistant/channel surfaces

The core strategic gap is this:

CCO currently behaves like a **file organizer with some runtime inference**.
`CCsrc` suggests the product opportunity is bigger: CCO can become a **Claude Code configuration intelligence layer**.

## Product Thesis

CCO should evolve from:
- "show me the files and let me move them"

into:
- "show me what Claude Code will actually do, why it will do it, what is ignored, what is risky, and how config/policy/runtime fit together"

## Domain-by-Domain Gaps

| Domain | Current CCO state | Gap | Why it matters | Recommendation |
| --- | --- | --- | --- | --- |
| Settings schema | Settings files are shown mostly as locked config files | No field-level parsing, provenance, grouping, or validation | Users cannot see what Claude Code actually supports or which settings are in play | Add parsed `settings` inventory with field groups and source provenance |
| Settings precedence | Some effective logic exists for config/memory/MCP/agent/command | No full source precedence model across user/project/local/flag/policy | Runtime behavior can differ sharply from what is on disk | Add effective-settings resolver and provenance view |
| Managed policy | CCO scans files but is mostly policy-blind | No concept of managed-only hooks/MCP/permission rules or plugin-only customization locks | Files can exist but be ignored; this is a major source of confusion | Add "active", "ignored", and "ignored because policy" states |
| MCP identity | CCO lists MCP servers and scans security | No transport badges, no scope taxonomy beyond global/project, no dedup signature view, no approval-state explainer | MCP is the richest and riskiest config surface | Deepen MCP model first |
| MCP governance | CCO shows raw config and findings | No allowlist/denylist overlay, no managed-vs-user policy overlay, no `.mcp.json` approval state | Users need operational confidence, not just raw JSON | Build MCP governance panel |
| Skills | CCO parses name/description/frontmatter lightly and previews `SKILL.md` | No metadata cards for allowed tools, effort, shell, model, hooks, path restrictions, hidden/user-invocable state | Skills are a structured product surface, not just markdown blobs | Add parsed skill metadata and linting |
| Plugins | CCO only sees plugin cache directories | No built-in vs marketplace distinction, no plugin config, no marketplace trust model, no plugin-provided MCP/hook/skill mapping | Plugins increasingly shape runtime behavior | Make plugins first-class |
| Marketplaces | Not modeled | No visibility into known marketplaces, strict allowlists/blocklists, impersonation risks, seed dirs | This is admin/governance territory CCO could own | Add marketplace audit and trust diagnostics |
| Permissions | Hooks and config are scanned, but permission behavior is not explained | No permission-mode dashboard, no rule provenance, no additional-directory visibility, no managed-only rule policy | Permission posture directly changes tool execution UX | Add permission center |
| Output/runtime behavior | Context budget exists, but runtime reasoning is partial | No view of output style, language, statusline, prompt sections, scratchpad, fast mode, plan/auto mode settings | These settings shape Claude behavior and user experience | Add runtime behavior cards |
| Memory/session behavior | Sessions and memories are scanned | No auto-memory settings visibility, no session-memory understanding, no transcript retention view | Claude has multiple memory layers; CCO only surfaces some | Expand memory/session settings and diagnostics |
| Worktree/remote/assistant/channels | Minimal or none | No modeled view of worktree settings, assistant mode, remote defaults, channel notifications | Claude Code is increasingly multi-mode | Add mode/config visibility, not only local file inventory |
| Effective view | Current effective logic is category-specific and useful | It is not generalized to settings fields or policy suppressions | Users need a single "what actually applies" model | Build unified effective/provenance engine |
| Mutation UX | CCO can move/delete several file-backed items | Some categories are inconsistently movable; virtual/runtime surfaces have no UX plan | As CCO gets smarter, read-only and actionable surfaces must be distinguished clearly | Separate read-only intelligence from mutation flows |
| Internal consistency | Some docs/UI affordances drift from implementation | Dead code, disabled DnD, unused history module, stale metadata | Product credibility drops when UX claims exceed behavior | Clean up internal mismatches while adding new features |

## Biggest Missing Surfaces

The most important things `CCsrc` says Claude Code has, but CCO does not yet model well, are:

1. Parsed settings as first-class data
2. Managed policy and effective ignore/suppression logic
3. MCP transport/scope/approval/governance detail
4. Rich skill metadata
5. Plugins and marketplaces as trusted/untrusted extension surfaces
6. Permission-mode posture
7. Runtime behavior settings such as output style, language, statusline, worktree, assistant, channels, auto-memory

## What CCO Already Has That Should Stay Central

CCO should not abandon its current strengths. The next version should preserve and deepen:

- filesystem-based cross-scope inventory
- preview of raw files/configs
- move/delete/restore for concrete artifacts
- effective-item UX
- context-budget calculation
- MCP security scanning

The right move is not a pivot away from those features. It is to layer richer semantics on top of them.

## Recommended Product Positioning Shift

Short version:

CCO should reposition from "organize Claude Code files" to "understand and govern Claude Code configuration."

That includes four jobs:
- inventory: what exists
- provenance: where it comes from
- effectiveness: what actually applies
- governance: what is allowed, ignored, duplicated, or risky

## Recommended Near-Term Scope

The highest-value scope for the next iteration is:

1. Parsed settings inventory
2. Effective/provenance engine for settings and policy
3. MCP deep inspector
4. Skill metadata enrichment
5. Plugin/marketplace inventory

Everything else can build on those foundations.

## Anti-Goals

CCO should avoid these mistakes:

- Turning every setting key into its own top-level sidebar category
- Shipping write/edit flows for complex settings before read/explain flows are solid
- Treating raw file presence as truth when policy can suppress it
- Modeling MCP identity by name only
- Adding runtime-behavior claims the implementation cannot justify

## Bottom Line

The main gap is not "CCO lacks more categories." The main gap is:

CCO lacks a robust **runtime truth model**.

`CCsrc` gives enough evidence to build that model.
