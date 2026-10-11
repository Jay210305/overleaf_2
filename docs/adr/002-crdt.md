# ADR-002 — Canonical Text and Durability

**Context:** Code editing must later coedit without replacing the persistence model.
**Options:** Plain mutable strings, separate code/visual models, or Yjs per text file.
**Decision:** Stable compatible Yjs 13, one Y.Doc with Y.Text('content') per file, append-only PostgreSQL updates, verified compacted snapshots and commit-before-ACK. Assign per-file sequence authority through a PostgreSQL transaction/lock; avoid a Redis-only sequencer.
**Consequences:** S04 uses the same representation as G2; local undo isolates origin; IndexedDB is pending offline resilience. Recovery and state-vector acknowledgement need integration tests.

## S00 implementation evidence

No CRDT runtime is implemented in S00. The candidate spike is a design choice. Registry metadata for provider 4.4.0 and y-protocols 1.0.6 was resolved in this continuation; both are MIT and peer on compatible Yjs 13 ranges. Runtime convergence belongs to S07.

Sources: [decision baseline](../planning/09-decisions.md), [S00 verification](../test-reports/s00-verification.md).
