# HTTP API Contract

## Version, Types and Routes

`/api/v1` is the base path. [OpenAPI](openapi.json) defines typed requests/responses, required versus optional fields, status codes, per-operation authentication, pagination, preconditions and examples for each planned operation. IDs are UUID strings, timestamps are ISO 8601 UTC, integers are bounded, input objects reject unknown fields, and optional fields are explicitly declared. No binary/base64 file transport through JSON.

Proposed additions to the original inventory include REST text-state read/save, account password/avatar/privacy routes, bulk/ownership/statistics routes, import/sync status and Git token management. They close requirements absent from the original endpoint tables. `/auth/refresh` is intentionally excluded under ADR-005's opaque-session decision; an access/refresh change needs an ADR.

## Security and Permission Matrix

API-host-only opaque session cookie; HttpOnly, Secure under TLS, SameSite=Lax, 7-day idle and 30-day absolute expiry as configurable starting proposals. Hash stored session/token values. Use CSRF token header plus exact Origin validation on mutations. Test local/staging domain behavior; never weaken production cookie policy to fix development.

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
