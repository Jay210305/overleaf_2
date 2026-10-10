# ADR-003 — Objects and Revisions

**Context:** Private binaries, PDFs and content history must survive process replacement.
**Options:** Shared local disks, relational binary storage, or private object storage with DB metadata.
**Decision:** UUID IDs, UTC timestamps, private S3-compatible object store (MinIO locally, proposed Railway Bucket hosted), immutable SHA-256 manifests and monotonically numbered project revisions. Temporary workspaces are not durable storage.
**Consequences:** Cross-store reconciliation and GC are required; object paths are context-authorized; restore creates new content history without restoring ACLs.

## S00 implementation evidence

Compose provides private MinIO and PostgreSQL/Redis named volumes. MinIO is built from official revision 7aac2a2c5b7c because published images/binaries were unavailable. It is an archived AGPL-3.0 local fixture, not a public production hosting decision. Anonymous bucket access is tested denied. S01 owns the application storage adapter and data schema.

Sources: [decision baseline](../planning/09-decisions.md), [S00 verification](../test-reports/s00-verification.md).
