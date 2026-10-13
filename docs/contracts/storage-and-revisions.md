# Storage and Revisions Contract

## Adapter

```ts
type ObjectRef = { key: string; sha256: string; sizeBytes: number; mime: string };
interface StorageAdapter {
  put(key: string, bytes: Uint8Array, mime: string): Promise<ObjectRef>;
  get(key: string): Promise<Uint8Array>;
  getLimited(key: string, maxBytes: number): Promise<Uint8Array>;
  head(key: string): Promise<ObjectRef | null>;
  delete(key: string): Promise<void>;
  presign(key: string, operation: 'get' | 'put', ttlSeconds: number): Promise<string>;
}
type RevisionManifest = {
  version: 1; projectId: string; revisionId: string; revisionNo: number;
  mainFileId: string; compiler: 'pdflatex' | 'xelatex' | 'lualatex' | 'latex';
  texliveImageDigest: string;
  items: Array<{ nodeId: string; path: string; kind: 'TEXT' | 'BINARY'; object: ObjectRef }>;
};
```

Object key creation is server-controlled, scoped as `projects/<projectId>/blobs/<sha256>` and separate artifacts/revisions prefixes; user input never determines unrestricted bucket keys. MinIO and hosted S3 implement the same contract. Private ACL by default; proposed signed GET TTL is 60 s, PUT TTL 300 s. authorize before every presign, and recheck completion against expected backend-calculated hash/size. ETag is not assumed to be SHA-256.

S05-T01 issues a PUT URL only for a unique `projects/<projectId>/uploads/<uploadId>` staging key after a live EDIT permission check, filename/type allowlist, parent check and byte/node quota check. A durable `pending_uploads` row binds project, actor, filename, parent, MIME, expected size/hash and expiry. Completion rechecks the current permission and target under a project transaction, bounds the object read, computes SHA-256 from the bytes returned by storage, validates the actual content and creates exactly one node per upload intent. Client-supplied S3 metadata and ETag are never proof of hash or MIME. Text is inserted as the first canonical Yjs update; verified binary bytes are copied to a server-controlled content-addressed blob key. Staging objects remain private until S05-T09 expires and removes them after the signed PUT window, including failed or completed intents. A failed metadata transaction may leave an unreferenced blob for S05-T09 reference-checked cleanup; it never creates a partial project node. The signed staging URL remains usable until its short expiry even if project permissions change, but completion denies a revoked actor.

S02-T11 also permits server-created `avatars/<userId>/<uuid>.png` keys for validated private profile images. Avatar reads use an authenticated API endpoint and do not return signed object URLs. Replacements queue the old key durably in PostgreSQL; a bounded worker checks that no current profile references it before deletion. Failed deletes remain queued for retry. If both the profile transaction and best-effort deletion of a newly uploaded object fail, an unreferenced private object can remain; this needs later storage reconciliation.

## Tree and Snapshot Invariants

Tree uses stable node IDs and same-project parent IDs. Names reject slash/backslash, NUL, dot/dot-dot and dangerous normalized paths; proposed UTF-8 NFC normalization applies to names, not source bytes. Unique active sibling names include root nodes with null parent through explicit partial root/non-root indexes. Reject cycles and foreign parents transactionally.

Revision freezes all active file paths, text and binary blobs, hashes, main file and relevant compiler/content settings. Canonical manifest hashing sorts by normalized path then nodeId and uses UTF-8 JSON with fixed key ordering; versioned encoding is shared across producer/consumer tests. Manifest is immutable; revisions increase monotonically on structural mutation/checkpoint. File restore affects only that file; project restore uses a new revision and current ACLs.

## Upload / ZIP Limits

Starting proposals from the source: 25 MiB/file, 100 MiB/project, 2,000 files/project; enforce actual bytes. ZIP additionally rejects symlinks, traversal, nested active archive expansion and proposed compression ratio >100:1; stop streaming extraction at byte/node caps before writing outside isolated staging. Scopes and limits are configuration, not hosting product claims. Accepted extensions are explicit TeX/bibliography/styles/images/PDF/permitted font allowlist; MIME is checked, not trusted from request. Active HTML/SVG is attachment-only or rejected under the chosen policy.

Validated import stages content then atomically creates project metadata/canonical state. ZIP export reconstructs only one authorized immutable revision. Failed jobs clean temporary objects; GC deletes a blob only after checking every current/revision/artifact reference and retention policy. Source persists until authorized deletion; propose 14-day transient artifact retention.

## Valid and Invalid Examples

Valid: `main.tex` and `images/chart.png` in a frozen manifest export/import with identical file hashes and tree paths; rename keeps file ID and changes only derived path/revision.

Invalid: `../../another-project/main.tex`, sibling name collision, foreign parent or cycle → validation/conflict before committing. Cross-project presign → 403/404 without URL. Missing/mismatched uploaded hash → UNSUPPORTED_CONTENT, node not created. Mutating a frozen manifest → rejected; create a new revision instead.
