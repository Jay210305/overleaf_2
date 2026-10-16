# Architecture Decisions

These are planning decisions adopted under delegated scope authority. Their implementation checks remain tasks. Version compatibility and provider claims are not verified by this record.

## ADR-001 — Web and Server Stack

**Context:** Two contributors need a typed, reproducible academic web workspace.
**Options:** A single hosted app, a separated TypeScript monorepo, or adopting an existing licensed platform.
**Decision:** React/Vite/TypeScript, React Router, Fastify, pnpm/Turborepo, Drizzle/Postgres; TanStack Query for server data and local React state for UI. Introduce Zustand only with demonstrated need. Vercel/Railway remain proposed hosting choices; start locally.
**Consequences:** Explicit cross-service contracts and deployments; no automatic AGPL code reuse; pin the chosen compatible toolchain during S00.

## ADR-002 — Canonical Text and Durability

**Context:** Code editing must later coedit without replacing the persistence model.
**Options:** Plain mutable strings, separate code/visual models, or Yjs per text file.
**Decision:** Stable compatible Yjs 13, one Y.Doc with Y.Text('content') per file, append-only PostgreSQL updates, verified compacted snapshots and commit-before-ACK. Assign per-file sequence authority through a PostgreSQL transaction/lock; avoid a Redis-only sequencer.
**Consequences:** S04 uses the same representation as G2; local undo isolates origin; IndexedDB is pending offline resilience. Recovery and state-vector acknowledgement need integration tests.

## ADR-003 — Objects and Revisions

**Context:** Private binaries, PDFs and content history must survive process replacement.
**Options:** Shared local disks, relational binary storage, or private object storage with DB metadata.
**Decision:** UUID IDs, UTC timestamps, private S3-compatible object store (MinIO locally, proposed Railway Bucket hosted), immutable SHA-256 manifests and monotonically numbered project revisions. Temporary workspaces are not durable storage.
**Consequences:** Cross-store reconciliation and GC are required; object paths are context-authorized; restore creates new content history without restoring ACLs.

## ADR-004 — Compiler Separation

**Context:** TeX is executable input with resource and exfiltration risks.
**Options:** Compile in API, dedicated trusted worker, or per-job verified public isolation.
**Decision:** Separate orchestration and CompilerExecutor. G1 uses only trusted team documents in a hardened dedicated runtime. G5 needs demonstrable network/filesystem/process/resource isolation, potentially outside Railway.
**Consequences:** Shell escape disabled but insufficient alone; no API/DB secrets in runtime; public and untrusted flags stay false until verified. Public isolation availability is unresolved research, so G5 is conditional.

## ADR-005 — Sessions and Multi-tenancy

**Context:** REST, WSS, downloads and provider sync must share current authorization.
**Options:** Long-lived browser tokens, opaque cookies with scoped WSS tickets, or access/refresh tokens.
**Decision:** Opaque revocable API-host-only cookie sessions, SameSite=Lax in coherent same-site domains, CSRF token plus Origin checks, one-use 30 s WSS tickets, centralized deny-by-default permissions. No access/refresh flow in the baseline.
**Consequences:** `/auth/refresh` is omitted unless a new ADR changes session strategy; previews need tested cookie/domain policy; revocation must affect active sockets.

## ADR-006 — Extracurricular Delivery

**Context:** There is no deadline, urgency, weekly capacity commitment or fixed budget.
**Options:** Invent a calendar, retain timeboxes as requirements, or use effort-sized ordered stages.
**Decision:** Preserve S00–S15 IDs as unscheduled stages, alternate proposed owners, estimate active hours and <=8 h tasks, use effort/blocker cut triggers, reserve a stabilization window per gate. Adopt G1 first and keep G2–G5 in the roadmap.
**Consequences:** Calendar capacity reconciliation is not applicable; weekly availability and financial spending are never inferred. Re-estimate with actual learning progress.

## ADR-007 — Visual Editing and External Providers

**Context:** Arbitrary TeX and commercial provider APIs cannot be assumed fully supported.
**Options:** Regenerate whole documents, maintain independent visual state, or patch supported canonical-source regions; universal integrations or capability-based adapters.
**Decision:** Conservative visual projection with minimal verified patches and literal fallback; explicit provider adapters with declared capabilities, checkpoint/base checks and visible blocked states. AI is opt-in per user/project.
**Consequences:** Parser/provider/Git/public-executor spikes precede affected implementation; 100 round-trip fixtures pin source preservation. Unsupported providers remain optional.

## ADR-008 — Browser Upload Transport

**Context:** S05 needs per-file progress, cancellation and safe retry with the already implemented signed upload API.
**Options:** Direct signed PUT, API byte proxy or one batch upload endpoint.
**Decision:** Use a sequential browser queue with XHR PUT to the private signed URL, then server completion with a stable per-file idempotency key. Refresh the file tree only after durable completion. Restrict local MinIO CORS to the exact application origin; the pinned server does not implement bucket CORS configuration.
**Consequences:** The browser never receives object credentials; a canceled or failed staging object is removed by S05-T09. Hosted CORS and broader browser coverage require deployment evidence. See the [S05-T02 design](../superpowers/specs/2026-10-12-s05-multi-file-upload-design.md) and [report](../test-reports/s05-t02.md).

## ADR-009 — ZIP Import Staging and Validation

**Context:** The project-file upload API rejects ZIP and creates a node, while a ZIP import must create a new project only after bounded validation.
**Options:** Reuse project uploads, proxy and extract in the API request, or split signed ZIP intake, private validation and project application.
**Decision:** Add S05-T12 for authenticated actor-bound signed ZIP intake, keep S05-T03 as a private durable validator/job, and leave atomic project application to S05-T10. A server-only copied archive key and versioned manifest separate uploaded bytes from project state.
**Consequences:** New import jobs and storage keys require migrations, scoped cleanup and an import-specific status DTO. A `validated` job is not a completed project. Independent S05-T02 acceptance remains the prerequisite for S05-T03 product work. See the [approved design](../superpowers/specs/2026-10-12-s05-archive-import-design.md).

## ADR-010 — Project Invitation Token Transport

**Context:** Planned redemption URLs exposed bearer invitation tokens in route paths that proxy access logs could retain.
**Options:** Keep path tokens with universal redaction, use query tokens, or mail a URL fragment and redeem by JSON body after sign-in.
**Decision:** Use the fragment/body flow, hash tokens in PostgreSQL, bind redemption to a verified trusted email and retain owner-only invitation management. The planned contract moves to version 2.0.0 before its runtime consumer ships; see [individual ADR](../adr/010-invitation-tokens.md).
**Consequences:** S08-T03 clears the fragment after reading it; existing trusted accounts can join now, while new-account onboarding remains separately controlled under the public-signup gate.

## ADR Maintenance

S00-T08 establishes individual ADR records in `docs/adr/` from this baseline. Later ADRs retain context, options, decision and consequences, add measured evidence, and state which entry they supersede. A breaking interface change requires an ADR and a MAJOR contract version bump.
