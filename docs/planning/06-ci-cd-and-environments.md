# CI/CD and Environments

## Uniform Quality Gates

S00 implements the local/CI scripts below for its delivered scope. GitHub Actions uses the same scripts; remote execution status is in [S00 verification](../test-reports/s00-verification.md). No later product tests are implied by bootstrap checks.

| Gate | Local and CI command | Pass condition |
|---|---|---|
| QG-01 Formatting | `pnpm format:check` | Zero formatting violations |
| QG-02 Lint and boundaries | `pnpm lint` | Zero errors; forbidden browser/server imports rejected |
| QG-03 Types | `pnpm typecheck` | Strict typecheck passes for all workspaces |
| QG-04 Unit and coverage | `pnpm test -- --coverage` | All unit tests pass; critical-module line and branch coverage >=80% |
| QG-05 Contracts and integration | `pnpm test:integration` | Matching producer/consumer schemas, real services, migrations, permissions, jobs and durability pass |
| QG-06 Build | `pnpm build` | All applicable apps/packages build from the pinned lockfile |
| QG-07 Dependencies and secrets | `pnpm security:check` | Zero exposed secrets; no unreviewed high/critical dependency finding |
| QG-08 Browser gate | `pnpm test:e2e` | Current-gate scenarios pass; axe has zero serious/critical findings plus manual keyboard review |
| QG-09 Artifact / migration | `pnpm artifacts:check` | Real fixture artifacts and schema migration validation pass |
| QG-10 Plan consistency | `python scripts/plan_lint.py` | Valid IDs, links, hours, dependency DAG and requirement coverage |

Before a capability is implemented its product gate is NOT_IMPLEMENTED, not PASS. Gate scope may defer later features but cannot exempt security/permission checks on delivered behavior. Document coverage exclusions. Dependency vulnerabilities need remediation or a documented nonapplicable assessment; secret leaks always block.

## Environments

- Local: Node LTS chosen for dependency compatibility, pinned package manager, Docker/Compose PostgreSQL/Redis/MinIO/Mailpit; own trusted fixtures.
- Staging: disposable data, explicit accounts, exact Origin/CORS policy, protected credentials, real integration and restore exercises.
- Trusted release: Vercel browser plus separate Railway API/collab/jobs/services when selected; trusted-user allowlist; public and untrusted flags disabled.
- Public release: optional G5; enable only after verified isolation and joint maintainer review.

Do not require paid accounts to begin local work. Hosting, domains, mail transport and provider credentials are selected when needed. No spending amount or monetary cap is invented.

## Deployment Pipeline

Frozen-lockfile install → format/lint/types → unit coverage → integration services → workspace build → security scan → current-gate browser smoke → artifact/migration validation → protected deployment → smoke test. Pin toolchain/lockfile/image digests. Use expand/contract migrations before API changes and protect release environments.

Vercel builds `apps/web` to `dist` with SPA fallback that preserves assets and PDF worker loading. Only `VITE_*` public values enter bundles. Railway services listen on `0.0.0.0:$PORT`; API readiness checks essential dependencies; collab has WSS health; jobs/DB/Redis/executor stay private. Run graceful shutdown and confirmed multi-replica tests before scaling. Check provider-specific restrictions at deployment time.

## Branching and Versioning

Default branch is detected during S00-T01. Propose short-lived `codex/<task-id>-<slug>` or team feature branches; a co-maintainer reviews each merge. One independently reviewable task per commit where possible: `feat(editor): persist text (S04-T03)`. Never reset contributor work. SemVer applies to contracts: MAJOR breaking interface, MINOR compatible feature, PATCH fix; candidates use `-rc.N`. A dependency or API breaking change requires an ADR.

## Configuration and Operations

Environment variables, service startup and CLI exit contracts are in [Development Tooling](../contracts/development-tooling.md). Secrets are injected per service; validate configuration on startup. Never mount API/DB/Redis credentials or Docker sockets into TeX execution.

Runbooks cover Postgres outage, Redis loss, corrupt PDF, incompatible deploy, token leak, backup restore, migration rollback and signup shutdown. Back up DB plus object contents/manifests and key recovery instructions; restoring one without checking cross-store consistency is insufficient. Retain private sources until authorized deletion; starting proposals are 14 days for transient compile artifacts and 7 days for operational logs. Changes to retention require documented maintainer agreement.
