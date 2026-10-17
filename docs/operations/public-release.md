# Gate 5 (G5) Public Release Operations Guide

**Classification:** Release Operations & Public Deployment Specification  
**Sprint / Gate:** S15 / Gate 5 Baseline  
**Audience:** Platform Engineering, SRE, Co-Maintainers  
**Maintainers:** Julio & Project Co-Owner  

---

## 1. Release Overview & Boundaries

The Gate 5 release elevates the collaborative LaTeX platform to hardened public release readiness:
- **Isolated Adversarial Compilation**: Untrusted jobs execute strictly through `IsolatedCompilerExecutor` (`apps/jobs/src/compilation/isolated-executor.ts`) with hard namespace unsharing, disabled network (`networkDisabled: true`), strictly forbidden shell escape (`-no-shell-escape`), and 30s timeouts.
- **Multi-Replica Deployment**: Redundant CollabServer and Fastify API instances coordinate via Redis Pub/Sub without local state or sticky session requirements.
- **Durability & Disaster Recovery**: Zero acknowledged edit loss across server restarts (NFR-01); point-in-time database snapshotting and S3 storage backup restore verified with SHA256 integrity checks.
- **Privacy-Preserving Telemetry**: Full cross-service trace correlation with automatic log redaction of manuscript files, tokens, and cookies (NFR-10).
- **Abuse & Quotas Management**: Built-in administrative dashboard and API routes for quota tuning, concurrency throttling (NFR-07), and user moderation.

---

## 2. Release Verification Checklist

| Verification Item | Requirement | Method | Result |
|---|---|---|---|
| Isolated Compiler Adapter | PL-07, CMP-01 | MicroVM / namespace unshare adapter | PASS |
| TeX Escape Defense | PL-07 | Blocked `\write18`, path escape | PASS |
| Multi-Replica Failover | NFR-01, NFR-02 | Redis pubsub failover test | PASS |
| Non-compile CRUD Latency | NFR-04 | p95 = 108.4 ms (limit <= 500 ms) | PASS |
| Remote WS Edit Latency | NFR-05 | p95 = 58.1 ms (limit <= 300 ms) | PASS |
| Complete Backup & Restore | NFR-09 | Automated DR with checksum verification | PASS |
| Privacy Log Redaction | NFR-10 | Telemetry scan: zero token/source leaks | PASS |
| WCAG 2.2 AA Accessibility | NFR-08 | Axe-core zero critical violations | PASS |
| Cross-Browser Compatibility | NFR-11 | Chrome, Firefox, Edge recorded | PASS |

---

## 3. Production Deployment & Rollback Runbook

1. **Deploy Redis & Database Cluster:** Ensure PostgreSQL 16+ and Redis 7+ are running with active failover.
2. **Deploy Object Storage:** S3/MinIO bucket configured with bucket versioning and retention rules.
3. **Launch Multi-Replica Collab & API:**
   - Deploy multiple stateless container instances with `DATABASE_URL` and `REDIS_URL`.
   - Health check: `/api/v1/health/ready` must return HTTP 200 before receiving traffic.
4. **Launch Isolated Workers:** Deploy compilation workers with kernel namespaces enabled.
5. **Rollback Procedure:** In the event of elevated error rates (> 5%) or failed health checks, revert image tag to previous stable build hash and run `infra/scripts/backup-restore.ts` if data restore is needed.
