# ADR-005 — Sessions and Multi-tenancy

**Context:** REST, WSS, downloads and provider sync must share current authorization.
**Options:** Long-lived browser tokens, opaque cookies with scoped WSS tickets, or access/refresh tokens.
**Decision:** Opaque revocable API-host-only cookie sessions, SameSite=Lax in coherent same-site domains, CSRF token plus Origin checks, one-use 30 s WSS tickets, centralized deny-by-default permissions. No access/refresh flow in the baseline.
**Consequences:** `/auth/refresh` is omitted unless a new ADR changes session strategy; previews need tested cookie/domain policy; revocation must affect active sockets.

## S00 implementation evidence

S00 exposes public health only, with generated request IDs, bounded dependency probes, generic errors and logs without query/body/header content. CORS permits the exact configured browser origin. No sessions/cookies/ACL implementation is claimed; S02 adds those requirements before private product endpoints.

Sources: [decision baseline](../planning/09-decisions.md), [S00 verification](../test-reports/s00-verification.md).
