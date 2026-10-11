# Current Map Review

**Date:** 2026-10-10. **Branch:** `codex/sprint-01-data-contracts` at `83b694f`, tracking origin with no ahead/behind commits before this map edit. The starting worktree was clean. This review adds map documentation only.

## Current Cold Walks

| Question | Route and observed boundary |
|---|---|
| What data layer exists? | Root AGENTS → map catalog → Data Model and Persistence → `packages/db/src/client.ts` and migrations. S01 schema, transactions and project listing exist; identity and canonical Yjs update services do not. |
| Where are private objects handled? | Catalog → Private Object Storage → `packages/storage/src/s3.ts`. MinIO adapter and key checks exist; user membership authorization and public object routes do not. |
| Can this compile TeX? | Catalog → Compilation and Artifacts → compilation contract. Tables and storage types exist, but executor, generated PDF and public isolation evidence do not. |
| What happens after a data change? | Effects catalog → Data Model, Contracts and API cards. Direct migration, repository, tests and DTO consumers are named. |

## Current Checks and Limits

`build_icm_map.py --check` PASS: 13 cards (11 live, 2 ghost), 2 documentation processes; `plan_lint.py` PASS: 183 tasks, 93 requirements, 16 stages and 120 planned HTTP operations. `git diff --check` PASS. The installed `pnpm` fallback failed with `EPERM` before `lint` and `typecheck` scripts started; Corepack could not fetch pinned pnpm 11.25.0 because registry DNS was unavailable. `test` and `build` were not rerun. This is [GAP-11](../../progress/open-gaps.md); stored S01 test reports are earlier evidence.

The map builder validates metadata, paths, links and source hashes, not product behavior or security. External path consumers remain unknown. No files were relocated.

The interface-contract walk also found [GAP-12](../../progress/open-gaps.md): S01-T05 acceptance language says OpenAPI generation, while inspected code and its test show a static planned JSON file without a generation/parity check. The accepted task status is unchanged pending review.

---

# Initial Map Review

**Date:** 2026-10-10. **Scope:** additive agent setup, skill research and documentation mapping. Product implementation remains unverified.

## Cold Walks

| Question | Observed route | Result |
|---|---|---|
| What owns durable save? | Root AGENTS → map catalog → API/Durable Data card → collaboration contract | Owner found; transaction commit before ACK and pending/saved distinction confirmed in cited design. Runtime remains `ghost`. |
| Which skill applies to a frontend task? | Root AGENTS → Skill Catalog → React/Currents entries | Upstream source, stage fit, Vite limitations and uninstalled status are explicit. |
| Where does stage evidence live? | S07 CONTEXT → selected task and S07 progress | Exact input/output paths resolve; stage folder is not completion evidence. |
| What moves after a contract change? | Effects catalog → Interface Contracts/Task Library cards | Direct design surfaces identified; original source documents remain provenance. |

## Structural Evidence

Observed `build_icm_map.py --check`: PASS; 10 object cards (6 live, 4 ghost), 2 documentation processes. Observed `plan_lint.py`: PASS; 183 tasks, 93 requirements, 16 stages, 1,320 task hours; original sources/IDs preserved and 120 planned HTTP operations checked.

The working-file inventory records source SHA-256 and the git baseline. Rebuild/check it after this report or any other source edit. The source catalog generates byte-identical map AGENTS/routing twins; root AGENTS is 38 lines.

## Limits

No external skills installed; no application tests, build, compiler execution, deployment or isolation audit performed. External path consumers remain unknown. The builder validates metadata, paths and hashes; impact prose was reviewed through these scoped walks, not proven by automated runtime analysis.
