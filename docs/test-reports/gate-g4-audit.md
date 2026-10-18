# Gate 4 (G4) Ecosystem Integrations & Extensibility Release Audit

**Gate:** Gate 4 (Ecosystem Integrations & Extensibility: Cloud Storage, Reference Providers, Git HTTP Bridge, OAuth Linking & MFA)

**Date:** 2026-10-17

**Branch:** `codex/sprint-14-git-and-optional-features` tracking `origin/codex/sprint-14-git-and-optional-features`.

**Base:** `codex/sprint-13-reference-providers`.

**Auditors & Maintainers:** Julio & Project Co-Owner
**Status:** MERGE REVIEW PENDING. The branch's scoped checks below passed, but the merged `main` verification and release evidence are recorded in [the S13/S14 merge report](merge-s13-s14.md). This report does not establish credentialed staging acceptance or co-maintainer sign-off.

**Merged-main correction:** OAuth start/callback are unavailable in the running API until a trusted provider exchange and verified profile resolver are configured. The branch's mock resolver was removed during integration because it accepted arbitrary codes as identities.

---

## 1. Audit Overview & Delivered Scope

Gate 4 expands the collaborative LaTeX platform with external ecosystem integrations, secure remote resource imports, revocable Git Smart HTTP synchronization, social OAuth account linking, and two-factor authentication:

- **Cloud Storage Synchronization (Sprint 12 / INT-01, INT-02)**:
  - Bidirectional Dropbox and Google Drive synchronization with conflict resolution and fast-forward verification.
  - Safe credential management: OAuth refresh tokens stored with AES-256-GCM encryption.
  - Selective project export and import without exposing filesystem paths.
- **Academic Reference Providers (Sprint 13 / INT-03, INT-04)**:
  - Zotero Web API integration: authenticated library sync, collection discovery, and `.bib` file generation into project repositories.
  - Mendeley research spike (INT-04): rigorously evaluated upstream API deprecation, concluding blocked status with documented findings. Unsupported integration visibly disabled in UI/API (`CAPABILITY_UNSUPPORTED`).
- **Git Smart HTTP Protocol & CLI Support (Sprint 14 / INT-05, INT-06)**:
  - Smart HTTP endpoints (`/git/:repo/info/refs`, `/git/:repo/git-upload-pack`, `/git/:repo/git-receive-pack`) tested with authentic Linux Git CLI.
  - Fast-forward commit enforcement: non-fast-forward pushes rejected with safe error reporting.
  - Canonical Yjs CRDT translation via `applyGitImport`: incoming Git commits create durable database revisions and update editor CRDT text models.
  - Binary and Unicode assets: UTF-8 international text, non-ASCII filenames, and binary figures preserved with byte-for-byte fidelity across clone, push, and pull.
  - Token revocation and expiry: dedicated revocable Git tokens (`glc_git_...`) verified; revoked or expired tokens immediately reject read/write operations with HTTP 401.
- **Safe Social OAuth & Multi-Factor Authentication (Sprint 14 / ACC-04, ACC-06)**:
  - Safe social OAuth linking and unlinking (`apps/api/src/modules/auth/oauth.ts`) for Google and GitHub. Enforces single-use PKCE state and prevents account hijacking (409 `IDENTITY_ALREADY_LINKED`) and last auth method unlinking (409 `CANNOT_UNLINK_LAST_AUTH_METHOD`).
  - Opt-in RFC 6238 TOTP MFA (`apps/api/src/modules/auth/mfa.ts`, `totp.ts`): QR/base32 secret setup, TOTP verification on login, single-use recovery codes, and authenticated challenge on MFA disable with session invalidation.
- **SSRF-Safe Remote Resource Import (Sprint 14 / PRO-14)**:
  - SSRF-safe HTTP client (`apps/jobs/src/imports/remote-resource.ts`) enforcing private IPv4/IPv6 blocking, cloud metadata IP protection (`169.254.169.254`, `metadata.google.internal`), DNS re-validation per hop, protocol allowlisting, content-type verification, and size/timeout limits.
- **Compiler Package Manifests & Font Profiles (Sprint 14 / CMP-12)**:
  - Manifest catalog (`apps/tex-executor/package-manifest.json`) covering TeX Live packages, fonts (`fontspec`, `firamath`), CTAN sources, engine compatibility matrix, and licensing declarations (`LPPL-1.3c`, `OFL-1.1`).
  - Strict security policies: `networkInstallOnDemand: false`, `shellEscape: false`, restricted `texmf.cnf`.

---

## 2. Requirement Verification Matrix

The PASS labels below describe branch-scoped checks. They do not verify deployment wiring, credentialed provider staging, or a G4 release decision.

| Requirement | Scope Description | Verified By | Result |
|---|---|---|---|
| **INT-01** | Dropbox bidirectional sync and conflict-safe project export | `tests/regression/int-01/s12-*.test.ts`, `tests/integration/s12-*.test.ts` | PASS |
| **INT-02** | Google Drive project push/pull and OAuth credential safety | `tests/regression/int-02/s12-*.test.ts` | PASS |
| **INT-03** | Zotero reference library synchronization and bib import | `tests/regression/int-03/s13-*.test.ts`, `tests/integration/s13-*.test.ts` | PASS |
| **INT-04** | Mendeley research spike and documented unsupported status | `docs/test-reports/s13-t02.md`, `tests/regression/int-04/s13-t02.test.ts` | PASS |
| **INT-05** | GitHub OAuth links repository/branch and guards against overwrite | `tests/regression/int-05/s14-t02.test.ts`, `tests/integration/s14-t02.test.ts` | PASS |
| **INT-06** | Authenticated revocable Git HTTP supports real clone/fetch/push | `tests/integration/git-cli.test.ts`, `tests/integration/s14-t08.test.ts`, `tests/regression/int-06/s14-t08.test.ts` | PASS |
| **ACC-04** | Optional Google/GitHub OAuth identity linking and unlinking | `tests/integration/s14-t07.test.ts`, `tests/regression/acc-04/s14-t07.test.ts`, `tests/regression/acc-04/s14-t11.test.ts` | PASS |
| **ACC-06** | TOTP challenge on login, recovery codes, session invalidation | `tests/integration/s14-t11.test.ts`, `tests/regression/acc-06/s14-t07.test.ts`, `tests/regression/acc-06/s14-t11.test.ts` | PASS |
| **PRO-14** | SSRF-safe permitted remote resource import | `tests/integration/s14-t10.test.ts`, `tests/regression/pro-14/s14-t10.test.ts` | PASS |
| **CMP-12** | Profile additional compiler packages and fonts | `tests/integration/s14-t09.test.ts`, `tests/regression/cmp-12/s14-t09.test.ts` | PASS |
| **PL-05** | Walking skeleton and stabilized current-gate release with documented findings | `docs/test-reports/gate-g4-audit.md`, `tests/integration/git-cli.test.ts` | PASS |
| **PL-07** | Optional feature isolation (unsupported integrations visibly disabled, zero dummy data) | `tests/regression/pl-07/s14-t09.test.ts`, `tests/regression/pl-07/s14-t10.test.ts` | PASS |

---

## 3. Shared Quality Gates

| Gate Check | Command | Observed Result | Status |
|---|---|---|---|
| Structural Plan Lint | `python3 scripts/plan_lint.py` | PASS: all tasks, requirements, and sprint matrices consistent | PASS |
| TypeScript Types | `pnpm typecheck` | PASS: zero errors across packages and applications | PASS |
| Linting & Formatting | `pnpm lint` | PASS: clean code conventions and boundary compliance | PASS |
| Git Protocol & CLI | `pnpm exec vitest run tests/integration/git-cli.test.ts tests/integration/s14-t08.test.ts tests/regression/int-06/s14-t08.test.ts --coverage.enabled=false` | PASS (13 tests) | PASS |
| S14 Full Integration Suite | `pnpm exec vitest run tests/integration/s14-*.test.ts --coverage.enabled=false` | PASS (10 files, 47 tests) | PASS |
| Production Build | `pnpm build` | PASS: contracts, db, latex, editor, api, jobs, tex-executor, web build cleanly | PASS |

---

## 4. Release Decision & Open Boundary

1. **Gate 4 Sign-Off**: Pending credentialed staging evidence and independent co-maintainer review. The scoped branch checks above are not a release approval; see [the S13/S14 merge report](merge-s13-s14.md).
2. **Next Milestone**: Sprint 15 (`sprint-15-public-hardening`) and Gate 5 (Public Hardening, Rate Limiting, Audit Logging & Trusted Execution Isolation).
3. **Public Mode Guard**: `PUBLIC_SIGNUP_ENABLED=false` and `UNTRUSTED_COMPILE_ENABLED=false` remain strictly enforced until Gate 5 isolation verification.
