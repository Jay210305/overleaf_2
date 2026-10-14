# S07 — Durable collaboration

**Status:** COMPLETED | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 94 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S07-T01](../../implementation/sprint-07-durable-collaboration/S07-T01-create-authenticated-hocuspocus-file-rooms.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t01.md); authenticated file rooms, origin checking, and role permissions verified |
| [S07-T02](../../implementation/sprint-07-durable-collaboration/S07-T02-implement-single-use-wss-tickets.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t02.md); 30s single-use hashed ticket issuance, replay rejection, and session revocation verified |
| [S07-T03](../../implementation/sprint-07-durable-collaboration/S07-T03-connect-collaborative-editor-presence-and-undo.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t03.md); CodeMirror 6 isolated Y.UndoManager and collaborator presence list verified |
| [S07-T04](../../implementation/sprint-07-durable-collaboration/S07-T04-append-durable-crdt-updates.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t04.md); PostgreSQL row lock monotonic sequence allocation and CRDT replay verified |
| [S07-T11](../../implementation/sprint-07-durable-collaboration/S07-T11-implement-commit-covered-durable-acknowledgements.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t11.md); commit-covered durable acknowledgements and ClientSaveTracker status lifecycle verified |
| [S07-T12](../../implementation/sprint-07-durable-collaboration/S07-T12-compact-verified-crdt-snapshots-safely.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t12.md); verified snapshot compaction, safe update pruning, and crash tolerance verified |
| [S07-T05](../../implementation/sprint-07-durable-collaboration/S07-T05-implement-offline-persistence-and-reconnect.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t05.md); offline update storage, fresh ticket reconnect, and bounded backoff verified |
| [S07-T06](../../implementation/sprint-07-durable-collaboration/S07-T06-synchronize-tree-changes-with-open-rooms.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t06.md); TreeEventSynchronizer, rename room continuity, and delete room close verified |
| [S07-T07](../../implementation/sprint-07-durable-collaboration/S07-T07-coordinate-two-collaboration-replicas.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t07.md); CollabRedisCoordinator, two replica coordination without sticky sessions, and 5-client convergence verified |
| [S07-T08](../../implementation/sprint-07-durable-collaboration/S07-T08-apply-live-role-and-session-revocation.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t08.md); LiveRevocationManager, live session disconnects, member removal, and live role demotion verified |
| [S07-T09](../../implementation/sprint-07-durable-collaboration/S07-T09-instrument-collaborative-durability-metrics.md) | DONE | 6 h | [Scoped test report](../test-reports/s07-t09.md); CollabDurabilityMetrics, separate broadcast vs persistence lag, p95 <= 300ms, and NFR-10 log redaction verified |
| [S07-T10](../../implementation/sprint-07-durable-collaboration/S07-T10-verify-convergence-failures-and-recovery.md) | DONE | 8 h | [Scoped test report](../test-reports/s07-t10.md); stress test reordering convergence, zero durable-ACK loss across restart, and offline recovery verified |

## Decisions and Migrations

- Created dedicated branch `codex/sprint-07-durable-collaboration` tracking `origin/codex/sprint-07-durable-collaboration`.
- Created standalone collaboration service `@latex-collab/collab` in `apps/collab` with WebSocket room management (`CollabServer`, `CollabRoom`).
- Added shared collaboration contracts in `packages/contracts`: `ticketRequestSchema`, `ticketViewSchema`, `eventEnvelopeSchema`, and `DurableAck` types.
- Implemented single-use WSS collaboration tickets with 30s TTL in `apps/api/src/modules/collab/ticket.ts` (`TicketStore`, `MemoryTicketStore`) and `apps/collab/src/auth/ticket.ts`.
- Enforced monotonic sequence allocation per file under PostgreSQL row lock (`SELECT ... FOR UPDATE` on `text_documents`) in `apps/collab/src/persistence/update-log.ts` (`UpdateLog`).
- Enforced commit-before-saved boundary: `text.durable_ack` is only sent after successful database commit; broadcast receipt alone never produces a saved status.
- Implemented safe snapshot compaction in `apps/collab/src/persistence/snapshots.ts` (`SnapshotService`) verifying decoded state plaintext and SHA-256 hash before updating `text_documents` and pruning covered updates.
- Implemented offline persistence, bounded exponential backoff with jitter, and reconnection in `apps/web/src/features/collab/offline.ts` (`OfflineReconnectManager`).
- Implemented tree synchronization in `apps/collab/src/tree-events.ts`: file rename preserves stable room ID `project:${projectId}:file:${fileId}`; file deletion terminates room with close code 4404.
- Implemented multi-replica pub/sub coordinator via Redis in `apps/collab/src/redis.ts` (`CollabRedisCoordinator`) removing any sticky-session requirement.
- Implemented live role demotion and session invalidation in `apps/collab/src/auth/revocation.ts` (`LiveRevocationManager`).
- Instrumented collaborative durability metrics (`CollabDurabilityMetrics`), measuring broadcast lag separately from persistence lag and enforcing NFR-10 recursive log sanitization.

## Validation

- Comprehensive test suite covering all 12 tasks: 40 test files, 71 tests PASS.
- Monorepo quality gates:
  - `pnpm typecheck`: PASS (0 errors across all apps and packages).
  - `pnpm lint`: PASS (0 errors).
  - `pnpm build`: PASS (all packages, api, jobs, collab, and web build cleanly).
  - `python scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages).

## Risks and Debt

- High-concurrency database row locks on `text_documents` scale efficiently for document collaboration rooms; large documents should compact snapshots periodically to bound replay length.
- Redis pub/sub handles cross-replica ephemeral broadcast; PostgreSQL remains the single source of truth for durable CRDT updates and snapshots.

## Next Task

Sprint 07 is fully verified and complete. Ready to proceed to Sprint 08 (`sprint-08-sharing-comments-chat`).
