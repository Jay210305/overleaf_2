# Open Gaps and Execution Gates

These are factual execution prerequisites. Delegated planning decisions do not manufacture research, credentials or passing tests.

| ID | Gap | Owner (proposed) | Resolving task | Status |
|---|---|---|---|---|
| GAP-01 | Compatible Node/pnpm/editor tooling and local Docker | Julio | S00-T01, S00-T11, S00-T07 | Node 24.21.0/pnpm 11.25.0 and real Compose services verified in [S00 continuation](../test-reports/s00-verification.md). Provider 4.4.0 and y-protocols 1.0.6 metadata/license resolved; runtime editor/collaboration installation and interoperability remain S04/S07 work |
| GAP-02 | Trusted runtime image/flags/resource capabilities | Julio | S06-T12, S06-T03, S06-T13 | NOT_VERIFIED |
| GAP-03 | Conservative parser range fidelity/license | Project Co-owner | S11-T01 | NOT_VERIFIED |
| GAP-04 | Authorized provider accounts/scopes and legitimate API capabilities | Project Co-owner | S13-T03 and provider tasks | NOT_VERIFIED; credentials not requested |
| GAP-05 | Git HTTP engine/protocol/license | Julio | S14-T01 | NOT_VERIFIED |
| GAP-06 | Actual public isolation/adversarial evidence | Project Co-owner | S15-T01, S15-T13, S15-T02 | NOT_VERIFIED; public flags false |
| GAP-07 | Weekly availability and actual throughput | Both | Session logs/re-estimation | Variable; no timebox required |
| GAP-08 | Hosted accounts/domains/current limits and optional paid services | Both | S06-T15 and later deploys | NOT_SELECTED; local development can proceed |
| GAP-09 | Independent review of permanent agent execution rules | Project Co-owner | S00-T02 | CLOSED 2026-10-10: Project Co-owner accepted [S00-T02 report](../test-reports/s00-t02.md) and root `AGENTS.md` in this task conversation |
| GAP-10 | Independent acceptance of S00 continuation | Project Co-owner | S00-T04 through T10 and T12 | CLOSED 2026-10-10: Project Co-owner reviewed and accepted S00 continuation; all 12 S00 tasks closed |
| GAP-11 | Current Codex host initially could not invoke pinned pnpm scripts through the fallback launcher | Local execution environment | Use the installed pinned pnpm CLI with the system Node runtime | CLOSED 2026-10-10: the cached pnpm 11.25.0 CLI installed dependencies and ran S02 typecheck, lint, build and tests through the local service stack; the fallback wrapper remains unsuitable in this sandbox |
| GAP-12 | S01-T05 reports OpenAPI generation and validator agreement, but the inspected runtime has static `docs/api/openapi.json`; no generation command or DTO-to-OpenAPI parity assertion was found, and its test checks only file existence/version/path count | Project Co-owner | Recheck S01-T05 acceptance against its task contract and add generation/parity evidence or correct the scoped claim | OPEN 2026-10-10: finding from repository inspection; accepted task status retained pending co-maintainer review |
| GAP-13 | Repository-wide `pnpm format:check` fails on 94 files outside the S02-T01 changed set; the changed code, manifests and test files pass targeted Prettier check | Both maintainers | Choose a separate formatting-baseline cleanup and review its broad diff, then rerun QG-01 | OPEN 2026-10-10: QG-01 remains failed; S02-T01 cannot be marked done on the current whole-repository gate |

Track visibly unavailable stubs during implementation. Missing credentials means BLOCKED_BY_CREDENTIALS; unavailable capability means BLOCKED_BY_PROVIDER. No product feature is currently DONE.
