# Testing

## Strategy and Pyramid

Use Vitest for pure policy, path sanitization, BibTeX/log analysis, manifest hashing and suggestion logic. Use Fastify inject plus Zod/OpenAPI for request/response contracts; real disposable PostgreSQL/Redis/MinIO for constraints, rollback, jobs and persistence; Testing Library/axe for components; Playwright for browser journeys; real executor fixtures for TeX; k6 and WS drivers for declared load profiles.

Coverage of critical access-policy, file-operation, review-transformation and queue functions must be at least 80%. This threshold comes from the source plan. An 80% line/branch threshold in these modules is a planning decision to operationalize it; expose both in CI and never inflate it with trivial getters. All quality gates are defined once in [CI/CD and Environments](06-ci-cd-and-environments.md).

## Contract and Functional Tests First

Each code sub-task starts with a failing contract or behavior assertion. A producer and consumer use the same schema. Test doubles remain deterministic and have no network access; real integration suites run separately with disposable services. For documentation/configuration tasks, write a failing review check or a reproducible smoke checklist before the change. A planned test file is not a completed test.

## Fixtures

`tests/fixtures/latex-projects/`: simple article, multifile thesis, report with images, BibTeX, Biber, UTF-8/Spanish/RTL, XeLaTeX, LuaLaTeX, invalid source, unknown/nested macros, significant spaces/comments, malicious ZIPs and TeX loops. Use original or permitted content. Development seeds provide at least four role identities, three projects and two templates; no fixed credentials enter production. Each task adds its own positive/negative fixtures at the path listed in its file.

## Journey Registry

[Test Scenarios](test-scenarios.md) preserves E2E-001–E2E-030 in English with target gates. [Traceability](traceability.md) includes a distinct planned regression assertion for every feature/NFR. The [Feature Matrix](../feature-parity.md) begins entirely NOT_STARTED and requires a real run/report to change.

## PDF Verification

Require `%PDF-` magic and successful parsing, expected page count/text for the fixture, expected warning behavior, actual bibliography content, immutable source hash/revision provenance, and old-PDF status after a failed new compile. Check forward/inverse SyncTeX against a known point; proposed tolerance is one text line and 10 PDF points, adjustable only with a documented fixture reason. Do not accept a filename alone as PDF validity.

## Concurrency and Fault Injection

Test two clients on one line, five clients with 1,000 edits each, duplicate/out-of-order updates, file rename/delete during editing, permission revocation on open sockets, Redis outage, DB outage, restart of another replica, offline reconnect and local-only undo. Introduce faults between DB commit, snapshot persistence, Redis publication and ACK. Recovery hashes must match confirmed text exactly; pending local edits remain visibly pending. Compact only verified snapshots and release idle rooms.

## Adversarial Tests

Reject ZIP traversal, bombs, symlinks, unsupported active formats, huge files, cross-project presign requests, forged OAuth state and unsafe remote URLs. A VIEWER's handcrafted WSS update leaves text unchanged. Revoked sockets stop new data access. Executor attempts to read host/other-job files, call metadata endpoints, start processes or exhaust limits cannot escape job policy. API restart leaves no permanently running compile. Public gate requires isolation evidence, not merely these test names.

## Reports

Use `docs/test-reports/<task-id>.md` for command, environment/dataset, assertion, result, output excerpt, actual hours, failures and follow-up. Gate audits use `docs/test-reports/gate-gN-audit.md` with requirement → implementation → test → result and CRITICAL/HIGH/MEDIUM/LOW gaps. PASS requires no critical unresolved gap in the declared scope.
