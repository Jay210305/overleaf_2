# Trusted TeX Execution and Closed Public Mode Operating Architecture

**Classification:** Internal Operating Runbook & Security Specification  
**Sprint / Gate:** S06 / Gate 1 Baseline  
**Audience:** Platform Engineering, Security Auditors, Co-Maintainers

---

## 1. Security Baseline & Trust Boundary (PL-07)

The G1 compilation subsystem is exclusively configured for trusted team and authenticated user workloads under strict server-side policy enforcement.

### 1.1 Enforcement of Closed Mode Flags

Per project invariant defined in `AGENTS.md` and `PLAN_IMPLEMENTACION_EDITOR_LATEX_COLABORATIVO.md`:
- `PUBLIC_SIGNUP_ENABLED=false`: Anonymous, self-service public registration is strictly disabled. Only invited team accounts provisioned by administrators are permitted.
- `UNTRUSTED_COMPILE_ENABLED=false`: Untrusted compilation mode is permanently disabled. `IsolatedCompilerExecutor` fails closed with status `SERVICE_UNAVAILABLE` / error code `NOT_IMPLEMENTED`.
- **Zero Credential Injection**: No API keys, PostgreSQL connection strings, Redis passwords, or S3 object-store secret credentials are EVER injected into compiler environments, container arguments, or TeX processes.

### 1.2 Dedicated Worker vs. Verified Public Isolation

> **CRITICAL SECURITY NOTICE:**
> The `TrustedWorkerExecutor` implementation runs inside ephemeral container boundaries with unprivileged user permissions (`texrunner`, UID 10001), hardened TeX Live parameters (`-no-shell-escape`, `openin_any = p`, `openout_any = p`), and memory limits.
>
> **However, this dedicated worker environment DOES NOT constitute verified multi-tenant adversarial public isolation.**
>
> Host namespace isolation, gVisor / Firecracker microVM separation, and verified seccomp sandboxing are scoped for Gate 5 / Sprint 15 (`sprint-15-public-hardening`). Untrusted compilation and public anonymous operation must NOT be enabled until Sprint 15 has delivered full isolation verification and co-maintainer approval.

---

## 2. Pinned TeX Runtime & Isolation Limits

### 2.1 Execution Configuration

The compiler executor environment operates with strictly pinned parameters:
- **Base Image:** `debian:bookworm-slim@sha256:d8c0b484501438902882894389ec1b369c0d9a691bc1510dd9fe3ea9a1ebcfa4`
- **TeX Profile:** TeX Live 2024 scheme-basic + latexmk + essential science/math packages (`amsmath`, `hyperref`, `bibtex`, etc.).
- **Flags:** `latexmk -pdf -interaction=nonstopmode -file-line-error -synctex=1 -no-shell-escape`
- **Configuration (`texmf.cnf`):**
  - `shell_escape = f`
  - `openin_any = p` (no access to parent or system configuration paths)
  - `openout_any = p` (output confined strictly to `./out`)

### 2.2 Hard Resource Limits

| Resource | Limit | Enforcement Mechanism | Failure Status |
|---|---|---|---|
| Wallclock Timeout | 60 seconds | Process SIGTERM / SIGKILL via AbortController | `timed_out` |
| RAM / Memory | 512 MiB | Docker cgroups / system ulimit (`maxBuffer`) | `failed` |
| CPU Allocation | 1.0 core | cgroups CPU quota | CPU throttling |
| Output Cap | 25 MiB | Buffer overflow check & S3 upload guard | `failed` |
| Active Concurrency | 1 active job | Unique PG index `compile_jobs_active_quota_idx` | HTTP 429 `QUOTA_EXCEEDED` |

---

## 3. Durability & Idempotency Lifecycle

1. **Submission (`POST /projects/:projectId/compilations`)**:
   - Enforces `projectAction: "COMPILE"` (OWNER or EDITOR only; VIEWER denied).
   - Requires unique 16–128 character `Idempotency-Key` header.
   - Idempotent re-submission returns the existing queued/running job without duplicating workers.
   - Transactionally freezes immutable source revision manifest (`freezeCompilationRevision`).
2. **Execution (`CompilationWorker`)**:
   - Atomic worker claim with row-level lock (`claimNext`) and rolling lease heartbeat (`heartbeat`).
   - Materializes manifest files into ephemeral temporary directory without path traversal.
   - Invokes `TrustedWorkerExecutor` with scrubbed environment (`sanitizeEnv`).
   - Automatically reclaims dead leases after worker crash (`recoverStaleJobs` / `reconcileExpiredLeases`).
3. **Artifact Persistence & Output Retention**:
   - Validates `%PDF-` magic header on `output.pdf`. Corrupt PDFs fail closed (`PdfValidationError`).
   - Persists artifacts (`output.pdf`, `compile.log`, `output.synctex.gz`) to private S3 prefix `projects/:projectId/artifacts/:jobId/*`.
   - Records `artifact_sets` database row with documented 14-day retention (`expires_at`).
   - If subsequent build fails, previous successful build remains viewable and downloadable in UI with an `OUTDATED` badge.

---

## 4. Runbook: Verification & Operational Audits

### 4.1 Periodic Allowlist & Flag Check
Inspect application configuration in `.env` or deployment secrets:
```bash
# Verify public flags are disabled
grep -E "PUBLIC_SIGNUP_ENABLED|UNTRUSTED_COMPILE_ENABLED" .env
# Expected output:
# PUBLIC_SIGNUP_ENABLED=false
# UNTRUSTED_COMPILE_ENABLED=false
```

### 4.2 Credential Leakage Audit
Execute secret check script across build artifacts and logs:
```bash
node scripts/check-secrets.mjs
```

### 4.3 Stale Worker Cleanup
If compile workers encounter an ungraceful host crash, stale jobs are automatically recovered on the next pass or via operator run:
```bash
pnpm --filter @latex-collab/jobs exec tsx src/compilation/worker.ts --recover-stale
```
