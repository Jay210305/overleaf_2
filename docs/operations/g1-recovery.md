# Gate 1 (G1) Trusted Backup, Recovery, and Rollback Runbook

**Classification:** Disaster Recovery & Operational Continuity Runbook  
**Sprint / Gate:** S06 / Gate 1 Baseline  
**Requirements Addressed:** NFR-09 (Restore DB & object backups consistently before hosted release), PL-04 (Release rollback)

---

## 1. Overview & Invariants

The Gate 1 data plane comprises two stateful tiers that must remain mutually consistent:
1. **Relational Tier (PostgreSQL 17)**: Contains project records, file metadata, immutable revision trees, compilation job history, and artifact set metadata.
2. **Object Storage Tier (S3 / Tigris / MinIO)**: Contains immutable revision snapshots (`projects/:projectId/revisions/:revId.json`) and compilation artifacts (`projects/:projectId/artifacts/:jobId/{output.pdf,compile.log,output.synctex.gz}`).

### Mandatory Invariant (NFR-09)
> **Zero Dangling Blob References:**  
> Every storage key recorded in `revisions.snapshot_key`, `artifact_sets.pdf_key`, `artifact_sets.log_key`, and `artifact_sets.synctex_key` MUST exist in object storage. Under no circumstances should a database restore result in orphaned or missing storage blobs.

---

## 2. Backup & Recovery Tooling

Automated backup and integrity verification utilities are located in `infra/scripts/trusted-backup.ts`:
- `createTrustedBackup`: Exports relational tables and fetches all referenced object blobs into a verifiable bundle with SHA-256 manifests.
- `restoreTrustedBackup`: Re-uploads missing object blobs and re-establishes relational consistency.
- `verifyBackupIntegrity`: Scans all database rows for referenced storage keys and verifies their presence in object storage, reporting `intact: true` and `missingBlobs: []`.

---

## 3. Operational Procedures

### 3.1 Taking a Pre-Release Backup
Before executing schema migrations or deploying new application versions:
```bash
# Execute trusted backup snapshot
pnpm tsx -e '
  import { createTrustedBackup } from "./infra/scripts/trusted-backup.js";
  // Executed with active DB and storage adapters
'
```
Output directory structure:
```
backup-2026-10-13/
├── database.json       # Relational rows
├── manifest.json       # SHA-256 checksums and blob mapping
└── blobs/              # Stored binary objects keyed by SHA-256
```

### 3.2 Pre-Release Integrity Verification
Validate that current database state has zero missing blobs before proceeding:
```bash
pnpm tsx -e '
  import { verifyBackupIntegrity } from "./infra/scripts/trusted-backup.js";
  const result = await verifyBackupIntegrity({ db, storage });
  console.log("Integrity intact:", result.intact);
'
```

### 3.3 Rollback & Disaster Recovery Procedure (PL-04)
If a release or migration causes service degradation or data inconsistency:
1. **Freeze Traffic**: Terminate API traffic or place API in read-only maintenance mode.
2. **Rollback Services**: Revert application containers on Railway to previous pinned release.
3. **Restore Data & Blobs**:
   - Restore database snapshot from `database.json`.
   - Execute `restoreTrustedBackup({ db, storage, backupDir })` to restore any deleted or missing object storage keys.
4. **Verify Consistency**:
   - Confirm `verifyBackupIntegrity` returns `intact: true` and `missingBlobs: []`.
5. **Resume Traffic**: Verify `/api/v1/health/live` and `/api/v1/health/ready` before reopening traffic.

---

## 4. Verification Evidence

Conformance is tested and verified by:
- `tests/integration/s06-t16.test.ts`: Point-in-time backup, simulated storage deletion, restore, and zero-missing-blob verification.
- `tests/regression/nfr-09/s06-t16.test.ts`: Automated check asserting database and object storage integrity invariants.
- `tests/regression/pl-04/s06-t16.test.ts`: Verifies rollback runbook and disaster recovery specifications.
