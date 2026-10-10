# Execution Guide

## Source of Truth

The English package is the operative baseline under the user's scope delegation. Task files carry local context and reference authoritative contracts. The original Spanish master is retained unchanged for provenance; its whole-document reading instruction is superseded for this reorganized workflow. Discovery and ADR-006 record the methodology adaptations.

## Agent Rules for S00

Permanent routing now starts at [AGENTS.md](../../AGENTS.md). Read the
[Agent Workflow](../agent-workflow.md), [Skill Catalog](../skills/README.md)
and relevant [ICM impact route](../map/effects/CONTEXT.md) for the selected task.
This documentation setup does not complete S00 prerequisites or product acceptance.

1. Inspect actual files and git status/diff; preserve contributor work.
2. Select a Ready task; explain contracts, security and migrations.
3. Implement genuine UI/API/storage behavior; no dummy PDF or local-only persistence claim.
4. Test first and run applicable shared quality gates; report real outputs/failures.
5. Update task/index/roadmap status, feature evidence, progress, contracts/ADRs and actual hours.
6. Verify dependency compatibility/licenses and pin package/image versions at installation.
7. Keep secrets/private source out of code, bundles, logs, snapshots and prompts.
8. Keep compilation separate and fail-closed. Preserve existing graphify trigger instructions when creating AGENTS.md.

## Initial Prompt

```text
Read docs/planning/README.md, docs/planning/00-discovery.md,
implementation/README.md and the selected S00 task plus its contracts.
Inspect the repository and preserve contributor changes.
Implement only Ready S00 tasks: reproducible typed bootstrap, browser/API
walking skeleton, compatible pinned tooling and honest feature inventory.
Use React/Vite/TypeScript, Fastify and local PG/Redis/MinIO/Mailpit.
Create permanent agent rules and shared quality scripts.
No later feature, dummy PDF, public compile or secret can be claimed done.
Record files, actual checks, failures, hours and the next Ready task.
```

## Reusable Task Prompt

```text
Read AGENTS.md if present, the selected task file and its contracts.
Inspect dependencies and confirm Ready; record any precise blocker.
Implement scoped acceptance with real behavior and test-first slices.
Run applicable quality scripts/task assertions; record actual output.
Update status, feature evidence, sprint progress, contracts/ADRs and hours.
Report failures and next Ready task; planned tests or mocked connectivity
cannot be presented as completed functionality.
```

## Independent Gate Review Prompt

```text
Audit the implemented gate against English requirements and traceability.
Inspect source, policies, migrations, CRDT, compiler and deployment tests.
Add no new feature. Write docs/test-reports/gate-gN-audit.md with
requirement → implementation → test → result, actual commands/environment,
severity-ranked gaps and PASS/FAIL. A critical unresolved gap means FAIL.
Identify false DONE and blocked/unsupported provider claims explicitly.
```

## Collaboration

Contributors may work on independent stable-contract modules. Coordinate migrations, lockfile, AGENTS.md and contracts; avoid concurrent edits to shared files. Sprint owner integrates/reviews. Agent delegation is optional and requires authorization for that execution. This migration starts no product implementation and dispatches no subagents.
