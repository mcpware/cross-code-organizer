# F10 — Personal Vault and Reusable Profiles — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — discovery required**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f10--personal-vault-and-reusable-profiles`](../QA_PLAN.md#f10--personal-vault-and-reusable-profiles)

## User problem

Users may want to keep a reviewed skill, command, MCP definition, or settings fragment inactive, then reuse it later without rebuilding it from memory or making it globally active.

## Outcome

Create a CCO-owned inert vault with copy-first storage and previewable, reversible project profiles, if fresh discovery confirms demand.

## In scope candidate

- Vault outside every harness discovery root.
- Copy-first artifact storage.
- Settings fragments with semantic diff and reversible apply/remove.
- Project profiles referencing reviewed vault items.
- Secret references instead of casual credential duplication.

## Non-goals

- The vault is not a fake harness scope.
- It is not a backup replacement or sync service.
- Templates do not silently overwrite or claim cross-harness equivalence.

## Existing demand evidence

GitHub discussion #13 proposed a Holding Area, settings fragments, and project templates. The prior response correctly noted that disabled MCP/plugin states already solve part of the problem. One old discussion is insufficient to start implementation.

## Open decisions for Nicole

- Whether this pain is important enough after runtime work.
- Which artifact types v1 supports.
- Local-only versus optional user-managed sync.
- Secret reference format and supported credential stores.

## Discovery gate

Before approval, collect at least three concrete workflows that existing disable, backup, and copy-only migration cannot handle. Rewrite the scope around those workflows and remove unused artifact types.

## Acceptance criteria candidate

- Vault contents are provably inert to every supported harness.
- Profile apply is idempotent, conflict-aware, transactional, and reversible.
- Missing references and edited targets fail safely.
- Secrets never enter templates, logs, or browser payloads accidentally.

## Implementation-session boundary

No implementation session may start while this plan remains `discovery required`.
