# Project System Map

Catalog source: edit this file; `python scripts/build_icm_map.py` regenerates its twins.
`AGENTS.md` and `routing.md` in this folder must remain byte-identical to this catalog.

The subject is the current planning repository for a collaborative LaTeX editor.
`live` means a document/tool in force; `ghost` means a proposed runtime component.
`verified` on a live document card verifies its cited file, not implemented product behavior.
Sprint means an unscheduled work stage; Project Co-owner means the user's unnamed contributor role.

| Question | Open |
|---|---|
| How does this map work? | [Context](CONTEXT.md) |
| Which objects are mapped? | [Generated Object Index](objects/_index.md) |
| What owns scope and gates? | [Planning Baseline](objects/planning-baseline.md) |
| What owns interfaces? | [Interface Contracts](objects/interface-contracts.md) |
| How is work divided? | [Task Library](objects/task-library.md) |
| Where is actual completion evidence? | [Progress Records](objects/progress-records.md) |
| What validates planning structure? | [Documentation Tooling](objects/documentation-tooling.md) |
| What validates the typed pnpm workspace? | [Workspace Tooling](objects/workspace-tooling.md) |
| How are skills selected? | [Agent Guidance](objects/agent-guidance.md) |
| What editor code is proposed? | [Browser and Editing](objects/browser-and-editing.md) |
| What API/data code is proposed? | [API and Durable Data](objects/api-and-durable-data.md) |
| What compile/storage code is proposed? | [Compilation and Artifacts](objects/compilation-and-artifacts.md) |
| What external integration code is proposed? | [Provider and Git Adapters](objects/provider-and-git-adapters.md) |
| What should I read before changing something? | [Change Impact](effects/CONTEXT.md) |
| How do document changes propagate? | [Planning Maintenance](processes/planning-maintenance.md) |
| How is the map refreshed? | [Map Refresh](processes/map-refresh.md) |

Open one card and its owning source. Do not load all cards or interpret a proposed path as code.
