# Change Impact Catalog

## Inputs and Process

Read the relevant object card below, then its owning source and selected task. Cards own direct relationships; this index routes to them. Before moving files, inspect referrers and resolve unknown external consumers described in [Map Context](../CONTEXT.md).

| Change | Open before editing |
|---|---|
| Scope, priorities, release gates or estimates | [Planning Baseline](../objects/planning-baseline.md), [Task Library](../objects/task-library.md), [Progress](../objects/progress-records.md) |
| HTTP route or DTO | [Contracts](../objects/interface-contracts.md), [API](../objects/api-and-durable-data.md), [Task Library](../objects/task-library.md) |
| Database shape, migration or repository | [Data Model](../objects/data-model-and-persistence.md), [Contracts](../objects/interface-contracts.md), [API](../objects/api-and-durable-data.md) |
| Durable save or collaboration protocol | [Data Model](../objects/data-model-and-persistence.md), [Browser](../objects/browser-and-editing.md), [Contracts](../objects/interface-contracts.md) |
| Private object key, scope or URL | [Private Storage](../objects/private-object-storage.md), [API](../objects/api-and-durable-data.md), [Contracts](../objects/interface-contracts.md) |
| Compile input, artifact authorization or executor boundary | [Compilation](../objects/compilation-and-artifacts.md), [Private Storage](../objects/private-object-storage.md), [Data Model](../objects/data-model-and-persistence.md) |
| Source-preserving visual editing | [Browser](../objects/browser-and-editing.md), [Contracts](../objects/interface-contracts.md), [Task Library](../objects/task-library.md) |
| Provider checkpoint, credentials or Git transport | [Adapters](../objects/provider-and-git-adapters.md), [Compilation/Artifacts](../objects/compilation-and-artifacts.md), [Contracts](../objects/interface-contracts.md) |
| A task's state or completion evidence | [Task Library](../objects/task-library.md), [Progress](../objects/progress-records.md) |
| Agent instructions or skill choice | [Agent Guidance](../objects/agent-guidance.md), [Tooling](../objects/documentation-tooling.md) |
| Map schema, catalogs or generated indexes | [Tooling](../objects/documentation-tooling.md), [Map Refresh](../processes/map-refresh.md) |

## Outputs and Human Check

Output is a scoped list of actual files and future consumers affected by the proposed change. Maintainers review synchronized contracts and evidence. A ghost consumer is a design update target, never an existing code edit target.
