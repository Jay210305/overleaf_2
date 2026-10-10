# Risks

Ownership follows the proposed sprint rotation; both maintainers review security and recovery at release gates. No risk is marked resolved by writing this document.

| ID | Risk and consequence | Owner | Mitigation tasks | Cut / escalation |
|---|---|---|---|---|
| R1 | Hostile TeX escapes an insufficiently isolated worker | Project Co-owner | S06-T04, S06-T05, S15-T01, S15-T02 | Keep public/untrusted flags off; public executor research blocks G5 |
| R2 | Treating CodeMirror/Yjs as a complete history or review model loses context | Julio | S07-T04, S09-T01, S09-T04 | Independent revisions, anchors and suggestions; defer review UI breadth |
| R3 | Independent code/visual representations corrupt source | Project Co-owner | S11-T01, S11-T04, S11-T08 | Code is canonical; literal fallback; reduce visual support |
| R4 | Debounced-only CRDT persistence loses acknowledged edits | Project Co-owner | S04-T02, S07-T04, S07-T10 | Commit-before-ACK and verified snapshots; block affected gate |
| R5 | Ephemeral hosting disks destroy source on redeploy | Julio | S01-T08, S06-T02, S15-T06 | DB/object storage, per-job temporary files, restore tests |
| R6 | Attached volumes or connection affinity prevent safe replication | Project Co-owner | S07-T07, S15-T04 | External durable state, Redis coordination, no affinity dependency |
| R7 | Running every component in one process causes compile saturation | Julio | S06-T01, S06-T04 | Separate API/collab/jobs/executor; cap concurrency |
| R8 | Hosting persistent WSS in unsuitable infrastructure interrupts sessions | Project Co-owner | S07-T01, S07-T05 | Dedicated collab service; verify hosting and reconnect behavior |
| R9 | Provider API or license prevents an integration | Project Co-owner | S13-T03, S13-T06 | Timeboxed research, explicit BLOCKED_BY_PROVIDER, optional cut |
| R10 | Pull/push without a base revision overwrites work | Julio | S12-T03, S12-T04, S12-T07 | Checkpoint, base SHA, explicit conflict handling; manual sync first |
| R11 | Absolute offsets attach review content to the wrong text | Julio | S08-T04, S09-T05 | Relative positions, contextual hashes and detached state |
| R12 | TeX image size/build/runtime exceeds available resources | Julio | S06-T03, S15-T05 | Pin/profile minimal justified packages; defer special packages |
| R13 | Weak authorization testing causes cross-project data access | Julio | S02-T04, S02-T08, S15-T08 | Deny by default; REST/WSS/object tests; security gate blocks release |
| R14 | A broad implementation attempt produces unverified apparent features | Julio | S00-T02, S00-T09, S15-T11 | Atomic tasks, honest status, audit and stabilization windows |

## Research Spikes

Spikes are <=4 active hours with a written decision and a revised estimate. Unresolved outcome means blocked implementation, not a silent assumption of success.

- Yjs 13 / Hocuspocus / CodeMirror compatibility: S00-T11.
- TeX image and trusted runtime capability: S06-T12.
- Conservative parser round-trip feasibility: S11-T01.
- Provider API access and permitted operations: S13-T03.
- Git HTTP engine, protocol and license: S14-T01.
- Public sandbox primitives and adversarial verification design: S15-T01.

## Workload Triggers

Because there is no deadline, cuts are triggered by effort or blockers: if actual effort exceeds the likely estimate by 50%, or progress is blocked for two consecutive work sessions, re-estimate and apply the ordered optional cuts in the roadmap. Never cut durable saving, server permission checks, authentic compilation or privacy. Pause a later gate if its prerequisite is unavailable.
