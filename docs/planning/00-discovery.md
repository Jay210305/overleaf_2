# Discovery

**Version:** 1.0.0 | **Date:** 2026-10-09 | **Maintainers:** Julio and Project Co-owner
**Planning status:** Scope baseline adopted under the user's delegated authority; implementation has not started.

## Problem and Goal

Julio and the Project Co-owner want an extracurricular software project that develops their ability to build a real collaborative LaTeX workspace. Deliver a persistent editor with authentic compilation first, then add collaboration, review, integrations, and optional public operation in independently verified increments.

## Stakeholders and Team

| Person | Role | Availability | Decision authority |
|---|---|---|---|
| Julio | Developer and co-maintainer | Variable; no weekly hours committed | Technical choices and joint release review |
| Project Co-owner | The user; developer and co-maintainer | Variable; no weekly hours committed | Product scope and joint release review |
| Planning agent | Planning support | Outside the human capacity estimate | Scope organization delegated in the conversation; no authority to declare product tests passed |

`Project Co-owner` is a stable label because the user's preferred name was not supplied. It does not identify a third team member. Owner assignments in the roadmap are **ASSUMPTION A-02**, a proposed rotating responsibility rather than an assertion about either person's expertise.

## Confirmed Constraints

- Extracurricular project with two contributors: Julio and the user.
- No estimated completion date, no urgency, and no fixed project budget.
- The user delegated scope decisions and requested completion of missing planning details before subdivision.
- New planning documents, headings, and filenames use English.
- No calendar or weekly commitment is inferred from the team's size.

## Scope Baseline and Success Criteria

| Gate | Scope | Measurable closure |
|---|---|---|
| G1 — Initial release | Trusted accounts, project dashboard/tree, code editing, durable saving, ZIP import/export, real pdfLaTeX, PDF/logs, reproducible deployment | E2E-001 through E2E-006, E2E-013, E2E-017 and E2E-025 pass; text survives API restart; PDF content and source revision match; no critical security finding |
| G2 — Collaboration | Yjs convergence, presence, reconnect, roles, invitations, comments and chat | Two and five editing sessions converge; acknowledged changes survive server restart; revoked and VIEWER sessions cannot mutate through REST or WSS |
| G3 — Academic workflow | History/restore, suggested changes, bibliography, SyncTeX, advanced code tools, conservative visual editing | Engine and bibliography fixtures pass; restore preserves current ACLs; 100 visual round-trip fixtures retain identical bytes without edits |
| G4 — Optional integrations | GitHub, Git HTTP, Zotero, Dropbox and provider-dependent bibliography or writing assistance | Each supported adapter passes credentialed staging checks plus conflict/retry/revocation tests; unsupported providers remain explicitly blocked |
| G5 — Optional public operation | Verified isolated execution, abuse limits, recovery, observability and scale | Adversarial isolation and complete DB/object restore pass; security audit has no unresolved critical finding; both maintainers explicitly approve public registration |

G1 is the active release target. G2–G5 remain in the roadmap as later increments. Security, durable data, and honest status reporting apply to every increment. Gate classification takes precedence over legacy P0/P1/P2 labels; a P0 collaboration feature is required for G2, not for G1.

## Out of Scope

- Billing, subscriptions, commercial launch dates, or a spending commitment.
- Universal WYSIWYG support for arbitrary TeX macros, catcodes, or redefinitions.
- Proprietary Overleaf assets or unauthorized reuse of third-party code or commercial APIs.
- Anonymous or unknown-user compilation before the G5 isolation gate.
- Mandatory AI, commercial bibliography providers, or automatic bidirectional sync in G1.
- Restoring old memberships, ownership, or revoked sessions when restoring document content.

## Planning Adaptations

The methodology's two-week timeboxes and deadline-based capacity gate are adapted to the user's explicit lack of a deadline. `S00`–`S15` are ordered work stages; their duration and relative weeks are **not scheduled**. At the start of a work session, take one Ready task; if the stage spans several weeks, continue it rather than compressing estimates.

The specification, roadmap, and task files are generated together under the user's instruction to complete the missing fields and begin subdivision. This replaces separate approval pauses for the documentation layers. Runtime research, credentials, actual capacity, and public-release approvals remain factual execution gates; they are not represented as completed.

## Assumptions

| ID | Assumption | Validation / adjustment |
|---|---|---|
| A-01 | G1 is the first release and G2–G5 are later milestones | Revisit after the first usable editor; preserve all deferred feature IDs |
| A-02 | Sprint ownership alternates between Julio and Project Co-owner; tasks inherit the sprint owner | Reassign before taking a task; one accountable owner remains per stage |
| A-03 | Effort is active person-hours, including tests and task documentation; estimates are planning proposals | Compare actual hours with estimates; split an unstarted task if likely effort exceeds 8 h |
| A-04 | A 15% uncertainty allowance plus a separate release review allowance is useful | Recalculate at each gate; no calendar commitment follows from this arithmetic |
| A-05 | Local-first development avoids requiring paid hosting to start | Check each developer's machine during S00-T01; no hardware capability is asserted |
| A-06 | React Router, local React UI state, UUIDs, opaque cookie sessions, and PostgreSQL sequencing are suitable defaults | Record consequences in ADRs; replace by ADR when evidence warrants it |
| A-07 | Operational values in contracts are starting configuration proposals | Measure on a declared environment; avoid treating proposed limits as hosting guarantees |

## External Dependencies

Docker/Compose and a compatible Node/pnpm toolchain; PostgreSQL, Redis, and local S3 emulation; a pinned TeX Live image; optional Railway/Vercel accounts and domains; optional mail/OAuth/provider accounts; optional verified public executor. Availability, API terms, licenses, prices, and peer dependencies must be checked when their task begins. The source document's hosting claims and links have **not** been reverified during this documentation migration.

## Glossary

CRDT: convergent replicated text state. Durable ACK: acknowledgement issued after database commit. Revision: immutable project content manifest. Gate: tested release milestone. Trusted executor: dedicated execution for team-owned documents. Public executor: verified isolation for hostile input. Full definitions are in [Glossary and References](10-glossary-and-references.md).

## Discovery Gate

- [x] Goal, success criteria, and exclusions established through delegated scope authority.
- [x] Team, absence of deadline, and absence of a fixed budget recorded.
- [x] Assumptions distinguished from confirmed facts.
- [ ] Actual contributor availability measured when work begins; not required to organize an unscheduled plan.
