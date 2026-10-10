# Project Agent Entry

Collaborative LaTeX editor maintained by Julio and the Project Co-owner.
Documentation is in English. Follow the user's language when conversing.

## Start Here

1. Read [Workspace Context](CONTEXT.md) and [Agent Workflow](docs/agent-workflow.md).
2. Inspect actual files and contributor changes before choosing work.
3. Open the relevant route below, then one task and its required contracts.

## Routing

| Need | Open |
|---|---|
| Scope, release gates, team assumptions | [Discovery](docs/planning/00-discovery.md) |
| Planning package | [Planning Catalog](docs/planning/README.md) |
| Select a task and inspect dependencies | [Task Index](implementation/README.md) |
| Interfaces and invariants | [Contract Catalog](docs/contracts/README.md) |
| Understand an area or a change's impact | [ICM Map](docs/map/AGENTS.md) |
| Choose a skill | [Skill Catalog](docs/skills/README.md) |
| Record progress and blockers | [Progress Contract](docs/progress/CONTEXT.md) |
| Validate planning documents | [Validation Contract](scripts/CONTEXT.md) |

## Required Boundaries

The English planning package is the operative baseline; preserve the two original source documents.
Read [Agent Workflow](docs/agent-workflow.md) before implementation or changing task status.
Read [Skill Catalog](docs/skills/README.md) before invoking or adding a skill.
Use `icm-architect` for project mapping; follow [Map Context](docs/map/CONTEXT.md).
Check the actual skill inventory: an external recommendation is not an installed capability.

## graphify

**Trigger:** `/graphify`.
When the user types `/graphify`, read and follow the installed graphify skill before doing anything else.
Skill location: `~/.codex/skills/graphify/SKILL.md` (Windows paths are case-insensitive).
Use the [ICM Map](docs/map/AGENTS.md) as orientation; graph generation follows graphify's own instructions.
