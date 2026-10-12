---
type: object
cluster: execution
universe: live
status: verified
entity: implementation/README.md
sources: ["implementation/README.md","docs/planning/04-implementation-roadmap.md","docs/planning/traceability.md","implementation/sprint-00-bootstrap/S00-T02-write-permanent-agent-execution-rules.md","implementation/sprint-02-identity-permissions/S02-T08-verify-tenancy-revocation-suspension-and-csrf.md"]
runtime: not-applicable
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Task Library

## Summary

Implementation task files hold bounded slices, dependencies, acceptance criteria and verification instructions.

## Why this shape

A selected task should carry enough local context to execute without reading the master plan.

## Shape

S00–S15 directories contain Sxx-Tyy task files. ID, status, effort, dependencies and requirement IDs are frontmatter. CONTEXT.md files route each stage and are not tasks. S02-T08 is the current security-verification slice and awaits independent review.

## Connected to

Consumes planning requirements and contracts; completion evidence is owned by Progress Records.

## If you change this

- **Hits:** Task index, roadmap, traceability, affected dependency references and stage progress when membership/status changes.
- **Does not hit:** Completed product claims: editing a task specification alone supplies no runtime evidence.

## Surfaces

Maintainers/agents select and edit tasks; the validator checks structural consistency.

## See

- [implementation/README.md](../../../implementation/README.md)
- [docs/planning/04-implementation-roadmap.md](../../planning/04-implementation-roadmap.md)
- [docs/planning/traceability.md](../../planning/traceability.md)
- [implementation/sprint-00-bootstrap/S00-T02-write-permanent-agent-execution-rules.md](../../../implementation/sprint-00-bootstrap/S00-T02-write-permanent-agent-execution-rules.md)
- [S02-T08 task](../../../implementation/sprint-02-identity-permissions/S02-T08-verify-tenancy-revocation-suspension-and-csrf.md)
