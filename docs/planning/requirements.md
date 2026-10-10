# Requirements and MoSCoW Priorities

All original 74 feature IDs and 12 NFR IDs are preserved. PL-01–PL-07 add explicit architecture/planning constraints required by the source. Priorities are relative to the named gate; split early/later scope is stated in acceptance rather than silently dropping part of a feature. No feature is implemented by this catalogue.

| ID | Source priority | MoSCoW | Target gate | Acceptance statement |
|---|---|---|---|---|
| ACC-01 | P0 | Must | G1 | Email registration, verification, login/logout and single-use password recovery tokens |
| ACC-02 | P0 | Must | G1 | Secure opaque cookies, expiry, rotation, revocation and session inventory |
| ACC-03 | P0 | Must | G1 | Persist display name, avatar, email, locale, timezone and preferences |
| ACC-04 | P1 | Could | G4 | Optional Google/GitHub OAuth with safe identity link and unlink |
| ACC-05 | P1 | Should | G3 | Persist font, size, theme, tab width, wrap, pair completion and accessibility settings |
| ACC-06 | P1 | Must | G1 | Password change invalidates sessions; optional TOTP MFA belongs to G4 |
| ACC-07 | P2 | Should | G3 | Export user data and delete accounts under shared-project ownership and retention rules |
| ACC-08 | P2 | Could | G4 | Preference-controlled email and in-app invitations, mentions and replies |
| PRO-01 | P0 | Must | G1 | Paginated searchable owned/shared/recent dashboard with modification and owner ordering |
| PRO-02 | P0 | Must | G1 | Create blank, minimal example, internal-template and ZIP projects |
| PRO-03 | P0 | Must | G1 | Rename/duplicate projects and persist ownership, dates and optional description |
| PRO-04 | P0 | Must | G1 | Create/move/rename/delete nodes while rejecting duplicate paths, traversal and cycles |
| PRO-05 | P0 | Must | G1 | Validate permitted TeX/bibliography/style/image/PDF/font uploads with progress and failures |
| PRO-06 | P0 | Must | G1 | Download authorized source ZIP, genuine PDF, logs and permitted artifacts |
| PRO-07 | P0 | Must | G1 | Select an active editable .tex root in the same project |
| PRO-08 | P1 | Should | G3 | Archive differs from trash; restore and owner-confirmed permanent deletion work |
| PRO-09 | P1 | Should | G3 | User-owned colored tags filter projects through many-to-many links |
| PRO-10 | P1 | Must | G1 | Import nested ZIP projects without ZIP slip, symlinks or decompression bombs |
| PRO-11 | P1 | Should | G3 | Versioned internal-template catalogue supports filters, preview and instantiation; minimal template is in G1 |
| PRO-12 | P1 | Could | G3 | Bulk archive/tag/select checks permission independently per project |
| PRO-13 | P1 | Should | G3 | Ownership transfer requires recipient acceptance and rollback on failure |
| PRO-14 | P2 | Could | G4 | External URL resources use permitted connectors or a tested SSRF-safe fetch policy |
| PRO-15 | P2 | Should | G3 | Report documented approximate LaTeX word count, bytes, file count and last compilation |
| EDT-01 | P0 | Must | G1 | CodeMirror highlights LaTeX/BibTeX with line numbers, selection, indentation and undo/redo |
| EDT-02 | P0 | Must | G1 | Display saving/saved/offline/error accurately and reject racing overwrite |
| EDT-03 | P0 | Must | G1 | File switching preserves each buffer and selection |
| EDT-04 | P0 | Must | G1 | Save, undo, redo, comment, search, compile and go-to-line shortcuts work |
| EDT-05 | P1 | Should | G3 | Pair environments/braces, fold and insert snippets without corrupting source |
| EDT-06 | P1 | Should | G3 | Complete commands/environments/labels/citations and input/image file paths |
| EDT-07 | P1 | Must | G1 | Diagnostics identify file/line and navigate from warnings and compiler logs |
| EDT-08 | P1 | Should | G3 | Search/replace locally and across project with optional regex and preview |
| EDT-09 | P1 | Should | G3 | Guided figures/tables/sections/lists/links/equations/refs/cites insert valid snippets |
| EDT-10 | P1 | Should | G3 | Search symbols by name/category and insert mathematical commands |
| EDT-11 | P1 | Could | G3 | Local spell checking leaves LaTeX commands unchanged |
| EDT-12 | P1 | Must | G1 | Choose supported engine/root/TeX image and auto-compile; server policy bounds timeout |
| EDT-13 | P2 | Should | G3 | Supported visual nodes edit canonical source; unsupported syntax has visible non-destructive fallback |
| EDT-14 | P2 | Could | G4 | Static command/error help first; AI requires explicit consent and does not block editing |
| CMP-01 | P0 | Must | G1 | Pinned TeX Live/latexmk pdfLaTeX produces genuine private stored PDFs |
| CMP-02 | P0 | Must | G1 | Expose redacted stdout/stderr, error/warning file/line and compile status |
| CMP-03 | P0 | Must | G1 | PDF.js supports zoom/pages/fit-to-width/fit-to-page and authorized download |
| CMP-04 | P0 | Must | G1 | Durable queued/running/succeeded/failed/timed_out/cancelled jobs are idempotent and quota-bound |
| CMP-05 | P1 | Should | G3 | XeLaTeX/LuaLaTeX and compatible latex-to-DVI-to-PDF profiles each have real fixtures |
| CMP-06 | P1 | Should | G3 | BibTeX/Biber resolve multiple passes and produce actual bibliography/citations |
| CMP-07 | P1 | Should | G3 | Secure forward/inverse SyncTeX navigates between file/line and PDF coordinates |
| CMP-08 | P1 | Should | G3 | Debounced automatic compilation coalesces queued jobs without blindly interrupting persisted work |
| CMP-09 | P1 | Must | G1 | Store allowed PDF/log/BLG/SyncTeX artifacts privately with documented retention |
| CMP-10 | P1 | Should | G3 | Clean rebuild invalidates auxiliary cache and has reproducible fixture comparison |
| CMP-11 | P1 | Should | G3 | Cache hashes input, engine, image/options/policy and preserves project authorization |
| CMP-12 | P2 | Could | G4 | Additional packages/fonts/classes expose tested compatibility and exceptions |
| COL-01 | P0 | Must | G2 | Yjs concurrent editing converges and reconnects without lost confirmed text |
| COL-02 | P0 | Must | G2 | Presence shows identity/color/active file and remote cursors/selections |
| COL-03 | P0 | Must | G1 | OWNER/EDITOR/REVIEWER/VIEWER are enforced on REST; WSS enforcement lands in G2 |
| COL-04 | P0 | Must | G2 | Email invitations can be accepted/rejected/revoked, expire and remain project-scoped |
| COL-05 | P1 | Should | G2 | High-entropy hashed share links restrict roles, expiry, uses and revocation |
| COL-06 | P1 | Must | G2 | Relative-position comments support mention/reply/resolve/reopen and permission-aware deletion |
| COL-07 | P1 | Should | G2 | Authorized real-time chat has paginated durable history and rate limits |
| COL-08 | P1 | Should | G3 | Editing/reviewing/viewing modes prevent a REVIEWER from modifying canonical text directly |
| COL-09 | P1 | Should | G3 | Insert/delete/replace suggestions track author/time and explicit single/bulk resolution |
| COL-10 | P1 | Should | G3 | Immutable revisions show author/time/labels/tree/text comparison |
| COL-11 | P1 | Should | G3 | Restore one file or all content as a new revision without changing current ACLs |
| COL-12 | P1 | Must | G2 | Two offline clients recover safely through concurrent edit/rename/delete conflicts |
| COL-13 | P2 | Could | G4 | Preference-controlled collaboration notifications show important activity |
| COL-14 | P2 | Must | G1 | Redacted audit records creation/invitation/download/restore/revocation as features become available |
| INT-01 | P1 | Should | G3 | Create/edit/import/export .bib, detect duplicate keys and complete citations |
| INT-02 | P1 | Should | G3 | Search references by key/title/author/DOI/year locally |
| INT-03 | P2 | Could | G4 | Authorized Zotero adapter imports/refreshes libraries and protects tokens |
| INT-04 | P2 | Could | G4 | Mendeley/Papers exist only where API access and terms permit the required operation |
| INT-05 | P2 | Could | G4 | GitHub OAuth links repo/branch and guards pull/push against overwrite and conflicts |
| INT-06 | P2 | Could | G4 | Authenticated revocable Git HTTP supports real clone/fetch/push separately from GitHub |
| INT-07 | P2 | Could | G4 | Authorized Dropbox export/sync handles revocation and explicit conflicts |
| INT-08 | P2 | Should | G3 | BibTeX import/export preserves source unless safe normalization is requested |
| INT-09 | P2 | Could | G4 | Optional writing assistant requires opt-in and sends no manuscript without consent |
| INT-10 | P2 | Could | G4 | Expiring PDF/source sharing remains authorized; ZIP download is already G1 |
| INT-11 | P2 | Must | G5 | Explicit admin permissions control quotas/jobs/users/abuse reports/metrics/flags |
| NFR-01 | NFR | Must | G1 | Zero acknowledged edits lost after controlled server restart |
| NFR-02 | NFR | Must | G2 | Five simultaneous editors converge on identical content |
| NFR-03 | NFR | Must | G2 | Revoked users cannot mutate REST or WSS and stop receiving newly unauthorized data |
| NFR-04 | NFR | Must | G5 | Non-compile CRUD p95 <=500 ms on a published test environment |
| NFR-05 | NFR | Must | G2 | Remote edit propagation p95 <=300 ms on the local reference network |
| NFR-06 | NFR | Must | G1 | Generated PDF sourceRevision and manifest hash match exactly |
| NFR-07 | NFR | Must | G1 | Concurrent jobs remain within configured user/project quotas |
| NFR-08 | NFR | Must | G1 | WCAG 2.2 AA target: axe checks plus manual keyboard review for delivered scope |
| NFR-09 | NFR | Must | G1 | Restore DB and object backups consistently before hosted release; automate in G5 |
| NFR-10 | NFR | Must | G1 | Zero credentials/tokens/private source content in application logs |
| NFR-11 | NFR | Must | G1 | Critical delivered flows pass Chrome/Firefox/Edge with recorded versions |
| NFR-12 | NFR | Must | G2 | Offline writes remain recoverable and never silently discarded |
| PL-01 | Added constraint | Must | G1 | Reproducible typed monorepo, compatible pinned tooling and startup scripts |
| PL-02 | Added constraint | Must | G1 | Identical local/CI quality gates and verifiable task execution rules |
| PL-03 | Added constraint | Must | G1 | Stable feature/task IDs, honest evidence, ADRs, progress and plan consistency |
| PL-04 | Added constraint | Must | G1 | Explicit environment/configuration, health, staging deploy and release rollback |
| PL-05 | Added constraint | Must | G1 | Walking skeleton and stabilized current-gate release with documented findings |
| PL-06 | Added constraint | Must | G1 | Relational constraints, typed contracts and migrations preserve domain invariants |
| PL-07 | Added constraint | Must | G1 | Private credentials, no unauthorized code reuse and explicit compiler trust boundary |

## Won't

Universal arbitrary-TeX WYSIWYG, copied proprietary branding/code, billing/subscriptions in the baseline, unauthorized provider integrations, anonymous/untrusted compilation before G5, and restoring old permissions with source content are excluded in Discovery. Providers lacking legitimate capability are blocked, not relabeled supported.
