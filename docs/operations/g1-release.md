# Gate 1 (G1) Trusted Release Operations Guide

**Classification:** Release Operations & Maintenance Specification  
**Sprint / Gate:** S06 / Gate 1 Baseline  
**Audience:** Platform Engineering, Security Auditors, Co-Maintainers  
**Maintainers:** Julio & Project Co-Owner  

---

## 1. Release Overview & Boundary

The Gate 1 release establishes the baseline collaborative LaTeX editor with durable trusted compilation:
- **Editor & Data Plane**: Authenticated accounts, workspace project trees, Yjs document collaboration with server-side authorization checks on every operation (`COMPILE`, `READ`, `WRITE`).
- **Compilation Engine**: Pinned TeX Live 2024 runtime inside dedicated worker containers, running without shell escape (`-no-shell-escape`, `openin_any=p`, `openout_any=p`).
- **Closed Public Mode**: Public anonymous registration (`PUBLIC_SIGNUP_ENABLED=false`) and untrusted compilation (`UNTRUSTED_COMPILE_ENABLED=false`) remain permanently disabled.
- **Zero Credential Injection**: Compiler subprocesses receive zero database, Redis, S3, or API secret credentials in environment or arguments.

> **CRITICAL ARCHITECTURAL BOUNDARY:**  
> Dedicated worker execution on Railway operates under unprivileged UID `texrunner` with hard resource limits (60s timeout, 512 MiB RAM, single-job concurrency quota). However, this configuration does NOT provide verified multi-tenant adversarial public isolation. Adversarial sandboxing (gVisor/microVMs) is scheduled for Gate 5 / Sprint 15 (`sprint-15-public-hardening`). Untrusted compilation and public signups must remain disabled until Sprint 15 verification is signed off.

---

## 2. Release Checklist & Maintainer Approvals

| Item | Requirement | Verified By | Status |
|---|---|---|---|
| Database Migrations | Applied migration `0008-compile-jobs.sql` | Julio | PASS |
| Closed Public Mode | `PUBLIC_SIGNUP_ENABLED=false`, `UNTRUSTED_COMPILE_ENABLED=false` | Co-Owner | PASS |
| Zero Secrets in Subprocesses | `sanitizeEnv` strips all credentials | Julio | PASS |
| Pinned TeX Image | Digest-pinned Debian Bookworm + TeX Live 2024 | Julio | PASS |
| Pre-Release Backup | `createTrustedBackup` verified zero missing blobs | Co-Owner | PASS |
| Quality Gates | Typecheck, lint, build, vitest tests PASS | Both | PASS |
| Rollback Plan | Documented in `docs/operations/g1-recovery.md` | Both | PASS |

---

## 3. Staging & Production Deployment Sequence

1. **Database & Infrastructure**:
   - Ensure PostgreSQL 17 and Redis 7 instances are healthy.
   - Run database migrations: `pnpm --filter @latex-collab/db migrate`.
2. **Object Storage**:
   - Verify S3 bucket exists and credentials allow PUT/GET on `projects/:projectId/artifacts/*`.
3. **Compile Worker Service (`latex-collab-worker`)**:
   - Deploy worker service running `apps/jobs`.
   - Verify heartbeat and worker claim loop are operational.
4. **API Service (`latex-collab-api`)**:
   - Deploy Fastify API on Railway.
   - Verify `/api/v1/health/live` returns HTTP 200.
   - Verify `/api/v1/health/ready` returns HTTP 200 with database and storage connected.
5. **Web Client (`latex-collab-web`)**:
   - Deploy Vite React SPA on Vercel with rewrites configured in `apps/web/vercel.json`.
6. **Post-Deployment Smoke Verification**:
   - Execute smoke test runbook from `infra/railway/services.md`.
   - Verify genuine PDF output (`%PDF-`) and diagnostics parsing.

---

## 4. Rollback & Disaster Recovery Reference

In case of critical regression or release failure:
1. Revert container deployments on Railway to previous stable release tag.
2. If data inconsistency or blob loss occurred, execute `restoreTrustedBackup({ db, storage, backupDir })` per `docs/operations/g1-recovery.md`.
3. Validate system state using `verifyBackupIntegrity({ db, storage })`.
