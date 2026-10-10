# Implementation Library Context

Inputs: [Task Index](README.md), selected stage contract and task frontmatter/dependency evidence.
Process: work through S00–S15 as unscheduled dependency-ordered stages. Read one task plus its contracts; confirm readiness before execution and preserve stable IDs.
Outputs: scoped implementation, actual evidence and synchronized task/progress state.
Human check: a stage folder contains specifications, not completed software. Follow [Agent Workflow](../docs/agent-workflow.md); product commands must exist before invocation.
