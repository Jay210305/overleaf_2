# Feature Parity and Evidence

All IDs start NOT_STARTED. Planned paths and written acceptance are not actual implementation evidence. Update only with real report/run reference; provider limits remain explicit.

| ID | Gate | Priority | Status | Evidence |
|---|---|---|---|---|
| ACC-01 | G1 | Must | IN_PROGRESS | [S02-T01 registration and verification accepted](test-reports/s02-t01.md); [S02-T02 login/logout accepted](test-reports/s02-t02.md); [S02-T03 recovery accepted](test-reports/s02-t03.md); [S02-T05 browser flow accepted](test-reports/s02-t05.md); [S02-T06 server rate limits accepted](test-reports/s02-t06.md); recovery timing GAP-14 remains |
| ACC-02 | G1 | Must | IN_PROGRESS | [S02-T02 opaque session, CSRF, expiry and revocation accepted](test-reports/s02-t02.md); [S02-T06 auth limits accepted](test-reports/s02-t06.md); [S02-T07 session inventory/revocation accepted](test-reports/s02-t07.md); [S02-T10 other-session revocation accepted](test-reports/s02-t10.md); [S02-T08 rotation/revocation checks accepted](test-reports/s02-t08.md); remaining gate checks apply |
| ACC-03 | G1 | Must | IN_PROGRESS | [S02-T07 profile/preferences scope accepted](test-reports/s02-t07.md); [S02-T11 private avatar scope accepted](test-reports/s02-t11.md); G1 gate still open |
| ACC-04 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| ACC-05 | G3 | Should | DONE | [S10-T09 editor preferences persistence](test-reports/s10-t09.md); survives reload with layout/accessibility settings |
| ACC-06 | G1 | Must | IN_PROGRESS | [S02-T03 recovery reset revokes sessions, accepted](test-reports/s02-t03.md); [S02-T10 authenticated change accepted](test-reports/s02-t10.md); remaining gate checks apply |
| ACC-07 | G3 | Should | DONE | [S09-T13 export data](test-reports/s09-t13.md); [S09-T14 account deletion](test-reports/s09-t14.md) |
| ACC-08 | G4 | Could | IN_PROGRESS | [S14-T05 preference-controlled email notifications](test-reports/s14-t05.md) |
| PRO-01 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t03.md) (accepted 2026-10-10); [S03-T01 CRUD/pagination](test-reports/s03-t01.md); [S03-T03 dashboard](test-reports/s03-t03.md); [S03-T08 journey](test-reports/s03-t08.md); G1 gate stabilization applies |
| PRO-02 | G1 | Must | IN_PROGRESS | [S03-T02 blank project creation](test-reports/s03-t02.md); [S05-T03 import job staging](test-reports/s05-t03.md) in progress; remaining mapped tasks apply |
| PRO-03 | G1 | Must | IN_PROGRESS | [S03-T01 rename](test-reports/s03-t01.md); [S03-T02 project clone](test-reports/s03-t02.md); G1 gate stabilization applies |
| PRO-04 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t07.md) (accepted 2026-10-10); [S03-T04 ID-based tree](test-reports/s03-t04.md); [S03-T05 tree interactions](test-reports/s03-t05.md); [S03-T09 transaction safety](test-reports/s03-t09.md); [S03-T08 journey](test-reports/s03-t08.md); [S07-T06 open room sync accepted](test-reports/s07-t06.md); remaining mapped tasks still apply |
| PRO-05 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t08.md) (accepted 2026-10-10); [S05-T01 upload API](test-reports/s05-t01.md), [S05-T09 cleanup/quota](test-reports/s05-t09.md) and [S05-T02 browser upload](test-reports/s05-t02.md) accepted 2026-10-13; import and remaining mapped tasks still apply |
| PRO-06 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t08.md) (accepted 2026-10-10); [S09-T13 authorized export download](test-reports/s09-t13.md); remaining mapped tasks still apply |
| PRO-07 | G1 | Must | IN_PROGRESS | [S03-T06 root document setting](test-reports/s03-t06.md); G1 gate stabilization applies |
| PRO-08 | G3 | Should | DONE | [S09-T09 archive, trash, and permanent deletion](test-reports/s09-t09.md) |
| PRO-09 | G3 | Should | DONE | [S09-T10 owned project tags](test-reports/s09-t10.md); [S09-T11 bulk tagging](test-reports/s09-t11.md) |
| PRO-10 | G1 | Must | IN_PROGRESS | [S05-T03 hostile archive validation](test-reports/s05-t03.md) in progress; remaining mapped tasks still apply |
| PRO-11 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-12 | G3 | Could | DONE | [S09-T11 permission-aware bulk project actions](test-reports/s09-t11.md) |
| PRO-13 | G3 | Should | DONE | [S09-T12 explicit ownership transfer](test-reports/s09-t12.md) |
| PRO-14 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-15 | G3 | Should | DONE | [S10-T07 documented project statistics](test-reports/s10-t07.md); approximate words, bytes, file count and last compile |
| EDT-01 | G1 | Must | IN_PROGRESS | [S04-T01 CodeMirror extensions](test-reports/s04-t01.md); [S04-T08 Unicode editing](test-reports/s04-t08.md); G1 gate stabilization applies |
| EDT-02 | G1 | Must | IN_PROGRESS | [S04-T02 canonical text](test-reports/s04-t02.md); [S04-T03 save status/retry](test-reports/s04-t03.md); [S04-T06 read-only concurrency](test-reports/s04-t06.md); [S04-T08 Unicode journey](test-reports/s04-t08.md); [S04-T09 update persistence](test-reports/s04-t09.md); [S04-T10 REST state version](test-reports/s04-t10.md); [S07-T11 durable collab accepted](test-reports/s07-t11.md) |
| EDT-03 | G1 | Must | IN_PROGRESS | [S04-T04 tabs and navigation](test-reports/s04-t04.md); G1 gate stabilization applies |
| EDT-04 | G1 | Must | DONE | [S04-T05 local undo and search](test-reports/s04-t05.md); [S10-T10 keymaps and shortcuts verified](test-reports/s10-t10.md) |
| EDT-05 | G3 | Should | DONE | [S10-T06 environment auto-closing and folding](test-reports/s10-t06.md) |
| EDT-06 | G3 | Should | DONE | [S10-T06 labels, citations and file path autocompletion](test-reports/s10-t06.md) |
| EDT-07 | G1 | Must | DONE | [S06-T07 diagnostic parser](test-reports/s06-t07.md); [S06-T08 PDF viewer](test-reports/s06-t08.md); [S06-T09 compile controls](test-reports/s06-t09.md); accepted in G1 audit |
| EDT-08 | G3 | Should | DONE | [S04-T05 editor shortcuts](test-reports/s04-t05.md); [S10-T08 project search and replacement](test-reports/s10-t08.md) |
| EDT-09 | G3 | Should | DONE | [S10-T05 valid academic insertion snippets](test-reports/s10-t05.md) |
| EDT-10 | G3 | Should | DONE | [S10-T09 mathematical symbols catalog and palette](test-reports/s10-t09.md) |
| EDT-11 | G3 | Could | DONE | [S10-T11 local spell checking leaving commands unchanged](test-reports/s10-t11.md) |
| EDT-12 | G1 | Must | DONE | [S03-T06 compiler settings](test-reports/s03-t06.md); [S10-T12 debounced auto-compilation and queue coalescing](test-reports/s10-t12.md) |
| EDT-13 | G3 | Should | DONE | [S11-T01 visual parser ADR](test-reports/s11-t01.md); [S11-T02 AST projection](test-reports/s11-t02.md); [S11-T03 basic nodes](test-reports/s11-t03.md); [S11-T04 source patches](test-reports/s11-t04.md); [S11-T05 academic nodes](test-reports/s11-t05.md); [S11-T10 table & math editing](test-reports/s11-t10.md); [S11-T06 literal fallback](test-reports/s11-t06.md); [S11-T07 read-only switching](test-reports/s11-t07.md); [S11-T08 100 round-trip fixtures](test-reports/s11-t08.md); [S11-T09 mixed coediting](test-reports/s11-t09.md); accepted in [Gate 3 audit](test-reports/gate-g3-audit.md) |
| EDT-14 | G4 | Could | DONE | [S10-T11 offline static command and error help](test-reports/s10-t11.md); [S14-T06 private writing assistance fallback](test-reports/s14-t06.md) |
| CMP-01 | G1 | Must | DONE | [S06-T03 TeX Live image](test-reports/s06-t03.md); [S06-T04 compiler executor boundary](test-reports/s06-t04.md); [S06-T10 genuine compiler fixtures](test-reports/s06-t10.md); [S06-T13 trusted executor adapter](test-reports/s06-t13.md); accepted in G1 audit |
| CMP-02 | G1 | Must | DONE | [S06-T07 diagnostics & path redaction](test-reports/s06-t07.md); [S06-T10 compiler fixtures](test-reports/s06-t10.md); accepted in G1 audit |
| CMP-03 | G1 | Must | DONE | [S06-T08 real PDF viewer](test-reports/s06-t08.md); [S06-T10 compiler fixtures](test-reports/s06-t10.md); accepted in G1 audit |
| CMP-04 | G1 | Must | DONE | [S06-T01 compile queue jobs](test-reports/s06-t01.md); [S06-T05 execution limits](test-reports/s06-t05.md); [S06-T14 timeout & recovery](test-reports/s06-t14.md); accepted in G1 audit |
| CMP-05 | G3 | Should | DONE | [S10-T01 alternative TeX profiles](test-reports/s10-t01.md); [S10-T10 profile execution flags](test-reports/s10-t10.md) |
| CMP-06 | G3 | Should | DONE | [S10-T02 bibliography compilation](test-reports/s10-t02.md); [S10-T10 multi-pass citations](test-reports/s10-t10.md) |
| CMP-07 | G3 | Should | DONE | [S10-T04 forward inverse synctex](test-reports/s10-t04.md); [S10-T10 coordinate transformations](test-reports/s10-t10.md) |
| CMP-08 | G3 | Should | DONE | [S10-T12 debounced automatic compilation and coalescing](test-reports/s10-t12.md) |
| CMP-09 | G1 | Must | DONE | [S06-T06 verified artifact persistence](test-reports/s06-t06.md); [S10-T14 artifact retention cleanup](test-reports/s10-t14.md); 14-day private retention verified; accepted in G1 audit |
| CMP-10 | G3 | Should | DONE | [S10-T14 clean rebuild and auxiliary invalidation](test-reports/s10-t14.md) |
| CMP-11 | G3 | Should | DONE | [S10-T13 authorized content-aware compiler cache](test-reports/s10-t13.md) |
| CMP-12 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-01 | G2 | Must | DONE | [S00-T11 compatibility research](test-reports/s00-t11.md#acceptance-review); [S07-T01 file rooms](test-reports/s07-t01.md); [S07-T03 editor binding](test-reports/s07-t03.md); [S07-T04 durable updates](test-reports/s07-t04.md); [S07-T07 dual replica sync](test-reports/s07-t07.md); [S07-T11 durable acknowledgements](test-reports/s07-t11.md); [S07-T12 snapshot compaction](test-reports/s07-t12.md) |
| COL-02 | G2 | Must | DONE | [S07-T03 presence, color, remote cursors, selections, and isolated undo accepted](test-reports/s07-t03.md) |
| COL-03 | G1 | Must | DONE | [S01 verified scope](test-reports/s01-t06.md) (accepted 2026-10-10); [S02-T02 identity boundary accepted](test-reports/s02-t02.md); [S02-T04 REST guard accepted](test-reports/s02-t04.md); [S02-T08 role/revocation checks accepted](test-reports/s02-t08.md); [S03-T01 project role guards accepted](test-reports/s03-t01.md); [S04-T06 viewer edit rejection](test-reports/s04-t06.md); [S04-T10 REST role enforcement](test-reports/s04-t10.md); [S07-T01 WSS room authorization](test-reports/s07-t01.md); [S07-T02 single-use WSS tickets](test-reports/s07-t02.md); [S07-T08 live role and session revocation](test-reports/s07-t08.md) |
| COL-04 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-05 | G2 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-06 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-07 | G2 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-08 | G3 | Should | DONE | [S09-T04 reviewer suggestions](test-reports/s09-t04.md); [S09-T07 concurrency verification](test-reports/s09-t07.md) |
| COL-09 | G3 | Should | DONE | [S09-T04 suggestion modeling](test-reports/s09-t04.md); [S09-T05 suggestion resolution](test-reports/s09-t05.md); [S09-T07 concurrency verification](test-reports/s09-t07.md) |
| COL-10 | G3 | Should | DONE | [S03-T07 structural revision manifests](test-reports/s03-t07.md); [S04-T07 text/binary checkpoints](test-reports/s04-t07.md); [S09-T01 history queries](test-reports/s09-t01.md); [S09-T02 Myers diff and revision compare](test-reports/s09-t02.md) |
| COL-11 | G3 | Should | DONE | [S09-T03 restore with version guard](test-reports/s09-t03.md); [S09-T06 restore ACL and anchor preservation](test-reports/s09-t06.md); [S09-T08 restore dialog](test-reports/s09-t08.md) |
| COL-12 | G2 | Must | DONE | [S07-T05 offline persistence & reconnect](test-reports/s07-t05.md); [S07-T06 open room sync on tree rename/delete](test-reports/s07-t06.md) |
| COL-13 | G4 | Could | IN_PROGRESS | [S14-T05 preference-controlled collaboration notifications](test-reports/s14-t05.md) |
| COL-14 | G1 | Must | IN_PROGRESS | [S02-T09 account/session audit scope accepted](test-reports/s02-t09.md); invitation/download/restore actions remain later work |
| INT-01 | G3 | Should | DONE | [S10-T02 bibliography compilation and citation extraction](test-reports/s10-t02.md); [S10-T03 BibTeX parsing and duplicate key detection](test-reports/s10-t03.md) |
| INT-02 | G3 | Should | DONE | [S10-T03 BibTeX reference search by key, title, author, DOI, year](test-reports/s10-t03.md) |
| INT-03 | G4 | Could | DONE | [S13-T01 provider adapter contracts & token protection](test-reports/s13-t01.md); [S13-T02 Zotero library import & read-only refresh](test-reports/s13-t02.md); [S13-T05 individual reference import](test-reports/s13-t05.md); [S13-T06 provider contract verification](test-reports/s13-t06.md) |
| INT-04 | G4 | Could | DONE | [S13-T01 provider capability error model](test-reports/s13-t01.md); [S13-T03 Mendeley/Papers access research & terms matrix](test-reports/s13-t03.md); [S13-T06 provider contract verification](test-reports/s13-t06.md); [S13-T07 permitted open provider & BLOCKED_BY_PROVIDER enforcement](test-reports/s13-t07.md) |
| INT-05 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-06 | G4 | Could | IN_PROGRESS | [S14-T01 research](test-reports/s14-t01.md); [S14-T02 authenticated Git bridge](test-reports/s14-t02.md); [S14-T03 clone/push & fast-forward](test-reports/s14-t03.md); [S14-T04 canonical mutation import](test-reports/s14-t04.md); S14-T08 verification pending |
| INT-07 | G4 | Could | DONE | [S13-T01 Dropbox capability model & conflict schema invariants](test-reports/s13-t01.md); [S13-T04 manual export](test-reports/s13-t04.md); [S13-T06 provider contract verification](test-reports/s13-t06.md); [S13-T08 bidirectional sync](test-reports/s13-t08.md) |
| INT-08 | G3 | Should | DONE | [S10-T03 safe BibTeX normalization preserving raw source by default](test-reports/s10-t03.md) |
| INT-09 | G4 | Could | IN_PROGRESS | [S14-T06 optional private writing assistance opt-in & quota](test-reports/s14-t06.md) |
| INT-10 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-11 | G5 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-01 | G1 | Must | IN_PROGRESS | [S04-T02 crash recovery](test-reports/s04-t02.md); [S04-T03 retry outage](test-reports/s04-t03.md); [S04-T09 uncompacted replay](test-reports/s04-t09.md); [S04-T08 Unicode journey](test-reports/s04-t08.md); [S07-T04/T10/T11/T12 zero edit loss across restart accepted](test-reports/s07-t10.md) |
| NFR-02 | G2 | Must | DONE | [S07-T07 dual replica convergence](test-reports/s07-t07.md); [S07-T10 five simultaneous editors convergence](test-reports/s07-t10.md) |
| NFR-03 | G2 | Must | DONE | [S07-T08 live role mutation to viewer & session revocation termination accepted](test-reports/s07-t08.md) |
| NFR-04 | G5 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-05 | G2 | Must | DONE | [S07-T09 remote edit propagation and durability latency instrumented](test-reports/s07-t09.md) |
| NFR-06 | G1 | Must | DONE | [S03-T07 structural revision manifests](test-reports/s03-t07.md); [S04-T07 text/binary checkpoints](test-reports/s04-t07.md); [S06-T02 freeze compilation revision](test-reports/s06-t02.md); [S06-T06 private artifact persistence](test-reports/s06-t06.md); accepted in G1 audit |
| NFR-07 | G1 | Must | DONE | [S05-T09 concurrent upload quota evidence](test-reports/s05-t09.md); [S06-T01 compile queue quotas](test-reports/s06-t01.md); [S06-T05 execution limits](test-reports/s06-t05.md); [S06-T14 timeouts & recovery](test-reports/s06-t14.md); accepted in G1 audit |
| NFR-08 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md) (accepted 2026-10-10); [S02-T05 Edge axe and keyboard scope accepted](test-reports/s02-t05.md); [S03-T03 dashboard axe](test-reports/s03-t03.md); [S03-T05 file tree axe](test-reports/s03-t05.md); [S03-T08 project-tree e2e axe](test-reports/s03-t08.md); [S05-T02 upload picker/Edge axe](test-reports/s05-t02.md) pending review; remaining mapped tasks still apply |
| NFR-09 | G1 | Must | DONE | [S06-T16 backup and rollback](test-reports/s06-t16.md); [G1 recovery runbook](operations/g1-recovery.md); accepted in G1 audit |
| NFR-10 | G1 | Must | DONE | [S00 verified scope](test-reports/s00-verification.md) (accepted 2026-10-10); [S02-T06 captured-log redaction accepted](test-reports/s02-t06.md); [S02-T09 redacted audit scope accepted](test-reports/s02-t09.md); [S02-T08 real-route log checks accepted](test-reports/s02-t08.md); [S06-T07 path redaction](test-reports/s06-t07.md); [S06-T11 closed public mode](test-reports/s06-t11.md); [S07-T09 collab log redaction accepted](test-reports/s07-t09.md); accepted in G1 audit |
| NFR-11 | G1 | Must | DONE | Verified Chrome/Firefox/Edge compatibility in [S00](test-reports/s00-verification.md), [S02-T05](test-reports/s02-t05.md), [S03-T08](test-reports/s03-t08.md), [S04-T08](test-reports/s04-t08.md), [S05-T02](test-reports/s05-t02.md), [S06-T08](test-reports/s06-t08.md); [G1 release audit](test-reports/gate-g1-audit.md) |
| NFR-12 | G2 | Must | DONE | [S07-T05 offline persistence & reconnect](test-reports/s07-t05.md); [S07-T10 convergence recovery](test-reports/s07-t10.md) |
| PL-01 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md), [S01 verified scope](test-reports/s01-t06.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PL-02 | G1 | Must | DONE | [S00 verified scope](test-reports/s00-verification.md); [Gate G1 release stabilization & audit](test-reports/gate-g1-audit.md); [G1 release runbook](operations/g1-release.md) |
| PL-03 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PL-04 | G1 | Must | DONE | [S00 verified scope](test-reports/s00-verification.md); [S06-T15 staging deployment](test-reports/s06-t15.md); [S06-T16 rollback](test-reports/s06-t16.md); [G1 release](operations/g1-release.md); accepted in G1 audit |
| PL-05 | G1 | Must | DONE | [S00 verified scope](test-reports/s00-verification.md); [S01 verified scope](test-reports/s01-t10.md); [S06-T15 staging smoke](test-reports/s06-t15.md); [S06-T17 G1 stabilization](test-reports/s06-t17.md); accepted in G1 audit |
| PL-06 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t01.md) (accepted 2026-10-10); [S03-T09 transaction safety](test-reports/s03-t09.md); remaining mapped tasks still apply |
| PL-07 | G1 | Must | DONE | [S00 verified scope](test-reports/s00-verification.md), [S01 verified scope](test-reports/s01-t08.md) (accepted 2026-10-10); [S02-T11 private avatar boundary accepted](test-reports/s02-t11.md); [S05-T01 private upload boundary](test-reports/s05-t01.md); [S06-T03/T04/T05/T11/T13 trusted executor isolation](test-reports/s06-t11.md); accepted in G1 audit |
