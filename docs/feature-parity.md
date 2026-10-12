# Feature Parity and Evidence

All IDs start NOT_STARTED. Planned paths and written acceptance are not actual implementation evidence. Update only with real report/run reference; provider limits remain explicit.

| ID | Gate | Priority | Status | Evidence |
|---|---|---|---|---|
| ACC-01 | G1 | Must | IN_PROGRESS | [S02-T01 registration and verification accepted](test-reports/s02-t01.md); [S02-T02 login/logout accepted](test-reports/s02-t02.md); [S02-T03 recovery accepted](test-reports/s02-t03.md); [S02-T05 browser flow accepted](test-reports/s02-t05.md); [S02-T06 server rate limits accepted](test-reports/s02-t06.md); recovery timing GAP-14 remains |
| ACC-02 | G1 | Must | IN_PROGRESS | [S02-T02 opaque session, CSRF, expiry and revocation accepted](test-reports/s02-t02.md); [S02-T06 auth limits accepted](test-reports/s02-t06.md); [S02-T07 session inventory/revocation accepted](test-reports/s02-t07.md); [S02-T10 other-session revocation awaiting review](test-reports/s02-t10.md); remaining mapped checks apply |
| ACC-03 | G1 | Must | IN_PROGRESS | [S02-T07 profile/preferences scope accepted](test-reports/s02-t07.md); private avatar lifecycle remains S02-T11 |
| ACC-04 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| ACC-05 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| ACC-06 | G1 | Must | IN_PROGRESS | [S02-T03 recovery reset revokes sessions, accepted](test-reports/s02-t03.md); [S02-T10 authenticated change awaiting review](test-reports/s02-t10.md); remaining gate checks apply |
| ACC-07 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| ACC-08 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-01 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t03.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PRO-02 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-03 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-04 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t07.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PRO-05 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t08.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PRO-06 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t08.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PRO-07 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-08 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-09 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-10 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-11 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-12 | G3 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-13 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-14 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PRO-15 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-01 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-02 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-03 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-04 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-05 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-06 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-07 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-08 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-09 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-10 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-11 | G3 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-12 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-13 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| EDT-14 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-01 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-02 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-03 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-04 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-05 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-06 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-07 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-08 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-09 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-10 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-11 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| CMP-12 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-01 | G2 | Must | IN_PROGRESS | [S00-T11 compatibility research](test-reports/s00-t11.md#acceptance-review); [remaining tasks](planning/traceability.md) |
| COL-02 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-03 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t06.md) (accepted 2026-10-10); [S02-T02 identity boundary accepted](test-reports/s02-t02.md); [S02-T04 REST guard accepted](test-reports/s02-t04.md); product project routes S03 and WSS G2 remain |
| COL-04 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-05 | G2 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-06 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-07 | G2 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-08 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-09 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-10 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-11 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-12 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-13 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| COL-14 | G1 | Must | IN_PROGRESS | [S02-T09 account/session audit scope accepted](test-reports/s02-t09.md); invitation/download/restore actions remain later work |
| INT-01 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-02 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-03 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-04 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-05 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-06 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-07 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-08 | G3 | Should | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-09 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-10 | G4 | Could | NOT_STARTED | [Planned trace](planning/traceability.md) |
| INT-11 | G5 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-01 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-02 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-03 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-04 | G5 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-05 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-06 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-07 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-08 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md) (accepted 2026-10-10); [S02-T05 Edge axe and keyboard scope accepted](test-reports/s02-t05.md); remaining mapped tasks still apply |
| NFR-09 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-10 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md) (accepted 2026-10-10); [S02-T06 captured-log redaction accepted](test-reports/s02-t06.md); [S02-T09 redacted audit scope accepted](test-reports/s02-t09.md); remaining mapped tasks still apply |
| NFR-11 | G1 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| NFR-12 | G2 | Must | NOT_STARTED | [Planned trace](planning/traceability.md) |
| PL-01 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md), [S01 verified scope](test-reports/s01-t06.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PL-02 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md) (accepted 2026-10-10); G1 release gate stabilization/audit applies before DONE |
| PL-03 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PL-04 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PL-05 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md), [S01 verified scope](test-reports/s01-t10.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PL-06 | G1 | Must | IN_PROGRESS | [S01 verified scope](test-reports/s01-t01.md) (accepted 2026-10-10); remaining mapped tasks still apply |
| PL-07 | G1 | Must | IN_PROGRESS | [S00 verified scope](test-reports/s00-verification.md), [S01 verified scope](test-reports/s01-t08.md) (accepted 2026-10-10); remaining mapped tasks still apply |
