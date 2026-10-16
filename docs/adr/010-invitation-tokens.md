# ADR-010 — Project Invitation Token Transport

## Context

The initial planned OpenAPI put a bearer invitation secret in `/invitations/{token}/accept` and `/reject`. Route paths can appear in reverse-proxy access logs even when the Fastify logger omits URLs. Public registration remains disabled; project invitations must stay within the existing trusted account registry.

## Options

- Keep the planned token path and depend on every proxy and logger redacting it.
- Carry the token in a query string.
- Mail a link with a URL fragment and send the token in a strict JSON body after sign-in.

## Decision

Use `/invitations#token=...` in email and `POST /api/v1/invitations/accept` or `/reject` with `{ "token": "..." }` in the request body. The browser must clear the fragment after reading it in S08-T03. The server stores only the SHA-256 hash and requires the matching verified account, current session, exact Origin and CSRF token. The planned path contract changes from 1.0.0 to 2.0.0 before any runtime consumer of the old path shipped.

## Consequences

The API and both static OpenAPI copies use body redemption. S08-T03 must consume the fragment and POST the body without persisting the secret. Application logging omits request bodies and URLs; transport and reverse-proxy logging still require deployment review. Project invitations can target only existing verified trusted accounts until a separately approved trusted onboarding flow exists.
