---
type: process
universe: live
status: verified
sources: ["docs/planning/execution-guide.md", "docs/agent-workflow.md", "scripts/plan_lint.py"]
consumes: ["planning-baseline", "interface-contracts", "task-library"]
produces: ["planning-baseline", "task-library", "progress-records"]
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Planning Maintenance

## Input → Movement → Output

Input: an authorized design/status change and its owning requirement, task or contract. Movement: edit that owner and synchronize its direct references. Output: reviewable English planning files and actual evidence records.

## Why this shape

Stable IDs and source provenance prevent a task split or new decision from losing coverage.

## Steps

1. Inspect the owning task and actual repository state using [Execution Guide](../../planning/execution-guide.md).
2. Follow [Agent Workflow](../../agent-workflow.md) and the relevant [impact route](../effects/CONTEXT.md); preserve the original source inputs.
3. Update index/roadmap/traceability and progress only where the change requires it.
4. Validate document structure with [plan_lint.py](../../../scripts/plan_lint.py); review output as documentation evidence.

## If you change this

- **Hits:** agent workflow, task status conventions, validator assumptions and progress evidence.
- **Does not hit:** runtime implementation merely from synchronizing planning documents.

## Surfaces

Maintainers and authorized agents edit the files; maintainers review the saved result.

## See

- [Planning](../objects/planning-baseline.md), [Contracts](../objects/interface-contracts.md), [Tasks](../objects/task-library.md), [Progress](../objects/progress-records.md).
- Source: [Execution Guide](../../planning/execution-guide.md).
