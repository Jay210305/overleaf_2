---
type: object
cluster: tooling
universe: live
status: verified
entity: AGENTS.md
sources: ["AGENTS.md","CONTEXT.md","docs/agent-workflow.md","docs/skills/README.md","docs/planning/execution-guide.md"]
runtime: not-applicable
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Agent Guidance

## Summary

Root AGENTS.md routes execution to workflow, plans, skills and the ICM map, states core execution rules, and preserves the graphify trigger.

## Why this shape

A small entry helps agents find one owning source instead of loading the entire repository.

## Shape

Root routing, concise execution boundaries and workspace context; detailed agent workflow and skill catalog live on their own shelves. Recommended external skills are not installed by this setup.

## Connected to

Reads Planning Baseline and Task Library; ICM maps changes, while /graphify invokes its separate installed skill.

## If you change this

- **Hits:** Related context routes, skill availability/revision notes and generated map catalog when navigation changes.
- **Does not hit:** Product task completion or software dependency installation merely from adding a skill recommendation.

## Surfaces

Agents read guidance; maintainers and authorized setup agents edit it. Catalog availability is session-specific.

## See

- [AGENTS.md](../../../AGENTS.md)
- [CONTEXT.md](../../../CONTEXT.md)
- [docs/agent-workflow.md](../../agent-workflow.md)
- [docs/skills/README.md](../../skills/README.md)
- [docs/planning/execution-guide.md](../../planning/execution-guide.md)
