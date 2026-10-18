# Operational Runbooks & Release Operations (S15-T10, NFR-08, NFR-11)

**Audience:** System Administrators, Site Reliability Engineers, Maintainers (Julio, Project Co-owner)
**Target Environment:** Multi-replica Railway / Docker Hosted Infrastructure

---

## 1. Disaster Recovery & Automated Restore Walkthrough
When storage corruption or database failure occurs, follow this procedure:

1. **Verify Integrity of Latest Backup Bundle:**
   ```bash
   pnpm exec tsx infra/scripts/backup-restore.ts --verify --backup-dir /var/backups/latest
   ```
2. **Execute Automated Restore:**
   ```bash
   pnpm exec tsx -e '
     import { executeAutomatedRestore } from "./infra/scripts/backup-restore.js";
     import { DatabaseClient } from "./packages/db/src/client.js";
     import { S3StorageAdapter } from "./packages/storage/src/s3.js";
     import { parseServerConfig } from "@latex-collab/config/server";

     const config = parseServerConfig(process.env);
     const db = new DatabaseClient(config.DATABASE_URL);
     const storage = new S3StorageAdapter({
       endpoint: config.S3_ENDPOINT,
       region: config.S3_REGION,
       bucket: config.S3_BUCKET,
       accessKeyId: config.S3_ACCESS_KEY_ID,
       secretAccessKey: config.S3_SECRET_ACCESS_KEY,
     });

     const res = await executeAutomatedRestore({
       db,
       storage,
       backupDir: process.env.BACKUP_DIR || "/var/backups/latest",
     });
     console.log("Restore status:", res);
   '
   ```
3. **Verify Integrity:** Confirm `verification.intact === true` and `missingBlobs.length === 0`.
4. **Health Check Validation:**
   ```bash
   curl -f http://localhost:3000/api/v1/health/ready
   ```

---

## 2. Controlled Replica Rollout & Zero-Downtime Rollback
- Replicas coordinate via Redis Pub/Sub (`CollabRedisCoordinator`).
- Rollout strategy: Rolling replacement with container healthchecks pointing to `/api/v1/health/ready`.
- Rollback: If 5xx error rate exceeds 5% (`ERROR_RATE_ELEVATED` alert), immediately revert container image hash to previous verified commit.

---

## 3. Browser & Accessibility Verification Matrix
- **WCAG 2.2 AA Compliance:**
  - Automated `axe-core` suite runs against public pages with tags `["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]`.
  - Manual keyboard audit: All interactive controls navigable via `Tab` / `Shift+Tab`, triggerable via `Enter` / `Space`, dismissable via `Esc`.
- **Browser Compatibility:**
  - Google Chrome (latest stable, recorded version 129+)
  - Mozilla Firefox (latest stable, recorded version 131+)
  - Microsoft Edge (latest stable, recorded version 129+)
  - Safari / WebKit (latest stable, version 17+)
