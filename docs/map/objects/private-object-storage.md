---
type: object
cluster: runtime-design
universe: live
status: verified
entity: packages/storage/src/s3.ts
sources: ["packages/storage/src/s3.ts", "packages/contracts/src/storage.ts", "apps/api/src/modules/development/sample.ts", "apps/api/src/modules/account/avatar.ts", "apps/api/src/modules/uploads/routes.ts", "tests/integration/s01-t08.test.ts", "tests/integration/s02-t11.test.ts", "tests/regression/pl-07/s01-t08.test.ts", "tests/regression/pl-07/s02-t11.test.ts", "tests/regression/pl-07/s05-t01.test.ts", "docs/test-reports/s01-t08.md", "docs/test-reports/s02-t11.md", "docs/test-reports/s05-t01.md", "docs/contracts/storage-and-revisions.md"]
runtime: implemented
verified_on: 2026-10-12
snapshot: _meta/file-inventory.json
---

# Private Object Storage

## Summary

S01 supplies an S3-compatible adapter tested against local MinIO for object writes, reads, metadata, deletion and signed URLs. S02-T11 adds user-scoped private avatar keys and replacement cleanup. S05-T01 adds a capped read and project-scoped staging keys for verified uploads.

## Why this shape

Private project objects need scoped keys and content hashes before uploads, revisions and artifacts can safely use them.

## Shape

`packages/contracts/src/storage.ts` defines `StorageAdapter`; `packages/storage/src/s3.ts` validates keys, including encoded traversal, and checks project and avatar user scope. `S3StorageAdapter` implements put/get/getLimited/head/delete/presign. The S05 upload route signs a unique `projects/<id>/uploads/<uploadId>` PUT, then uses `getLimited` to verify bytes before copying a binary to `projects/<id>/blobs/<sha256>`. The signed staging object remains private until S05-T09 cleanup after expiry. The avatar route derives its private key from the current session and database row.

## Connected to

The [API](api-and-durable-data.md) consumes this adapter for the sample. [Data Model and Persistence](data-model-and-persistence.md) supplies project/revision metadata. Future [Compilation](compilation-and-artifacts.md) will use authorized artifacts.

## If you change this

- **Hits:** Storage contract, S3 adapter, object-key tests, development sample and future upload/artifact callers.
- **Does not hit:** User membership decisions; key validation does not replace server-side role authorization.

## Surfaces

API/service callers, local MinIO integration tests and future private artifact flows.

## See

- [S3 adapter](../../../packages/storage/src/s3.ts)
- [Storage contract](../../../packages/contracts/src/storage.ts)
- [S01-T08 evidence](../../test-reports/s01-t08.md)
- [S02-T11 evidence](../../test-reports/s02-t11.md)
- [S05-T01 evidence](../../test-reports/s05-t01.md)
