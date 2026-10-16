# ADR-011 — Bounded account-bound share links

## Context

The planned `/share/{token}/redeem` path exposed a bearer token in a route that proxies may log. A redeemed membership also needs to stop authorizing access when its source link expires or is revoked.

## Decision

Use `POST /api/v1/share-links/redeem` with a strict JSON token body and a current verified account session. Store only a SHA-256 hash of a random 32-byte token. Lock the project and link during redemption, enforce role, 30-day maximum lifetime and optional 1–10,000 use limit, and bind the resulting membership to the link. Central REST and new WSS authorization reads use the `active_project_members` view to recheck source link validity. Owner revocation changes the link and derived memberships in one transaction. The planned HTTP path and response change contract version 2.0.0 to 3.0.0 before a browser consumer ships.

## Consequences

Link exhaustion stops further redemptions but does not remove grants already redeemed. A later accepted owner invitation can replace an expired link grant. Existing WSS sockets need immediate closure on revocation and expiry; S08-T08 owns that live-session verification. Production must apply migration `0010-share-link-grants.sql` before this API/collaboration code is deployed (GAP-15).
