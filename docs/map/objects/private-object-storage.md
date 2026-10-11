---
type: object
cluster: runtime-design
universe: live
status: verified
entity: packages/storage/src/s3.ts
sources: ["packages/storage/src/s3.ts", "packages/contracts/src/storage.ts", "apps/api/src/modules/development/sample.ts", "tests/integration/s01-t08.test.ts", "tests/regression/pl-07/s01-t08.test.ts", "docs/test-reports/s01-t08.md", "docs/contracts/storage-and-revisions.md"]
runtime: implemented
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Private Object Storage

## Summary

S01 supplies an S3-compatible adapter tested against local MinIO for object writes, reads, metadata, deletion and signed URLs.

## Why this shape

Private project objects need scoped keys and content hashes before uploads, revisions and artifacts can safely use them.

## Shape

`packages/contracts/src/storage.ts:8` defines `StorageAdapter`; `packages/storage/src/s3.ts:29` validates keys, including encoded traversal, and line 73 checks project scope. `S3StorageAdapter` begins at line 90 and implements put/get/head/delete/presign. The development sample uses it. The adapter itself receives an authorized project ID for scope checks; no general user-to-project policy service or public object endpoint exists yet.

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
