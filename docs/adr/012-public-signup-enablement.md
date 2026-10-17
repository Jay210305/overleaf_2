# ADR 012: Governed Enablement of Optional Public Signup and Untrusted Execution

**Status:** Accepted  
**Date:** 2026-10-17  
**Decision Makers:** Julio & Project Co-Owner  
**Consulted:** Security, SRE  

---

## 1. Context and Problem Statement

Throughout Sprints 00 through 14, the platform operated under strict closed-mode invariants:
- `PUBLIC_SIGNUP_ENABLED=false`
- `UNTRUSTED_COMPILE_ENABLED=false`

Now that Gate 5 hardening has been reached:
- S15-T01 through S15-T03 established audited compiler executor isolation (`IsolatedCompilerExecutor` with nsjail/microVM namespaces, `-no-shell-escape`, disabled network).
- S15-T04 verified decoupled multi-replica failover and Redis Pub/Sub coordination.
- S15-T05 through S15-T07 verified load bounds (p95 <= 500ms CRUD, p95 <= 300ms WS propagation), automated disaster recovery, and privacy telemetry.
- S15-T08 and S15-T09 verified tenant security and administrative abuse controls.
- S15-T14 approved the Gate 5 release audit.

We must define the precise governance mechanism and dual-maintainer approval criteria for activating optional public signups and public compilation.

---

## 2. Decision

We approve the governed activation protocol for optional public signup and untrusted compilation:

1. **Dual-Maintainer Sign-Off Prerequisite:**
   - Enabling `PUBLIC_SIGNUP_ENABLED=true` requires explicit recorded sign-off from both maintainers (Julio and Project Co-Owner) in `docs/test-reports/public-release-approval.md`.
2. **Hard Runtime Guard:**
   - Any attempt to set `UNTRUSTED_COMPILE_ENABLED=true` without active verified isolation adapter passes will immediately abort service boot with `ISOLATION_REQUIRED`.
3. **Abuse Mitigation in Effect:**
   - Rate limiting, IP throttling, email verification, and admin account suspension are active.
4. **Default Safe State:**
   - In development and standard self-hosted environments, default values remain `false` unless explicitly opted-in via audited production environment variables.

---

## 3. Consequences

- Public registration can be safely toggled in production environments meeting Gate 5 isolation criteria.
- Adversarial TeX compilation remains strictly isolated inside sandboxed microVM/namespace workers with zero credential leakage.
- Self-hosters without container sandboxing remain safely protected in trusted-worker mode.
