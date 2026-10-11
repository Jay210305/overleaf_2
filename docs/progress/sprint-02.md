# S02 — Identity and permissions

**Status:** IN_PROGRESS | **Owner:** Julio (proposed A-02) | **Estimate:** 78 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S02-T01](../../implementation/sprint-02-identity-permissions/S02-T01-implement-registration-and-verification.md) | DONE | Not measured | [Scoped report](../test-reports/s02-t01.md); independent co-maintainer accepted 2026-10-11 |
| [S02-T02](../../implementation/sprint-02-identity-permissions/S02-T02-implement-cookie-sessions-and-logout.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S02-T03](../../implementation/sprint-02-identity-permissions/S02-T03-implement-password-recovery.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S02-T04](../../implementation/sprint-02-identity-permissions/S02-T04-implement-session-and-project-policy-guards.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S02-T05](../../implementation/sprint-02-identity-permissions/S02-T05-create-accessible-authentication-forms.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S02-T06](../../implementation/sprint-02-identity-permissions/S02-T06-add-authentication-rate-limits-and-redaction.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S02-T09](../../implementation/sprint-02-identity-permissions/S02-T09-create-redacted-audit-event-writer.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S02-T07](../../implementation/sprint-02-identity-permissions/S02-T07-implement-profile-preferences-and-session-management.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S02-T10](../../implementation/sprint-02-identity-permissions/S02-T10-implement-authenticated-password-change.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S02-T11](../../implementation/sprint-02-identity-permissions/S02-T11-implement-private-avatar-upload-lifecycle.md) | NOT_STARTED | Not recorded | No implementation evidence |
| [S02-T08](../../implementation/sprint-02-identity-permissions/S02-T08-verify-tenancy-revocation-suspension-and-csrf.md) | NOT_STARTED | Not recorded | No implementation evidence |

## Decisions and Migrations

- Branch: `feature/identity-permissions`, tracking `origin/feature/identity-permissions`; base `b75ef65` (merged S01 prerequisite state). The user explicitly selected this existing branch for S02.
- S02-T01 adds trusted operator-issued invitations, registration and verification routes, Argon2id password hashes, expiring single-use hashed tokens, exact Origin/custom-header checks and SMTP delivery. Public signup remains disabled. The existing `0001-core.sql` schema is reused; no migration was added.
- Rate limiting belongs to S02-T06; login/logout and recovery belong to S02-T02/T03. The static OpenAPI draft now describes the two interim G1 auth routes but remains a planning artifact without generation/parity evidence (GAP-12).

## Validation

S02-T01 scoped checks and command results are in [the report](../test-reports/s02-t01.md). Full sprint and gate acceptance remain open.

## Risks and Debt

Track actual findings in Open Gaps and Technical Debt, referencing the task.

## Next Task

S02-T02 cookie sessions and logout.
