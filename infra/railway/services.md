# Railway Staging Service Topology and Deployment Architecture

**Classification:** Infrastructure & Staging Deployment Runbook  
**Sprint / Gate:** S06 / Gate 1 Baseline (PL-04, PL-05)  
**Target Environments:** Railway (API, Worker, PostgreSQL, Redis) + Vercel (Web SPA)

---

## 1. Architecture Overview

The Gate 1 collaborative LaTeX system runs as a decoupled multi-service staging deployment:
- **Web SPA (`apps/web`)**: Hosted on Vercel with automatic TLS, rewrites managed via `apps/web/vercel.json`.
- **API Service (`apps/api`)**: Fastify Node.js server hosted on Railway with automatic TLS termination, serving REST and WebSocket endpoints.
- **Compilation Worker (`apps/jobs`)**: Long-running background worker process hosted on Railway, processing durable compilation jobs with pinned TeX Live runtime.
- **PostgreSQL 17 Database**: Railway managed PostgreSQL instance storing users, projects, revisions, compile jobs, and artifact metadata.
- **Redis 7 Cache & Locks**: Railway managed Redis instance powering session stores, worker lease heartbeats, and pub/sub synchronization.
- **S3 Object Storage**: S3-compatible bucket (Tigris/MinIO/AWS S3) storing immutable source revisions and verified compilation artifacts.

```
                    ┌─────────────────────────┐
                    │       Vercel SPA        │
                    │      (apps/web)         │
                    └────────────┬────────────┘
                                 │ HTTPS (TLS)
                                 ▼
                    ┌─────────────────────────┐
                    │       Railway API       │
                    │      (apps/api)         │
                    └──────┬──────────┬───────┘
                           │          │
         Postgres SQL      │          │ Redis
         (Transactions)    │          │ (Leases & Pub/Sub)
                           ▼          ▼
    ┌──────────────┐   ┌───────────────────────────┐   ┌────────────────┐
    │  PostgreSQL  │◄──┤      Railway Worker       │──►│     Redis      │
    │   Database   │   │       (apps/jobs)         │   │   (Key-Value)  │
    └──────────────┘   └─────────────┬─────────────┘   └────────────────┘
                                     │
                                     ▼ S3 Put/Get
                       ┌───────────────────────────┐
                       │     S3 Object Store       │
                       │   (Artifacts & Revs)      │
                       └───────────────────────────┘
```

---

## 2. Service Definitions & Configuration

### 2.1 API Service (`apps/api`)
- **Railway Service Name:** `latex-collab-api`
- **Build Command:** `pnpm --filter @latex-collab/api build`
- **Start Command:** `pnpm --filter @latex-collab/api start`
- **Port:** `4000` (mapped to Railway external HTTPS domain)
- **Health Probes:**
  - Liveness Probe: `GET /api/v1/health/live` (HTTP 200)
  - Readiness Probe: `GET /api/v1/health/ready` (HTTP 200, checks DB and S3 connectivity)
- **Environment Variables:**
  ```env
  NODE_ENV=production
  PORT=4000
  HOST=0.0.0.0
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  REDIS_URL=${{Redis.REDIS_URL}}
  SESSION_SECRET=${{shared.SESSION_SECRET}}
  CORS_ORIGIN=https://overleaf-staging.vercel.app
  S3_ENDPOINT=${{shared.S3_ENDPOINT}}
  S3_REGION=auto
  S3_BUCKET=latex-collab-staging
  S3_ACCESS_KEY_ID=${{shared.S3_ACCESS_KEY_ID}}
  S3_SECRET_ACCESS_KEY=${{shared.S3_SECRET_ACCESS_KEY}}
  PUBLIC_SIGNUP_ENABLED=false
  UNTRUSTED_COMPILE_ENABLED=false
  ```

### 2.2 Compile Worker Service (`apps/jobs`)
- **Railway Service Name:** `latex-collab-worker`
- **Build Command:** `pnpm --filter @latex-collab/jobs build`
- **Start Command:** `pnpm --filter @latex-collab/jobs start`
- **Runtime:** Dedicated worker image with pinned TeX Live 2024 packages (`latexmk`, `pdflatex`, `lualatex`, `xelatex`).
- **Resource Allocation:**
  - CPU: 2 vCPU
  - Memory: 1024 MiB
- **Zero Credential Injection Boundary:**
  - Environment variables stripped before passing to TeX compiler subprocess.
  - Subprocess executed under unprivileged user (`texrunner`, UID 10001).
  - Hard limit parameters: 60s wallclock timeout, memory cap 512 MiB, 25 MiB log/artifact cap.
- **Environment Variables:**
  ```env
  NODE_ENV=production
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  REDIS_URL=${{Redis.REDIS_URL}}
  S3_ENDPOINT=${{shared.S3_ENDPOINT}}
  S3_REGION=auto
  S3_BUCKET=latex-collab-staging
  S3_ACCESS_KEY_ID=${{shared.S3_ACCESS_KEY_ID}}
  S3_SECRET_ACCESS_KEY=${{shared.S3_SECRET_ACCESS_KEY}}
  PUBLIC_SIGNUP_ENABLED=false
  UNTRUSTED_COMPILE_ENABLED=false
  ```

### 2.3 Managed PostgreSQL (`latex-collab-postgres`)
- **Engine:** PostgreSQL 17
- **Connection Limit:** 100 connections
- **Automatic Migration:** Runs as pre-deploy hook via `pnpm --filter @latex-collab/db migrate`.

### 2.4 Managed Redis (`latex-collab-redis`)
- **Engine:** Redis 7
- **Persistence:** AOF enabled for lease state safety.

### 2.5 Vercel Web Client (`apps/web`)
- **Configuration:** Defined in `apps/web/vercel.json`:
  ```json
  { "rewrites": [{ "source": "/((?!assets/).*)", "destination": "/index.html" }] }
  ```
- **Environment Variables:**
  ```env
  VITE_API_URL=https://latex-collab-api.up.railway.app
  VITE_WS_URL=wss://latex-collab-api.up.railway.app
  ```

---

## 3. Staging Deployment & Smoke Verification Runbook

### Step 1: Health Probes Verification
Verify API is live and dependencies are connected:
```bash
curl -f https://latex-collab-api.up.railway.app/api/v1/health/live
# Expected: HTTP 200 {"status":"live"}

curl -f https://latex-collab-api.up.railway.app/api/v1/health/ready
# Expected: HTTP 200 {"status":"ready","database":"connected","storage":"connected"}
```

### Step 2: Closed Public Mode Invariant Check
Verify anonymous registration is blocked:
```bash
curl -X POST https://latex-collab-api.up.railway.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"intruder@external.com","password":"Password123!"}'
# Expected: HTTP 403 Forbidden {"error":"PUBLIC_SIGNUP_DISABLED"}
```

### Step 3: Authenticated Team Login & Project Setup
Login with pre-provisioned team account:
```bash
curl -c cookies.txt -X POST https://latex-collab-api.up.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"julio@team.internal","password":"TeamPassword123!"}'
```

### Step 4: Create Document & Enqueue Compilation
Submit a compilation request with mandatory `Idempotency-Key`:
```bash
curl -b cookies.txt -X POST https://latex-collab-api.up.railway.app/api/v1/projects/<PROJECT_ID>/compilations \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idemp-staging-smoke-001" \
  -d '{"compiler":"pdflatex"}'
# Expected: HTTP 202 Accepted {"id":"<JOB_ID>","status":"queued"}
```

### Step 5: Poll Status & Verify Genuine PDF Artifact
Poll job completion:
```bash
curl -b cookies.txt https://latex-collab-api.up.railway.app/api/v1/projects/<PROJECT_ID>/compilations/<JOB_ID>
# Expected: {"status":"succeeded","pdfAvailable":true}

# Download authentic PDF and inspect magic bytes:
curl -b cookies.txt https://latex-collab-api.up.railway.app/api/v1/projects/<PROJECT_ID>/compilations/<JOB_ID>/artifacts/output.pdf | head -c 5
# Expected: %PDF-
```

### Step 6: Negative and Edge Case Verification
1. **Bad Engine / Bad Arguments**:
   ```bash
   curl -b cookies.txt -X POST https://latex-collab-api.up.railway.app/api/v1/projects/<PROJECT_ID>/compilations \
     -H "Content-Type: application/json" \
     -d '{"compiler":"invalid-engine"}'
   # Expected: HTTP 400 Bad Request
   ```
2. **Concurrent Job Quota (HTTP 429)**:
   Submitting two concurrent compilation jobs for the same project must return HTTP 429 `QUOTA_EXCEEDED` on the second job.
3. **Rollback Plan**:
   If a deployment fails, rollback Railway deployment via CLI:
   `railway rollback` or via Railway dashboard to the previous stable release commit.
