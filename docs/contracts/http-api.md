# HTTP API Contract

## Version, Types and Routes

`/api/v1` is the base path. [OpenAPI](openapi.json) defines typed requests/responses, required versus optional fields, status codes, per-operation authentication, pagination, preconditions and examples for each planned operation. IDs are UUID strings, timestamps are ISO 8601 UTC, integers are bounded, input objects reject unknown fields, and optional fields are explicitly declared. No binary/base64 file transport through JSON.

Proposed additions to the original inventory include REST text-state read/save, account password/avatar/privacy routes, bulk/ownership/statistics routes, import/sync status and Git token management. They close requirements absent from the original endpoint tables. `/auth/refresh` is intentionally excluded under ADR-005's opaque-session decision; an access/refresh change needs an ADR.

## G1 Trusted Registration Slice

Until G5 isolation and release approval, `PUBLIC_SIGNUP_ENABLED=false`. The live S02-T01 `POST /auth/register` accepts the planned email/password/displayName body only with an operator-issued, email-bound, one-use `X-Registration-Invite` secret. The operator command sends that secret by SMTP; no public route issues it. Registration and `POST /auth/verify-email` require the exact configured `Origin` and a nonempty custom `X-CSRF-Token` header. The latter is a browser mutation guard for this anonymous, cookie-free flow; authenticated session CSRF is S02-T02 work. Both routes return the planned `Accepted` body, or `application/problem+json` on denial. The registration invitation and email-verification token are stored only as SHA-256 hashes, expire after 24 hours and are consumed under PostgreSQL row locks. The live S02-T06 rate limiter applies to these routes.

## Security and Permission Matrix

API-host-only opaque session cookie; HttpOnly, Secure under TLS, SameSite=Lax, 7-day idle and 30-day absolute expiry as configurable starting proposals. Hash stored session/token values. Use CSRF token header plus exact Origin validation on mutations. Test local/staging domain behavior; never weaken production cookie policy to fix development.

## G1 Cookie Session Slice

The live S02-T02 `POST /auth/login` accepts only verified, enabled trusted accounts. It requires the exact configured `Origin` and a custom `X-CSRF-Token` header, returns a browser-safe user view and a separate random CSRF secret in a response header, and sets a host-only opaque HttpOnly SameSite=Lax cookie. Production HTTPS uses `__Host-latex_session` with `Secure`; local HTTP uses `latex_session` without a `Domain` attribute. Credentialed CORS is restricted to the configured origin. The raw session and CSRF secrets are never stored in PostgreSQL.

`GET /auth/session` requires the exact Origin and a valid cookie. It atomically rotates both secrets, returns only the current user and extends the seven-day idle expiry no later than 30 days from creation. The old cookie is immediately invalid. `POST /auth/logout` requires the exact Origin, a valid cookie and the matching CSRF header; it persists revocation and clears the cookie. Expired, revoked and unknown cookies return 401, while forged Origin/CSRF and disabled accounts return 403. The live S02-T06 rate limiter applies to login, session read and logout. Project-role authorization and session inventory remain S02-T04/T07 work; this slice supplies only the authenticated identity boundary.

## G1 Password Recovery Slice

The live S02-T03 `POST /auth/password/forgot` requires the exact configured `Origin` and a custom `X-CSRF-Token` header. A syntactically valid known or unknown email returns the same 202 `{ "accepted": true }` body; only a verified, enabled account with a password receives mail. The one-hour, 32-byte random token is stored only as a SHA-256 hash. A later request invalidates an earlier unused reset token. SMTP delivery failure invalidates the undelivered token and preserves the 202 response; if SMTP is not configured, the route returns 503 for all addresses. Response-status/body parity is tested; external SMTP latency parity is not established.

`POST /auth/password/reset` applies the same Origin and custom-header guard. It accepts the emailed one-use token and a password of 8–128 characters, matching the trusted registration policy. The server rechecks the token and account under PostgreSQL row locks, then changes the Argon2id hash, consumes all pending reset tokens for that user and revokes every session in one transaction. Malformed requests return 400; expired, used or unknown tokens return 401; disabled accounts return 403. The live S02-T06 rate limiter applies to both recovery routes.

## G1 Authentication Rate Limit and Redaction Slice

S02-T06 uses one Redis-backed, atomic fixed window per client socket IP and auth route. Production API startup requires Redis; a limiter failure after startup denies auth with 503 rather than bypassing the guard. Route limits per minute are 5 for registration and forgot, 10 for verification, login and reset, and 60 for session read and logout. Exceeded windows return 429 `application/problem+json` with code `RATE_LIMITED` and a positive integer `Retry-After` in seconds, exposed through credentialed CORS. Client-supplied proxy headers are not trusted for the key, and Redis keys contain only a SHA-256 IP digest and a route digest. Existing Origin, CSRF, account and token checks still run on requests admitted by the limiter. The Fastify logger omits request URLs, headers, bodies, queries, error messages and stacks from its normal captured output. This is per-IP route abuse protection; a later security review must assess distributed client abuse and operational thresholds before public exposure.

## G1 Profile and Session Inventory Slice

S02-T07 serves `GET/PATCH /me`, `GET/PATCH /me/preferences`, `GET /me/sessions`, `GET /me/sessions/{sessionId}` and `DELETE /me/sessions/{sessionId}` for the current verified, enabled account only. Reads require the exact Origin and a valid opaque cookie; writes also require the current CSRF secret. Mutation transactions lock and recheck the current session before updating profile, preferences or session revocation. Foreign, revoked or missing session IDs return 404. Revoking the current session clears its cookie. The session list uses a bounded cursor and includes only the caller's active, unexpired sessions. These routes have per-IP Redis limits of 60 reads or 30 writes per minute, returning 429 with `Retry-After` on excess.

Display name and locale/timezone can be updated on `/me`; locale, timezone, theme and validated editor/notification settings can be updated on `/me/preferences`. Locale and IANA timezone values are validated. Preferences are stored in `user_preferences`, defaulting to `en`, `UTC` and `system` until the user saves them; the browser loads them on the settings page and applies the saved theme. Email is read from the existing trusted account; avatar upload is supplied by S02-T11 and email-change workflows remain outside this slice. The static OpenAPI copies mark these implemented methods IN_PROGRESS; generation and DTO parity remain GAP-12.

## G1 Private Avatar Slice

S02-T11 serves `POST /me/avatar` with raw `image/png` bytes, at most 1,000,000 bytes and 1024 pixels on each side. The API verifies PNG chunk CRCs, scanline inflation bounds, exact Origin, the current verified/enabled session and matching CSRF secret. Only server-created `avatars/<userId>/<uuid>.png` keys are stored in the private object bucket. `GET /me/avatar/content` repeats the account and Origin checks, reads only the caller's current `avatar_key`, rejects user/key query selectors and returns `image/png` with no-store caching. The profile DTO uses this private endpoint path for `avatarUrl` when an avatar exists; the browser fetches the bytes with credentials and displays a local object URL.

Replacement writes the new private object, then changes `users.avatar_key` and enqueues the previous key in `avatar_cleanup_jobs` atomically. A bounded worker rechecks live references before deleting queued objects and retries failed storage deletes. A failed database update attempts to delete the newly written object. Invalid PNG/foreign selectors return 400, missing/expired session 401, forged CSRF/Origin or disabled accounts 403, oversized upload 413, absent avatar 404, excess per-IP requests 429 and unavailable storage 503. The static OpenAPI copies mark these methods IN_PROGRESS; generation/DTO parity remains GAP-12.

## G1 Authenticated Password Change Slice

S02-T10 serves `POST /me/password` for the current verified, enabled account. It requires the exact configured Origin, a valid opaque session cookie and the matching session CSRF secret. The strict JSON body contains `currentPassword` and `newPassword`; the new password uses the existing registration/reset policy of 8–128 characters. The current password accepts 1–128 characters so an account with a legacy shorter password can change it. After verifying the current Argon2id hash, a transaction replaces it, consumes unused password-reset tokens, revokes every other session and writes redacted revocation audit events. The requesting session remains valid. Incorrect current credentials or a disabled account return 403 without a password or session change; missing/expired sessions return 401, malformed input 400, and Redis excess 429 with `Retry-After`. The static OpenAPI copies mark this method IN_PROGRESS; generation/DTO parity remains GAP-12.

## G1 Project Policy Guard Slice

S02-T04 installs a default-deny pre-handler for project-scoped REST routes under `/api/v1/projects/{projectId}/...`. Each route must declare a server-owned `projectAction`; absent or unknown actions return 403 before the handler. The guard requires exact Origin, a current verified/enabled account with an unexpired, unrevoked opaque session, and a matching session CSRF token on mutations. It reads the current project owner or active membership from PostgreSQL for each request. A malformed project ID returns 400, missing session 401, disabled account or denied role/action 403, and absent or foreign project 404 without project content. Non-active projects are hidden except for a permitted restore action.

`packages/auth` owns the pure OWNER/EDITOR/REVIEWER/VIEWER action matrix below. Reviewer/viewer compile and source export default to denied; explicit capability arguments are supported by the pure function but the live guard does not grant them until a later persisted policy source exists. No user-facing project CRUD route is implemented in this slice; S03-T01 owns those operations and must declare the correct action and recheck authorization inside each mutation transaction. WSS and object access remain later boundaries. The non-production persisted sample endpoint is constrained to its own named fixture project and cannot select an arbitrary user's earliest project.

| Action | OWNER | EDITOR | REVIEWER | VIEWER |
|---|---|---|---|---|
| Read project/PDF | Yes | Yes | Yes | Yes |
| Edit canonical text/tree | Yes | Yes | No | No |
| Compile | Yes | Yes | Only explicit quota policy | Only explicit quota policy |
| Comment/chat | Yes | Yes | Yes | No |
| Propose review changes | Yes | Yes | Yes | No |
| Accept/reject suggestion | Yes | Yes | No | No |
| Invite/roles/share links | Yes | No | No | No |
| Restore content | Yes | Yes | No | No |
| Transfer/permanent delete | Yes | No | No | No |
| Export source | Yes | Yes | Explicit export capability | Explicit export capability |

Default reviewer/viewer compile and source export capability is false until the OWNER explicitly enables it. Share-link capabilities intersect with role/project policy and never add administrative rights. Foreign resources return 404 to avoid enumeration; known authorized-resource action denial returns 403. Test both consistently. All object URLs and WSS operations repeat current server-side permission checks.

## Common Error Model

Use `application/problem+json`: `{ type: URI, title: string, status: integer, code: string, detail: string, requestId: string, fieldErrors?: Record<string,string[]> }`. Body and HTTP status agree. Starting codes: VALIDATION_ERROR (400), AUTHENTICATION_REQUIRED (401), PROJECT_PERMISSION_DENIED (403), RESOURCE_NOT_FOUND (404), REVISION_CONFLICT/SUGGESTION_CONFLICT/REMOTE_CONFLICT (409), PRECONDITION_FAILED (412), QUOTA_EXCEEDED (413 or 429 by resource kind), UNSUPPORTED_CONTENT (422), RATE_LIMITED (429), SERVICE_UNAVAILABLE (503), PROVIDER_UNAVAILABLE (502). Do not reveal internal paths, tokens or private manuscript content.

Valid: authorized `POST /projects/{id}/compilations` with `{"compiler":"pdflatex","forceClean":false}` returns 202 and CompilationView with immutable sourceRevisionId.

Invalid: `{"compiler":"shell","timeoutSeconds":999999}` fails schema validation with 400 VALIDATION_ERROR and fieldErrors; no job is queued. Each operation's OpenAPI record carries its own valid body/response and invalid example.

## Pagination, Concurrency and Idempotency

Cursor list routes accept opaque cursor and `limit` 1–100, default 20; deterministic ordering is timestamp plus UUID tie-breaker. Return `{items, nextCursor}`; null cursor means end. Validate cursor encoding and sort/filter context server-side.

Metadata mutation uses quoted treeVersion/revision in If-Match. Restore and replacement/sync provide expectedRevision/base SHA. Stale preconditions never overwrite silently. Retryable job/create routes require Idempotency-Key, scoped to actor/project/operation for a proposed 24h TTL. Same key/body returns existing result; same key/different body yields 409. Transactions own mutation and associated audit/outbox records. Notifications are invalidation hints; clients revalidate REST after missing events.

## Contract Verification

S01-T05 creates `packages/contracts/src` Zod validators and generated `docs/api/openapi.json`; schema-diff tests compare with this planned contract. Feature tasks test valid payload, invalid field/value, unauthenticated/forbidden access, expected status and response validation. Do not mark a route available because it exists in OpenAPI.

## Share Access and Optional MFA

Link redemption requires a logged-in session in this baseline. Atomically consume a permitted use and bind a project/role/expiry-scoped capability to that session; later REST/WSS checks re-evaluate link revocation and role policy. No unknown account receives trusted compiler access through a share token.

When optional MFA is enabled in G4, login requires a verified TOTP or one-use recovery code before issuing a session cookie; missing challenge returns AUTHENTICATION_REQUIRED/MFA_REQUIRED after password validation. Optional fields in LoginRequest do not enable MFA in the G1 baseline. Social linking still requires current account verification.
