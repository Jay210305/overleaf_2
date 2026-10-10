# Stage S00 Context

## Purpose

Run the unscheduled `sprint-00-bootstrap` work package through its bounded tasks. The [Roadmap](../../docs/planning/04-implementation-roadmap.md) owns stage scope, owner, estimates and dependencies.

## Inputs

- Working: one selected task from [Task Index](../README.md), its frontmatter dependencies and [S00 evidence](../../docs/progress/sprint-00.md).
- Reference: that task's Interface Contract links, [Contract Catalog](../../docs/contracts/README.md) and [Agent Workflow](../../docs/agent-workflow.md).
- Example entry: [S00-T01](S00-T01-inspect-repository-and-preserve-contributor-changes.md); inspect readiness before execution.

## Process

Inspect actual files, confirm dependency evidence, read only the selected task and its contracts, implement its authorized acceptance slice, and record checks actually performed. Use the [ICM impact route](../../docs/map/effects/CONTEXT.md) for changes. `CONTEXT.md` routes this folder and is not an implementation task.

## Outputs

Scoped code/doc changes plus task status and evidence when justified. Synchronize the task index, roadmap, [stage progress](../../docs/progress/sprint-00.md) and [feature inventory](../../docs/feature-parity.md) when completion changes. Existing task IDs and membership stay authoritative in the task index.

## Human Check

The accountable stage owner reviews task acceptance and evidence. Plans and file existence do not establish completion. Release/public-exposure gates follow the [Release Checklist](../../docs/planning/release-and-postmortem.md); missing tooling or credentials are recorded precisely.
