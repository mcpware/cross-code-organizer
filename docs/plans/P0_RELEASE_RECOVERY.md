# P0 — Release Recovery and Product Truth — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#p0--release-recovery`](../QA_PLAN.md#p0--release-recovery)

## User problem

The repository and tag contain v0.20.0, while npm `latest` and GitHub Releases still expose v0.19.3. Users cannot reliably obtain the version described by current project documentation.

## Outcome

Publish one coherent, installable baseline whose npm package, MCP Registry entry, GitHub Release, provenance, documentation, and observed behavior all agree.

## In scope

- Inspect the authenticated npm trusted-publisher tuple and package ownership.
- Decide whether to recover v0.20.0 or cut a superseding version if registry rules make the existing tag unsuitable.
- Run the existing idempotent pipeline after configuration is corrected.
- Verify all public artifacts and a clean install.
- Reconcile roadmap statuses and remove public claims that exist only in the frozen runtime branch.
- Decide whether CCO keeps the activation-research corpus or retains only compact fixtures and links to IntentProbe.

## Non-goals

- No runtime feature implementation.
- No dependency upgrade unless it is required to make the approved release safe and reproducible.
- No long-lived npm token fallback.

## Known evidence

- Latest npm version: 0.19.3.
- Tag v0.20.0 exists.
- Publish run `38975225907` passed verification, tests, audit, pack, and provenance, then npm returned `E404` during publish.
- GitHub Release creation occurs only after npm and MCP Registry verification, so no v0.20.0 release was created.

## Open decisions for Nicole

- Recover version 0.20.0, or supersede it if npm requires a new version.
- Keep or separate the CCO research corpus.

## Delivery steps

1. Record the exact intended release version and immutable commit.
2. Verify publisher configuration without exposing credentials.
3. Run release QA from a clean checkout.
4. Publish once through the reviewed workflow.
5. Verify every registry and install the public artifact.
6. Reconcile public documentation and mark this plan Shipped.

## Acceptance criteria

- The intended version is returned by npm `latest` and installs on a clean machine.
- npm, MCP Registry, GitHub Release, provenance, package metadata, and release notes use the same version.
- `--help`, `--version`, and dashboard startup work from the published tarball.
- No unmerged runtime feature is described as shipped.
- A dated QA report records exact commands, artifact identifiers, and results.

## Implementation-session boundary

The release session may change release configuration and truthful release documentation only. Any product-code fix discovered during release QA stops this plan and returns the defect to PM triage.

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-10-16 | Release recovery precedes F1. | A stable public baseline is required before stacking another unreleased feature. |
