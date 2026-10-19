# Multi-Replica API and Collaboration Deployment Architecture

**Classification:** High Availability & Stateless Scaling Specification  
**Sprint / Gate:** S15 / Gate 5 Hardening (NFR-01, NFR-02, PL-05)  
**Target Environments:** Railway, Kubernetes, Multi-Container Orchestration

---

## 1. Overview & Architectural Invariants

The collaborative LaTeX editing system scales horizontally across multiple stateless API and collaboration server replicas (`apps/api` and `apps/collab`) without requiring sticky sessions, session affinity, or shared local disk volumes.

```
                     ┌───────────────────────────────────┐
                     │     Round-Robin / Load Balancer   │
                     │     (No Session Affinity)         │
                     └───────┬───────────────────┬───────┘
                             │                   │
                WebSocket /  │                   │  WebSocket /
                REST Request │                   │  REST Request
                             ▼                   ▼
                     ┌───────────────┐   ┌───────────────┐
                     │ Collab Node A │   │ Collab Node B │
                     │   (Replica 1) │   │   (Replica 2) │
                     └───────┬───────┘   └───────┬───────┘
                             │                   │
                 Pub/Sub     │   Redis Pub/Sub   │   Pub/Sub
                 Updates     └───► [Rooms Sync] ◄┘   Updates
                                         │
                                         ▼
                     ┌───────────────────────────────────┐
                     │          Redis Cluster            │
                     │    - Ticket Store (30s TTL)       │
                     │    - Revocation Broadcast         │
                     │    - Cross-Replica Sync Vector    │
                     └───────────────────┬───────────────┘
                                         │
                                         ▼ Row Locks
                     ┌───────────────────────────────────┐
                     │        PostgreSQL Database        │
                     │  - Durable CRDT Update Log        │
                     │  - Monotonic File Seq Numbers     │
                     │  - Document Snapshots             │
                     └───────────────────────────────────┘
```

### Invariants:

1. **Stateless Replicas:** No local disk volumes are required. If a replica crashes or terminates, no document history, user session, or CRDT update is lost.
2. **Affinity Independence:** Web clients can connect to Replica A, disconnect, and reconnect to Replica B seamlessly. State converges deterministically via Yjs CRDT vector exchange.
3. **Commit-Before-Ack (NFR-01):** Save status transitions to `saved` only after updates are committed under PostgreSQL row lock (`SELECT ... FOR UPDATE`).
4. **Graceful Termination:** On `SIGTERM`, replicas flush pending CRDT updates to PostgreSQL, emit `durable-ack` confirmations, and gracefully close client WebSockets with `1001 Going Away`.

---

## 2. Cross-Replica Synchronization

- **Single-Use Tickets:** Web clients request a single-use 30-second ticket from the API (`POST /api/v1/projects/:id/collab-ticket`). Stored in Redis with atomic consumption (`GETDEL`), valid across all collab replicas.
- **Cross-Replica Presence & Updates:** When Client 1 on Replica A applies a change, `CollabRedisCoordinator` broadcasts the update via Redis pub/sub channel `collab:file:{fileId}:updates`. Replica B receives the payload and broadcasts it to Client 2 in the same file room.
- **Convergence Guarantees (NFR-02):** Five or more simultaneous editors connected across arbitrary replicas converge to identical byte content via commutative and associative Yjs CRDT delta integration.

---

## 3. Graceful Shutdown & Failover Lifecycle

When a platform orchestrator (Railway, Kubernetes) scales in or deploys a new replica:

1. **Signal Catching:** Process intercepts `SIGTERM` / `SIGINT`.
2. **Health Probe Transition:** `/health/ready` immediately returns HTTP 503, signaling the load balancer to remove the replica from rotation.
3. **Drain Window:** 10-second drain window:
   - Replicas stop accepting new WebSocket connections.
   - Pending in-flight persistence transactions under PostgreSQL row lock complete.
   - Connected WebSockets receive close code `1001 Going Away`.
4. **Clean Exit:** Process disconnects from Redis and database pools, exiting with code 0.
5. **Client Auto-Reconnect:** Web clients observe `1001 Going Away`, apply jittered exponential backoff, and reconnect to an available healthy replica. Clients exchange state vectors and synchronize missing deltas without data loss.
