# Gate 1 (G1) Trusted Compilation Staging Deployment and Smoke Report

**Release Gate:** Gate 1 (S06 Trusted Compilation Baseline)  
**Target Environments:** Railway Staging (API, Worker, Postgres 17, Redis 7, Tigris S3) + Vercel (Web SPA)  
**Verification Date:** 2026-10-13  
**Evaluator:** Julio & Project Co-Owner  
**Status:** PASS (Walking skeleton stabilized, all smoke assertions verified)

---

## 1. Staging Verification Objectives

The purpose of the G1 deployment smoke test is to validate that the complete collaborative LaTeX editing and compilation walking skeleton functions end-to-end under realistic staging network topology and configuration:
1. Web SPA loads cleanly via Vercel CDN with TLS and SPA route rewriting.
2. Fastify API responds to health probes (`/api/v1/health/live`, `/api/v1/health/ready`).
3. Closed public mode is enforced: anonymous registration is strictly disabled (`PUBLIC_SIGNUP_ENABLED=false`).
4. Authenticated team members can create projects, update documents via Yjs canonical state, and trigger compilation.
5. Compilation jobs are durably enqueued with `Idempotency-Key` headers, claimed by the Railway worker, and executed inside pinned TeX Live containers without credential injection.
6. Authentic PDF output (`%PDF-` header) and sanitized logs are persisted to S3 with 14-day retention and streamed to the client with authorization checks.
7. Error cases (unsupported engines, active compile quotas 429, compilation syntax errors) fail safely without crashing workers or leaking host details.

---

## 2. Smoke Test Execution Results

| Step | Action | Expected Result | Observed Result | Status |
|---|---|---|---|---|
| 1 | `GET /api/v1/health/live` | HTTP 200 `{"status":"live"}` | HTTP 200 `{"status":"live"}` | PASS |
| 2 | `GET /api/v1/health/ready` | HTTP 200 `{"status":"ready", ...}` | HTTP 200 `{"status":"ready", ...}` | PASS |
| 3 | Anonymous signup attempt | HTTP 401 / 403 closed | Registration denied; missing account blocked | PASS |
| 4 | Team member authentication | HTTP 200 + secure cookie | Session established with CSRF protection | PASS |
| 5 | Enqueue compilation (valid) | HTTP 202 + job ID | Job created with frozen revision manifest | PASS |
| 6 | Concurrent duplicate compile | HTTP 429 `QUOTA_EXCEEDED` | Second job rejected; active quota enforced | PASS |
| 7 | Invalid compiler engine | HTTP 400 Bad Request | Invalid parameter rejected safely | PASS |
| 8 | Worker job claim & execute | Status: `succeeded` | Pinned TeX Live generated genuine PDF | PASS |
| 9 | Artifact download (`output.pdf`) | HTTP 200, `%PDF-` header | Authentic PDF streamed with correct MIME type | PASS |
| 10 | Rollback readiness check | Fast rollback script/CLI | Rollback runbook verified | PASS |

---

## 3. Findings & Operational Safeguards

1. **Isolation Notice**: Dedicated worker execution on Railway operates under unprivileged UID `texrunner` with `-no-shell-escape` and `openin_any=p`, but does not yet provide multi-tenant adversarial sandboxing (gVisor/microVMs). Closed public mode remains enforced until Gate 5 / Sprint 15.
2. **Idempotency Guarantee**: Idempotent re-submission of the same compilation request returns the existing job record without re-spawning TeX processes or corrupting output artifacts.
3. **Stale Lease Recovery**: In the event of an ungraceful Railway worker restart, orphaned jobs are claimed and recovered during the next worker heartbeat pass.
