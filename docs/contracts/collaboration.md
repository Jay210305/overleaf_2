# Collaboration and Text Persistence Contract

## Canonical Text and Room

One `Y.Doc` per TEXT node with `Y.Text('content')`. Stable room ID `project:<projectId>:file:<fileId>` survives rename. Binary mutations use HTTP/object storage, not Yjs. `y-codemirror.next` and local-origin Y.UndoManager use a compatibility-verified stable Yjs 13 binding. Awareness is ephemeral and bounded; IndexedDB retains pending offline updates, not authoritative saved state.

## REST Text Boundary

```ts
type TextState = { fileId: string; updateBase64: string; stateVectorBase64: string; persistedSeq: number };
interface TextDocumentService {
  load(projectId: string, fileId: string, actorId: string): Promise<TextState>;
  apply(projectId: string, fileId: string, actorId: string,
    input: { updateBase64: string; baseStateVectorBase64: string }): Promise<TextState>;
}
```

Base64 is allowed here only for a bounded Yjs protocol frame, not uploaded files. Validate decoded Yjs bytes and initial 1 MiB mutation-frame cap. A returned encoded snapshot may be up to 64 MiB; larger document state is a visible quota/compaction failure rather than a silently truncated response. Initial imported text is applied in bounded internal chunks. The G1 single-editor flow detects stale base vectors and returns 409 rather than claiming overwrites safe. G2 uses actual mergeable Yjs updates and retains permission checks. DTO rejects arbitrary text replacement that bypasses canonical mutation.

## WSS Ticket and Handshake

Project invitations do not authorize WSS access until an email-matched verified account accepts a delivered, unexpired token and a current project membership is committed. A later membership revocation still takes effect through the live S07 permission path. See the [HTTP invitation boundary](http-api.md) and ADR-010.

API `POST /projects/{id}/collab-ticket` receives fileId and action (`read` or `write`). It checks current session/role/project, returns opaque ticket plus expiresAt, and stores hash-scoped user/project/file/action/session identity in Redis with proposed 30 s TTL. Collab authenticates by Hocuspocus initial protocol message, never a logged query token. Atomically consume once; require allowed Origin and live membership; load verified snapshot/update log before joining. Reconnections require new tickets with bounded exponential backoff.

## Durable Updates and ACK

```ts
type DurableAck = {
  type: 'text.durable_ack'; version: 1; fileId: string;
  persistedSeq: number; stateVectorBase64: string;
};
```

Client mutation → server validated Yjs update → PostgreSQL transaction under per-file lock allocating monotonic seq → commit → ACK covering persisted state vector. A proposed 200 ms grouping window is allowed only while updates remain visibly pending. Broadcast latency and committed save are distinct. `saved` means all pending local clocks are covered by committed state vector, not merely a high sequence number.

Snapshot stores uptoSeq/stateBytes/hash; verify before deleting covered updates. Recover snapshot plus seq >uptoSeq. PostgreSQL sequence authority prevents replica allocation races; Yjs commutativity does not make ACK bookkeeping optional. Capture compile revision behind a consistent barrier across file states and tree metadata.

## Invalidation Events

```ts
type EventEnvelope = {
  eventId: string; version: 1; projectId: string; occurredAt: string;
  type: 'file.created' | 'file.moved' | 'file.deleted' |
    'project.settings_changed' | 'permissions.changed' |
    'compile.status_changed' | 'comment.changed' |
    'suggestion.changed' | 'chat.created';
  payload: Record<string, unknown>; // narrowed per event below
};
```

Payloads: file events `{nodeId,treeVersion}`; settings `{revision}`; permissions `{userId}`; compile `{jobId,status}`; comments `{commentId}`; suggestions `{suggestionId}`; chat `{messageId}`. Each has UUID IDs and bounded nonnegative versions. Producers are authoritative transaction services, consumers authorized browser/collab clients. Use transactional outbox for required publication. Delivery is at-least-once with eventId deduplication; no global ordering guarantee. TreeVersion/revision gaps trigger REST reconciliation; never treat events as durable source storage.

Permission revocation invalidates outstanding tickets and open sockets; no further unauthorized text write or newly restricted data delivery is accepted. REVIEWER proposes suggestions through the review service; VIEWER cannot apply updates. Redis/PG outage reports unavailable/pending, never saved.

## Valid and Invalid Examples

Valid: authorized editor applies a UTF-8 Yjs insertion, transaction commits seq 7, ACK state vector covers its local clock, then saved status appears; restart replays identical text.

Invalid: replay of consumed ticket → authentication denied before source read. VIEWER update → permission denied and unchanged state. ACK before failed DB commit → contract violation caught by crash/outage test. Deleted file → RESOURCE_NOT_FOUND and room closed with visible reason.
