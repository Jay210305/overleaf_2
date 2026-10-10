# Change Impact Catalog

## Inputs and Process

Read the relevant object card below, then its owning source and selected task. Cards own direct relationships; this index routes to them. Before moving files, inspect referrers and resolve unknown external consumers described in [Map Context](../CONTEXT.md).

| Change | Open before editing |
|---|---|
| Scope, priorities, release gates or estimates | [Planning Baseline](../objects/planning-baseline.md), [Task Library](../objects/task-library.md), [Progress](../objects/progress-records.md) |
| HTTP schema or database shape | [Contracts](../objects/interface-contracts.md), [API/Data](../objects/api-and-durable-data.md), [Task Library](../objects/task-library.md) |
| Durable save or collaboration protocol | [API/Data](../objects/api-and-durable-data.md), [Browser](../objects/browser-and-editing.md), [Contracts](../objects/interface-contracts.md) |
| Compile input, artifact authorization or executor boundary | [Compilation](../objects/compilation-and-artifacts.md), [API/Data](../objects/api-and-durable-data.md), [Planning](../objects/planning-baseline.md) |
| Source-preserving visual editing | [Browser](../objects/browser-and-editing.md), [Contracts](../objects/interface-contracts.md), [Task Library](../objects/task-library.md) |
| Provider checkpoint, credentials or Git transport | [Adapters](../objects/provider-and-git-adapters.md), [Compilation/Artifacts](../objects/compilation-and-artifacts.md), [Contracts](../objects/interface-contracts.md) |
| A task's state or completion evidence | [Task Library](../objects/task-library.md), [Progress](../objects/progress-records.md) |
| Agent instructions or skill choice | [Agent Guidance](../objects/agent-guidance.md), [Tooling](../objects/documentation-tooling.md) |
| Map schema, catalogs or generated indexes | [Tooling](../objects/documentation-tooling.md), [Map Refresh](../processes/map-refresh.md) |

## Outputs and Human Check

Output is a scoped list of actual files and future consumers affected by the proposed change. Maintainers review synchronized contracts and evidence. A ghost consumer is a design update target, never an existing code edit target.
