# CCO Feature Backlog

This backlog is derived from:
- current CCO implementation
- the CCO repo AI index
- the `CCsrc` knowledge index used as Claude Code product reference

Priorities:
- `P0`: foundation or highest-value feature
- `P1`: important follow-on
- `P2`: useful expansion
- `P3`: optional / exploratory

## P0

| Feature | Why | Deliverable |
| --- | --- | --- |
| Effective Settings Explorer | Biggest current blind spot; CCO sees settings files but not effective field-level behavior | New `settings` inventory category with grouped entries, effective values, and source provenance |
| Policy-Aware Active/Ignored State | CCO currently treats on-disk config too literally | Badges and detail text for `active`, `shadowed`, `ignored by policy`, `suppressed by precedence` |
| MCP Deep Inspector | MCP is the highest-risk and highest-complexity surface | Transport badges, source scope badges, approval state, signature identity, policy overlay, dedup/conflict view |
| Parsed Skill Metadata | Skills are richer than markdown previews imply | Skill cards showing allowed tools, effort, shell, model, hooks, path scope, invocation visibility |
| Plugin Inventory | Plugins are now a core Claude Code extension surface | First-class plugin category with built-in vs marketplace vs managed origin, plus provided skills/hooks/MCP |
| Provenance Model Refactor | Needed to support settings, policy, and richer effective logic consistently | Shared item metadata for source, active state, ignored reason, policy reason, effective group, signature |

## P1

| Feature | Why | Deliverable |
| --- | --- | --- |
| Permission Center | Permission mode and rules strongly affect runtime behavior | View of default mode, allow/deny/ask rules, managed-only restrictions, additional directories |
| Marketplace Governance Panel | Extension trust and policy are becoming more important | Known marketplaces, strict allowlists/blocklists, impersonation warnings, source metadata |
| Output/Behavior Settings Cards | Claude behavior depends on more than files and MCP | Surface `outputStyle`, `language`, `statusLine`, `fastMode`, `effortLevel`, `assistant` and similar settings |
| Worktree and Plan Settings | Claude has explicit worktree and plan settings CCO barely surfaces | Show worktree config, sparse paths, symlink dirs, plans directory |
| Memory and Session Settings | CCO sees sessions and memory files but not the controlling settings | Surface `autoMemoryEnabled`, `autoMemoryDirectory`, transcript retention, cleanup behavior |
| Effective MCP Governance View | Security scan is useful, but governance is still fragmented | Unified MCP detail panel combining config, policy, approval, dedup, and security findings |

## P2

| Feature | Why | Deliverable |
| --- | --- | --- |
| Runtime Behavior Explainer | Strong differentiator if done carefully | "Why Claude behaves this way" panel linking settings/mode/prompt sections |
| Remote / Assistant / Channels Visibility | Increasingly relevant modes, currently mostly invisible in CCO | Read-only runtime mode cards for remote defaults, assistant mode, channel-capable config |
| Plugin Config Viewer | Plugin configs are real user-controlled settings | Parsed `pluginConfigs` display, grouped by plugin id |
| Settings Schema Linting | Natural next step after parsing settings | Validation warnings for unknown/unsafe/conflicting config, linked to files and keys |
| Skill Linting | Skills have rich frontmatter with common failure modes | Warnings for invalid hooks, invalid effort, incomplete metadata, hidden but unexpected exposure |
| MCP Approval Management UX | Approval state is already modeled in Claude Code settings | Show approved/rejected `.mcp.json` servers and optionally offer guided edits later |

## P3

| Feature | Why | Deliverable |
| --- | --- | --- |
| System Prompt Composition View | High insight, but higher complexity | Breakdown of cacheable vs dynamic prompt sections and config-driven sections |
| Tool Pool / Mode Explorer | Useful but less urgent than settings and MCP | Read-only explanation of built-in tools, MCP tools, and mode-specific availability |
| Plugin Trust Scorecard | Security/governance differentiator | Marketplace/source trust heuristics plus plugin-provided surface summary |
| Session Memory Timeline | Nice addition after memory settings are solid | Show auto-memory/session-memory activity and relevant files |
| Guided Remediation Flows | Valuable after read-only intelligence is robust | Suggestions or auto-fixes for suppressed config, duplicate MCP, policy conflicts |

## Epics

## Epic A: Effective Configuration Intelligence

Includes:
- Effective Settings Explorer
- Policy-Aware Active/Ignored State
- Provenance Model Refactor
- Settings Schema Linting

Success looks like:
- users can tell what exists, what applies, why it applies, and why something is ignored

## Epic B: MCP Governance

Includes:
- MCP Deep Inspector
- Effective MCP Governance View
- MCP Approval Management UX

Success looks like:
- users understand each server's source, transport, approval state, policy state, signature identity, and security posture

## Epic C: Skills and Plugins

Includes:
- Parsed Skill Metadata
- Plugin Inventory
- Marketplace Governance Panel
- Plugin Config Viewer
- Skill Linting

Success looks like:
- extension surfaces become auditable and understandable, not opaque files/directories

## Epic D: Runtime Behavior Visibility

Includes:
- Permission Center
- Output/Behavior Settings Cards
- Worktree and Plan Settings
- Memory and Session Settings
- Remote / Assistant / Channels Visibility
- Runtime Behavior Explainer

Success looks like:
- CCO explains how Claude Code will behave, not only what files exist

## Suggested Default Ordering

1. Provenance Model Refactor
2. Effective Settings Explorer
3. Policy-Aware Active/Ignored State
4. MCP Deep Inspector
5. Parsed Skill Metadata
6. Plugin Inventory
7. Permission Center
8. Output/Behavior Settings Cards
9. Marketplace Governance Panel
10. Memory and Session Settings
11. Worktree and Plan Settings
12. Remaining P2/P3 features

## Things To Avoid

- Creating too many sidebar categories too early
- Mixing read-only explainability work with destructive editing flows in the same phase
- Shipping settings editing before effective/provenance views are trustworthy
- Treating plugin and MCP identity as name-only

## Shortlist for the Next Milestone

If only one milestone is possible, ship this bundle:

1. Effective Settings Explorer
2. Policy-Aware Active/Ignored State
3. MCP Deep Inspector
4. Parsed Skill Metadata

That would materially change CCO from organizer to configuration intelligence tool.
