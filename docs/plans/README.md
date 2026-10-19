# CCO Feature Living Plans

Last updated: 2026-10-16 PT
Status: planning index

The master sequence lives in [`../LIVING_PLAN.md`](../LIVING_PLAN.md). Each release gate or feature has its own Living Plan below. A feature-specific plan, not the master roadmap alone, is the implementation contract for a future session.

| ID | Living Plan | Current status |
|---|---|---|
| P0 | [Release Recovery and Product Truth](P0_RELEASE_RECOVERY.md) | Draft — requirements not approved |
| F1 | [External Runtime Reality Map](F1_LIVE_RUNTIME_MAP.md) | Draft — requirements not approved |
| F13 | [Session Admission Preview](F13_SESSION_ADMISSION_PREVIEW.md) | Draft — requirements not approved |
| F2 | [Runtime Engine Compatibility](F2_SHARED_RUNTIME_ADAPTER.md) | Draft — requirements not approved |
| F14 | [Action-linked Context Evidence](F14_CONTEXT_TOKEN_LEDGER.md) | Draft — requirements not approved |
| F3 | [Consolidate into Shared Pool](F3_SHARED_POOL_MIGRATION.md) | Draft — requirements not approved |
| F4 | [Runtime Policy and Isolation](F4_RUNTIME_POLICY.md) | Draft — requirements not approved |
| F5 | [Lifecycle and Resource Guardrails](F5_RESOURCE_GUARDRAILS.md) | Draft — requirements not approved |
| F6 | [Runtime Security and Quarantine](F6_RUNTIME_SECURITY.md) | Draft — requirements not approved |
| F7 | [Hygiene Findings v2](F7_HYGIENE_FINDINGS.md) | Draft — requirements not approved |
| F8 | [Context and Runtime Relationship Graph](F8_RELATIONSHIP_GRAPH.md) | Draft — requirements not approved |
| F9 | [Headless CLI and JSON Contract](F9_HEADLESS_CLI.md) | Draft — requirements not approved |
| F10 | [Personal Vault and Reusable Profiles](F10_PERSONAL_VAULT.md) | Draft — discovery required |
| F11 | [Semantic Portability and Adapter Expansion](F11_PORTABILITY.md) | Draft — discovery required |
| F12 | [Team Baselines](F12_TEAM_BASELINES.md) | Draft — later enterprise extension |

## State model

Every plan uses one of these states:

1. `Draft — requirements not approved`
2. `Approved for implementation`
3. `In implementation`
4. `Implementation complete — QA pending`
5. `QA failed` or `QA passed — integration pending`
6. `Integrated — release pending`
7. `Shipped` or `Deferred`

Only Nicole can move a plan from Draft to Approved. An implementation session may update progress, discoveries, and evidence, but may not silently change the approved user outcome or add another feature packet.

## Required update points

Update the relevant Living Plan when:

- a requirement, non-goal, interface, dependency, or product decision changes;
- implementation discovers an assumption that affects user behavior;
- QA produces a failure, limitation, or residual risk;
- integration or release changes the actual public state.

Every implementation and QA session must begin by reading the master roadmap, the exact feature Living Plan, and the relevant section of [`../QA_PLAN.md`](../QA_PLAN.md).
