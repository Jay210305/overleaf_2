# Overview

## Vision and Users

Build an original academic LaTeX workspace for Julio, the Project Co-owner, and initially trusted collaborators. Users create/import projects, edit `.tex`, `.bib`, `.sty`, `.cls`, images and other permitted resources, compile authentic PDFs, share work under server-enforced permissions, review changes, restore versions and export sources.

## Use Cases

1. Create a blank project containing a valid `main.tex`, edit, save, compile and download its PDF.
2. Import a multilevel ZIP, preserve its assets and paths, compile, and export equivalent sources.
3. Invite another editor, coedit with local undo, reconnect and observe durable save status.
4. Comment on a stable range; submit a suggestion as REVIEWER; accept it as OWNER or EDITOR.
5. Compare immutable revisions and restore content without restoring revoked administrative permissions.
6. Use bibliography and source/PDF navigation; open visual mode without changing source bytes.
7. Explicitly synchronize an authorized provider, preserving divergent local and remote work.

## Requirements and Priorities

[Requirements](requirements.md) contains every original feature and NFR ID, its English acceptance statement, MoSCoW priority and target gate. [Traceability](traceability.md) maps each requirement to executable task IDs and planned test evidence. P0/P1/P2 values are retained as source metadata and are not mechanically mapped to MoSCoW.

Must means required for the named gate. Should means useful follow-up after the gate's Must work. Could means optional work contingent on capability and contributor interest. Won't applies to the explicit exclusions in Discovery. A later-gate Must does not expand G1.

## Constraints

| Class | Constraint |
|---|---|
| Non-negotiable | Authentic compilation; server authorization; durable text; immutable revision provenance; privacy; original branding; dependency/license review before installation |
| Non-negotiable | Public signup and untrusted compilation remain off until isolated execution is verified |
| Operationally capped | Finite per-job resources, upload/project limits and concurrency; starting values are proposed in contracts |
| Confirmed scheduling | No fixed deadline or promised weekly capacity |
| Confirmed finance | No fixed budget needed for planning; hosting and paid provider use are optional decisions at execution |
| Negotiable | Visual feature breadth, advanced providers, AI, automation, high-scale hosting, and G4/G5 timing |

## Product Definition of Done

For its declared gate, a feature works through UI, API, storage and permissions when applicable; survives restart; handles errors; passes its contract, integration and journey checks; and links real evidence in the feature matrix. A rendered button, dummy PDF, mock provider or local-only state is insufficient evidence.

Mocks are permitted for isolated tests and intermediate contract consumers. Product stubs must be visibly unavailable, feature-flagged and tracked in Open Gaps. Credentials unavailable means `BLOCKED_BY_CREDENTIALS`; unsupported provider capability means `BLOCKED_BY_PROVIDER`.

## Release Boundary

G1 closes after S06 and the G1 stabilization checklist. Collaborative work starts afterward. Later additions do not require an initial payment plan; implement configurable quotas and feature flags without adding billing. The [Roadmap](04-implementation-roadmap.md) preserves the entire long-term scope and ordered cuts.
