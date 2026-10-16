# HTTP API Contract

## Version, Types and Routes

`/api/v1` is the base path. [OpenAPI](openapi.json) defines typed requests/responses, required versus optional fields, status codes, per-operation authentication, pagination, preconditions and examples for each planned operation. IDs are UUID strings, timestamps are ISO 8601 UTC, integers are bounded, input objects reject unknown fields, and optional fields are explicitly declared. No binary/base64 file transport through JSON.

S05-T01 implements `POST /projects/{projectId}/uploads/presign` and `/uploads/complete` for authenticated OWNER/EDITOR sessions with exact Origin and session CSRF. The strict presign request carries `fileName`, `mime`, `sizeBytes`, `sha256` and optional `parentId`; the response carries a 300-second PUT URL for a unique private staging key, `uploadId` and expiry. Completion requires `Idempotency-Key` and `{uploadId, sha256}`. The backend reads at most 25 MiB, recomputes hash and verifies actual bytes before creating a TEXT/Yjs or BINARY node. Repeating completion with the same key returns the same node; a different key conflicts. Unsafe names return 400, excess bytes/nodes 413, unsupported or mismatched content 422, foreign/expired intents 404/422, and denied roles 403. The OpenAPI operation records are IN_PROGRESS while client UI, orphan cleanup and stage acceptance remain open.

S05-T12 adds `POST /projects/imports/presign` for an authenticated actor's ZIP size/SHA-256 and completes `POST /projects/imports` with `{uploadId, title}` plus `Idempotency-Key`. Exact Origin, current session and CSRF protect both mutations. The latter verifies actual private ZIP bytes, reserves an S05-T03 job before copying to a server-only key, and returns `202` only when queued. Same actor/key/input returns the same job; changed input conflicts. `GET /projects/imports/{jobId}` is actor-scoped and reports the import-specific `ImportJobView` (`validated` means ready for S05-T10, never project success), without object keys. S05-T12 owns expired-intake cleanup through the storage GC actor scope. See the [approved design](../superpowers/specs/2026-10-12-s05-archive-import-design.md).

Proposed additions to the original inventory include REST text-state read/save, account password/avatar/privacy routes, bulk/ownership/statistics routes, import/sync status and Git token management. They close requirements absent from the original endpoint tables. `/auth/refresh` is intentionally excluded under ADR-005's opaque-session decision; an access/refresh change needs an ADR.

## G1 Trusted Registration Slice

Until G5 isolation and release approval, `PUBLIC_SIGNUP_ENABLED=false`. The live S02-T01 `POST /auth/register` accepts the planned email/password/displayName body only with an operator-issued, email-bound, one-use `X-Registration-Invite` secret. The operator command sends that secret by SMTP; no public route issues it. Registration and `POST /auth/verify-email` require the exact configured `Origin` and a nonempty custom `X-CSRF-Token` header. The latter is a browser mutation guard for this anonymous, cookie-free flow; authenticated session CSRF is S02-T02 work. Both routes return the planned `Accepted` body, or `application/problem+json` on denial. The registration invitation and email-verification token are stored only as SHA-256 hashes, expire after 24 hours and are consumed under PostgreSQL row locks. The live S02-T06 rate limiter applies to these routes.

## G2 Project Invitation Slice (S08-T01)

An authenticated OWNER may `POST /projects/{projectId}/invitations` with a normalized email and `EDITOR`, `REVIEWER` or `VIEWER` role. Only an existing verified, enabled trusted account is eligible while public signup remains disabled. The response contains an invitation ID, email, role, status and timestamps; it never contains the raw token. SMTP sends a 32-byte random token in the fragment of `/invitations#token=...` through the configured mail transport. A missing or failed transport returns 503 and leaves the invitation unusable. Only the SHA-256 token hash is stored. Invitations expire after seven days; creating a new invitation supersedes the previous pending invitation for that project/email.

The OWNER can list invitations with a bounded project-scoped cursor and revoke an unconsumed invitation with `DELETE /projects/{projectId}/invitations/{invitationId}`. A signed-in recipient with the matching verified email can `POST /invitations/accept` or `/invitations/reject` with strict JSON `{ "token": "..." }`. Both require exact Origin, a current cookie and session CSRF; the server rechecks the account, project and invitation under PostgreSQL locks. Accept inserts or deliberately reactivates the project membership once. A membership revoked after the invitation was issued cannot be reactivated by that older invitation. Reject and revoke consume the invitation without granting membership. Used, revoked, foreign-email and unknown tokens return 404; expired tokens return 410. No invitation grants access before acceptance. Project WSS and object guards continue to consult current membership.

ADR-010 moves token redemption out of the planned URL path and into the JSON body to keep bearer secrets out of route paths and proxy access logs. The static OpenAPI copies describe this contract; runtime coverage and remaining review are in [S08-T01 evidence](../test-reports/s08-t01.md).

## G2 Bounded Share-Link Slice (S08-T02)

An authenticated OWNER creates a link with `POST /projects/{projectId}/share-links`, choosing `EDITOR`, `REVIEWER` or `VIEWER`, an expiry no more than 30 days ahead, and optional `maxUses` from 1 to 10,000. Creation returns a random 32-byte token once; only its SHA-256 hash is persisted. Owner list pagination returns metadata without token or hash. Owner `DELETE /projects/{projectId}/share-links/{linkId}` revokes the link and its derived memberships transactionally. An existing verified account redeems with `POST /share-links/redeem` and strict JSON `{ "token": "..." }`, exact Origin, session and CSRF. Redemption locks the project and link, checks expiry/use limit, increments the use count and binds a membership to the link. Existing independent active membership cannot be replaced by a link. Unknown/revoked links return 404, expired/exhausted links 410, and conflicting membership 409.

Every REST and new WSS authorization read consults `active_project_members`: a derived membership is usable only while the source link is unrevoked, unexpired, within the same project, and still grants the recorded role. Link exhaustion limits new redemptions; it does not revoke already redeemed grants. A later accepted owner email invitation can replace an expired/revoked link grant as an independent membership. Active socket closure on link expiry or revocation remains part of S08-T08. ADR-011 records the token-in-body change from the planned URL route; contract version 3.0.0 reflects that changed path and response shape.

## G2 Sharing and Member UI Slice (S08-T03)

`GET /projects/{projectId}/members` lists the project owner and active members for any current project role, with bounded UUID-cursor pagination. It returns display names, IDs and roles without email addresses or bearer tokens. `PATCH /projects/{projectId}/members/{userId}` and `DELETE` at that path require OWNER, exact Origin, current session and CSRF; they reject owner targets, foreign project IDs, invalid roles and inactive memberships. The patch changes a link-derived grant into an independent owner-managed membership. Both mutations record scoped audit events. Revocation denies later REST requests and new WSS handshakes; closure of an already-open socket remains for S08-T08.

The workspace sharing dialog reads member, invitation and link state from these APIs. OWNER may invite, change roles, remove members and create/revoke links; other members see a read-only active member list. Invitation and share-link browser routes take one-use tokens from URL fragments, immediately clear the fragment, and redeem through JSON bodies with a current session and CSRF. The raw share token is shown only when created and stays in component memory until the dialog closes; it is never persisted in browser storage.

## G2 Project Chat Slice (S08-T05)

`GET /projects/{projectId}/chat/messages` returns `{items,nextCursor}` with a project-scoped UUID cursor, newest first by creation time and UUID, and `limit` 1–100 (default 20). `POST` at the same path accepts strict JSON `{body}` up to 10,000 characters and returns the committed message with author display name. Both routes require current OWNER, EDITOR or REVIEWER membership; VIEWER is denied. POST also requires exact Origin and session CSRF, and rechecks session, project and role in the insert transaction. Invalid body/cursor returns 400, denied role 403 and foreign project 404.

`WSS /projects/{projectId}/chat/events` is read-only. The handshake requires exact Origin, a current session cookie and COMMENT permission; an open socket rechecks access and closes after revocation. Each `chat.created` frame carries only an event envelope and message ID. Hints are derived from committed chat rows, so the browser revalidates REST after each hint, on reconnection or focus, and periodically to recover missing frames. Rate limits are S08-T07 work; this slice does not complete COL-07.

## G2 Mention and In-App Notification Slice (S08-T06)

Comment creation and reply creation call `createMentionNotifications` inside the same PostgreSQL transaction. Only current project members (owner or active member) with verified, enabled accounts and opt-in `user_preferences.notification_settings_json` (`inApp` plus `mentions`/`replies`) receive a row; the actor never notifies themselves. Foreign-user mentions are rejected with 400 before any write. A unique index on `(user_id, type, payload_json->>'sourceId')` for `mention`/`reply` types makes repeated publication of the same source idempotent (`ON CONFLICT DO NOTHING`). Reply creation additionally notifies the parent comment author with type `reply` unless they were already mentioned.

`GET /api/v1/me/notifications` returns `{items,nextCursor}` newest-first with a project-scoped UUID cursor and `limit` 1–100 (default 20). It lists only `mention`/`reply` rows whose project is active and still grants the reader membership, so revoked members and outsiders see nothing foreign. `PATCH /api/v1/me/notifications/{notificationId}/read` requires exact Origin, session and CSRF, sets `read_at` once (repeat reads return the same timestamp), and returns 404 for foreign or post-revocation rows. Payloads carry only IDs and the project title, never comment bodies. The dashboard mounts the notification region with mark-read persistence. This slice does not complete COL-06 or COL-13; safety hardening remains S08-T07 and revocation verification S08-T08.

## G2 Comment and Chat Safety Slice (S08-T07)

Comment, reply and chat writes pass `assertSafeBody`/`assertChatBody` (`apps/api/src/modules/comments/safety.ts`, `apps/api/src/modules/chat/safety.ts`) inside the write transaction after the existing session/CSRF/project/role checks. Bodies over 10,000 characters, NUL bytes, executable tags (`script`, `iframe`, `object`, `form` and kin), event-handler attributes and `javascript:`/`data:`/`vbscript:` destinations in links, images and URL attributes are rejected with 400. The shared Zod body shape already rejects raw `<`, `>` and control characters, so the module is a second server-side backstop (it also closes the `vbscript:` gap the shape leaves open) plus the single home of the writer-role helper now used by both comment and chat writers. Safe Markdown — emphasis, links, inline code, quotes and LaTeX math — passes through byte-for-byte and is stored verbatim.

Flood protection is PostgreSQL-backed sliding windows counted in the write transaction, so it holds across replicas: 30 chat messages per author per project per 60 seconds and 30 comment/reply creations per author per project per 300 seconds; excess writes return 429 `RATE_LIMITED` with no state change. VIEWER writes stay 403, foreign projects 404 and revoked members 404 through the pre-existing guards, now covered by S08-T07 role-matrix regression. This slice completes the COL-07 rate-limit requirement; open-socket closure on revocation remains S08-T08.

## G2 Sharing Revocation and Detached Anchors Slice (S08-T08)

Member removal, role change and share-link revocation publish to the `collab:invalidations` Redis channel (`apps/api/src/modules/collab/invalidation.ts`), the same JSON shape the collaboration service already consumes in its `LiveRevocationManager`: `member_removed` closes the affected project sockets with 4403, `role_changed` downgrades demoted sockets to read-only, and outstanding single-use WSS tickets are invalidated with them. Events publish after the revocation transaction commits; a publish failure is logged without secrets and never rolls back the already-enforced database denial, and the chat WSS independently rechecks membership on every poll. Expired invitations return 410 and grant nothing, revoked or consumed invitations and links return 404, exhausted links return 410, and redemption stays bound to the source project. Deleted comment ranges resolve to `detached` with reason `range_changed` and null offsets rather than moving to unrelated text; the browser shows the unavailable-anchor reason without a highlight mark.

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
