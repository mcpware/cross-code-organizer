# Harness Doctor control-plane plan

> **Historical v0.20 slice.** This document records the original Harness Doctor
> contract. It no longer controls the product backlog. The canonical overall
> roadmap is [LIVING_PLAN.md](LIVING_PLAN.md), and its release/feature evidence
> gates are in [QA_PLAN.md](QA_PLAN.md).

## Outcome

CCO should answer four questions for any supported coding harness:

1. What configuration and context can affect this scope?
2. Which source wins when definitions overlap?
3. What is wasteful, stale, conflicting, or difficult to discover?
4. Which safe, reversible action can CCO take?

The first vertical slice ships in v0.20.0 as Harness Doctor.

## v1 contract

### Effective Context Map

- Use only inheritance and precedence rules declared by the active harness adapter.
- Label adapters without a declared runtime model as `inventory-only`.
- Show direct, ancestor, and global sources, per-category counts, settings winners, override counts, and a byte-based token estimate.
- Never expose setting values in the map UI.

### Hygiene score

- Every deduction must have a visible count, reason, and deterministic weight.
- v1 signals: same-scope duplicate identities, missing descriptions, context artifacts over 20 KiB, sessions older than 180 days, settings overrides, and byte-identical repair candidates.
- The score is a local diagnostic heuristic, not a security certification.

### Reversible repair

- Automatic repair is restricted to unlocked, same-scope, same-category, same-name artifacts with identical SHA-256 fingerprints.
- Archive instead of delete, store a private transaction manifest, and provide Undo.
- Refuse stale previews, symlinks, paths outside adapter roots, changed backups, occupied restore paths, and Undo after a migrated target was edited.

### Cross-harness migration

- v1 supports portable `SKILL.md` directory bundles only.
- Copy; never move the source.
- Preview ready, conflict, identical, and unsupported states.
- Do not overwrite by default. Preserve an overwritten target in the transaction payload when an explicit future flow enables overwrite.
- Do not infer compatibility for MCP, settings, hooks, commands, agents, or instruction formats until each conversion has a tested semantic mapping.

### Privacy-preserving metrics

- Disabled by default and local-only.
- Fixed event and harness allowlists; no arbitrary properties.
- Store UTC-day counts and coarse inventory buckets for 30 days.
- Never collect paths, file names, customization names, prompts, session contents, or credentials.
- A day-scoped HMAC preview may be shown locally. v1 has no upload endpoint.

## Acceptance evidence

- Unit coverage for context selection, settings precedence, hygiene deductions, fingerprinted repair, conflict-safe Undo, copy-only migration, and metrics privacy.
- Browser/API coverage for rendering the Doctor, producing a report, and migration apply/undo against a real temporary filesystem.
- Full unit and E2E suites pass, `npm audit` reports no advisories, and the packed npm artifact contains only intended runtime files.

## Next slices

1. Body search across projects and harnesses with source-aware editing.
2. Broken reference, unreachable MCP, stale path, and semantic-overlap findings.
3. Runtime observations that distinguish always-loaded, advertised, on-demand, and inactive context.
4. Explicit semantic converters for additional artifact types, one harness pair at a time.
5. Separate the activation-scanner research corpus from the runtime distribution and keep only compact regression fixtures in this repository.

## Non-goals

- Claiming that a hygiene score proves a harness is secure.
- Automatically deleting non-identical content.
- Treating all harnesses as if they share Claude Code precedence.
- Uploading metrics or user configuration in v1.
- Adding broad write access to HOME or following symlinks during repair and migration.
