# F2 — Runtime Engine Compatibility — Living Plan

Last updated: 2026-10-16 PT
Status: **Draft — requirements not approved**
Parent: [`../LIVING_PLAN.md`](../LIVING_PLAN.md)
QA gate: [`../QA_PLAN.md#f2--runtime-engine-compatibility`](../QA_PLAN.md#f2--runtime-engine-compatibility)

## User problem

CCO needs a shared MCP engine only if an existing implementation can safely serve independently launched harnesses. Kiro Crew Gateway already implements a sophisticated pool, while 1MCP exists locally; building another broker before testing both would be unjustified solo-founder scope.

## Outcome

Define a backend-neutral external-client contract, test Kiro Crew Gateway and 1MCP against it, and implement a read-only adapter only for an engine that passes. Produce a code-evidenced no-fit result before any CCO-owned broker can be proposed.

## In scope

- Versioned adapter contract for discovery, health, capability negotiation, inventory, client evidence, lifecycle support, and config import/export.
- Runtime states: absent, available, healthy, degraded, incompatible, and externally managed.
- A fake adapter for contract tests.
- Bounded compatibility probes for Kiro Crew Gateway and the existing local 1MCP runtime.
- Capability matrix: external attachment, authenticated session identity, pool-key semantics, stateful isolation, browser-per-session handling, lifecycle ownership, resource evidence, host budgets, failure containment, configuration handoff, rollback, install footprint, licensing and update burden.
- A read-only real adapter only after one engine satisfies the minimum contract.
- Timeouts, failure isolation, and explicit unsupported operations.

## Non-goals

- No user config migration; that belongs to F3.
- No policy engine; that belongs to F4.
- No automatic installation until its requirements are approved as a separate F2 slice.
- No CCO-owned MCP broker, proxy or daemon implementation.

## Locked decisions

- Stored CCO policy and ordinary UI cannot depend on 1MCP names or file layout.
- Stored CCO policy and ordinary UI cannot depend on Kiro Crew names or file layout either.
- CCO inventory remains usable when every runtime adapter fails.
- Adopt before build: an existing engine is preferred unless verified boundary evidence rules it out.
- One-click setup, if approved, must pin source/version and provide cleanup/rollback.

## Open decisions for Nicole

- Should v1 only adopt an existing runtime, or may CCO install one?
- Which platforms must the first adapter support?
- Is runtime ownership external, CCO-managed, or selectable per installation?

## Delivery slices

1. Freeze the external-client contract and fake-adapter fixtures.
2. Inspect and probe Kiro Crew Gateway at a pinned revision without adopting its workspace runtime.
3. Inspect and probe the existing local 1MCP runtime against the same cases.
4. Publish a side-by-side pass/fail/unknown matrix and smallest missing boundary for each engine.
5. Implement read-only discovery/health for the selected engine, if any.
6. Optional setup only after a separate approved slice.

## Acceptance criteria

- Fake adapters cover every state and capability combination.
- Either engine's absence, crash, timeout, license incompatibility or version mismatch does not block CCO.
- Generic schemas and normal UI contain no backend-specific dependency.
- Adapter child processes terminate cleanly and do not leak secrets.
- F2 QA passes with neither engine and with the selected engine installed.
- The final report records why the rejected engine failed; `not tested` is not a rejection.
- A new CCO broker remains unauthorized unless both engines have a verified no-fit result.

## Implementation-session boundary

The F2 session owns the contract, compatibility experiment and at most one read-only selected adapter. It may not alter harness configuration, add shared-pool migration or implement a new broker.

## Research basis

A maintainer primary-source audit reviewed [Kiro Crew](https://github.com/kirodotdev/KiroCrew) and [1MCP](https://github.com/1mcp-app/agent). Kiro Crew's Apache-2.0 source already contains pool identity, shareability evidence, private fallback, host budgets and lifecycle handling; F2 must revalidate a pinned revision and test reuse/integration before replacing it.
