# S02 — Identity and permissions

**Status:** DONE (11/11 tasks accepted) | **Owner:** Julio (proposed A-02) | **Estimate:** 78 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S02-T01](../../implementation/sprint-02-identity-permissions/S02-T01-implement-registration-and-verification.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t01.md); independent co-maintainer accepted 2026-10-11 |
| [S02-T02](../../implementation/sprint-02-identity-permissions/S02-T02-implement-cookie-sessions-and-logout.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t02.md); independent co-maintainer accepted 2026-10-11 |
| [S02-T03](../../implementation/sprint-02-identity-permissions/S02-T03-implement-password-recovery.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t03.md); independent co-maintainer accepted 2026-10-11 |
| [S02-T04](../../implementation/sprint-02-identity-permissions/S02-T04-implement-session-and-project-policy-guards.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t04.md); independent co-maintainer accepted 2026-10-11 |
| [S02-T05](../../implementation/sprint-02-identity-permissions/S02-T05-create-accessible-authentication-forms.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t05.md); independent co-maintainer accepted 2026-10-11 |
| [S02-T06](../../implementation/sprint-02-identity-permissions/S02-T06-add-authentication-rate-limits-and-redaction.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t06.md); independent co-maintainer accepted 2026-10-11 |
| [S02-T09](../../implementation/sprint-02-identity-permissions/S02-T09-create-redacted-audit-event-writer.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t09.md); independent co-maintainer accepted 2026-10-11 |
| [S02-T07](../../implementation/sprint-02-identity-permissions/S02-T07-implement-profile-preferences-and-session-management.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t07.md); independent co-maintainer accepted 2026-10-12 |
| [S02-T10](../../implementation/sprint-02-identity-permissions/S02-T10-implement-authenticated-password-change.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t10.md); independent co-maintainer accepted 2026-10-12 |
| [S02-T11](../../implementation/sprint-02-identity-permissions/S02-T11-implement-private-avatar-upload-lifecycle.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t11.md); independent co-maintainer accepted 2026-10-12 |
| [S02-T08](../../implementation/sprint-02-identity-permissions/S02-T08-verify-tenancy-revocation-suspension-and-csrf.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t08.md); independent co-maintainer accepted 2026-10-12 |

## Decisions and Migrations

- Branch: `feature/identity-permissions`, tracking `origin/feature/identity-permissions`; base `b75ef65` (merged S01 prerequisite state). The user explicitly selected this existing branch for S02.
- S02-T01 adds trusted operator-issued invitations, registration and verification routes, Argon2id password hashes, expiring single-use hashed tokens, exact Origin/custom-header checks and SMTP delivery. Public signup remains disabled. The existing `0001-core.sql` schema is reused; no migration was added.
- S02-T02 adds verified-account login, persisted opaque sessions, exact Origin and hashed CSRF checks, an authenticated session endpoint with atomic token rotation, and revoking logout. Migration `0003-session-security.sql` adds creation time and CSRF hash to existing sessions. HTTPS uses a Secure `__Host-` cookie; local HTTP uses a host-only cookie without Domain. Project guards and inventory remain later tasks.
- S02-T03 adds email recovery with a one-hour SHA-256 token, SMTP link, single-use reset and atomic revocation of all sessions. Known and unknown email requests return the same status/body; timing parity is unproven because known-account SMTP delivery is synchronous. No migration was needed.
- S02-T04 adds a live-session check and default-deny project route guard, backed by current PostgreSQL ownership/membership and a pure four-role action matrix. It also restricts the non-production sample route to its own fixture project. No user-facing project CRUD route or migration was added.
- S02-T05 adds browser forms for trusted invitation registration, email verification, login/logout, session restoration and password recovery. The forms call the real API, remove emailed secrets from URL fragments and show typed validation, network and 429 states. No migration was added.
- S02-T06 adds Redis-backed per-IP and per-auth-route fixed windows, 429 with Retry-After, fail-closed 503 on limiter failure and redacted application logging. No migration was added. The static OpenAPI copies describe the implemented G1 auth routes but lack generation/parity evidence (GAP-12).
- S02-T09 adds a transaction-scoped allowlist audit writer for account creation, login and session revocation (including password reset), using the existing `audit_events` schema. No migration was added; future project actions and retention work remain.
- S02-T07 adds current-user profile/preferences routes and browser settings, session inventory and selected revocation, plus per-route Redis limits. The existing `user_preferences` and `sessions` tables are reused; no migration was added. Static OpenAPI copies mark these methods IN_PROGRESS but still lack generation/parity evidence (GAP-12).
- S02-T10 adds current-password and session-CSRF checked password change, atomic Argon2id replacement, consumption of unused recovery tokens and audit-backed revocation of other sessions. The current session stays valid. No migration was added. Static OpenAPI copies mark this method IN_PROGRESS; generation/parity evidence remains GAP-12.
- S02-T11 adds bounded PNG avatars in private S3 storage, an authenticated current-user content route, browser upload/preview and queued deletion of replaced objects. Migration `0004-avatar-cleanup.sql` adds the retryable cleanup queue. Static OpenAPI copies mark the routes IN_PROGRESS; generation/parity evidence remains GAP-12. Production rollout must apply the migration before enabling the API worker.
- S02-T08 adds PostgreSQL-backed and captured-log verification for the existing project guard, session lifecycle and identity routes. No production route, contract, schema or migration changed. Product project CRUD and WSS/object authorization remain later gates.

## Validation

All 11 S02 tasks have scoped local evidence and independent co-maintainer acceptance. The final S02-T08 run passed 72 test files / 219 tests, strict typecheck, lint, formatting, local-services integration, build, secret/dependency and artifact scripts. Edge authentication/profile flows passed 3/3 with temporary local Mailpit settings; the first browser run returned 503 because the local `.env` did not configure SMTP. Planning and ICM checks passed. Exact commands, failures and limits are in the [S02-T08 report](../test-reports/s02-t08.md) and earlier scoped reports. The available GitHub combined-status query returned no statuses and the PR-run query returned no PR runs; push CI was not confirmed, so remote CI is **NOT_VERIFIED**. G1 release acceptance is still open.

## Risks and Debt

Open [GAP-12](open-gaps.md) covers OpenAPI generation/DTO parity; [GAP-14](open-gaps.md) covers recovery response timing. [DT-03](technical-debt.md) covers reconciliation if both avatar metadata commit and rollback deletion fail. Per-IP rate thresholds need release tuning. Hosted deployment, migration rollout and broader G1 product gates were not exercised by this sprint.

## Next Sprint

[S03 — Projects and files](../../implementation/sprint-03-projects-files/CONTEXT.md) begins with [S03-T01 project CRUD and pagination](../../implementation/sprint-03-projects-files/S03-T01-implement-project-crud-and-pagination.md). Its branch and prerequisite checks belong to the next sprint's start.
