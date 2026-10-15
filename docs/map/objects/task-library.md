---
type: object
cluster: execution
universe: live
status: verified
entity: implementation/README.md
sources: ["implementation/README.md","docs/planning/04-implementation-roadmap.md","docs/planning/traceability.md","implementation/sprint-00-bootstrap/S00-T02-write-permanent-agent-execution-rules.md","implementation/sprint-02-identity-permissions/S02-T08-verify-tenancy-revocation-suspension-and-csrf.md","implementation/sprint-08-sharing-comments-chat/S08-T01-implement-expiring-email-invitations.md","implementation/sprint-08-sharing-comments-chat/S08-T02-implement-bounded-hashed-share-links.md","implementation/sprint-08-sharing-comments-chat/S08-T03-create-sharing-and-role-management-ui.md","docs/test-reports/s08-t03.md"]
runtime: not-applicable
verified_on: 2026-10-15
snapshot: _meta/file-inventory.json
---

# Task Library

## Summary

Implementation task files hold bounded slices, dependencies, acceptance criteria and verification instructions.

## Why this shape

A selected task should carry enough local context to execute without reading the master plan.

## Shape

S00–S15 directories contain Sxx-Tyy task files. ID, status, effort, dependencies and requirement IDs are frontmatter. CONTEXT.md files route each stage and are not tasks. All 11 S02 task slices have independent acceptance; the G1 release gate remains separate.

S05-T10 is the in-progress bounded ZIP project-application slice after accepted S05-T03 validation and S05-T12 intake. Its approved plan and [scoped report](../../test-reports/s05-t10.md) separate implementation evidence from independent acceptance.

Sprint 8 is on its published dedicated branch. S08-T01–T05 and T09 are accepted. S08-T06–T08 and T10 remain unstarted. [Sprint progress](../../progress/sprint-08.md) owns the current matrix.

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
- [S08-T01 task](../../../implementation/sprint-08-sharing-comments-chat/S08-T01-implement-expiring-email-invitations.md)
- [S08-T02 task](../../../implementation/sprint-08-sharing-comments-chat/S08-T02-implement-bounded-hashed-share-links.md)
- [S08-T03 task](../../../implementation/sprint-08-sharing-comments-chat/S08-T03-create-sharing-and-role-management-ui.md)
- [S08-T04 task](../../../implementation/sprint-08-sharing-comments-chat/S08-T04-implement-anchored-comments-and-replies.md)
- [S08-T09 task](../../../implementation/sprint-08-sharing-comments-chat/S08-T09-render-comment-anchor-and-reply-interactions.md)
- [S08-T05 task](../../../implementation/sprint-08-sharing-comments-chat/S08-T05-create-authorized-durable-project-chat.md)
