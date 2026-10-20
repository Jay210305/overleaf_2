# Local ZIP import verification — 2026-10-19

Scope: reproduce the dashboard ZIP upload failure with the archive supplied at the
repository root. Checkout: `main` at `3f3a755`. Existing production CORS changes
were preserved. This is troubleshooting of accepted S05 behavior, not a new sprint
or a task-status change. Actual effort was not measured.

## Result

`Plan_de_Tesis__Dynamic_Queue_Drain_Rate_.zip` imports successfully through the real
local dashboard in Microsoft Edge. All 13 supported files were uploaded through
presign, MinIO PUT and API completion. The stored project has the expected paths
and file count. Text was read back from canonical Yjs state and binaries through
the authorized download endpoint; all 13 SHA-256 hashes match the browser
importer's extracted bytes. The workspace reopens after page reload.

The archive has 15 entries: seven `.tex`, one `.bib`, five `.png` and two `.pngng`.
The two `.pngng` entries are unsupported and skipped by the existing extension
policy. Archive source, signed URLs, credentials and screenshots were not added
to Git or this report. The original archive remains an untracked user file.

Verification project: `6227186a-bbe6-4eed-8283-b37d48205de9`, titled
`Plan de Tesis Dynamic Queue Drain Rate - Local ZIP verification`, owned by the
local shared E2E account. The user explicitly chose to keep this as a test import.
A preliminary run also created a project with this title; no existing projects
were deleted. That run reached the workspace but a subsequent harness API read
returned 403 because it omitted the required Origin header. Supplying the
configured Origin resolved the harness error without application changes.

## Environment and checks

Windows, Node `24.20.0`, pnpm `11.25.0`, real local PostgreSQL, Redis, MinIO and
Mailpit. Web/API started with `pnpm exec tsx scripts/dev.ts` after workspace builds
in `pnpm dev`. Installed Node differs from pinned `24.21.0`; no runtime replacement
was performed. Initial sandbox loopback EACCES was resolved by rerunning local
service checks and the browser test with approved access.

| Check | Observed result |
|---|---|
| `docker compose --env-file .env -f infra/docker-compose.yml ps` | All four local services healthy |
| Local MinIO OPTIONS with configured Origin, PUT and content-type | HTTP 204; exact `http://127.0.0.1:5173` allow-origin, PUT and content-type allowed |
| `pnpm exec tsx .tmp/verify-local-zip.ts` | PASS on final run: real dashboard import, 13 file hashes and workspace reload; temporary local harness, not a committed dependency |
| `pnpm exec vitest run --coverage.enabled false tests/integration/zip-project.test.ts tests/regression/pro-05/s05-t02.test.ts` | PASS: 2 files, 11 tests, including allowed/foreign-origin local MinIO preflight |
| `git diff --check`; `python scripts/plan_lint.py` | PASS; planning lint checks 184 tasks, 93 requirements and 16 stages, with original sources unchanged |
| Production deployment or R2 policy mutation | NOT_RUN: outside this local verification |
| TeX compilation | NOT_RUN: this check covers ZIP upload and persistence |
| Full test suite, lint, typecheck and production build | NOT_RUN: application code and configuration are unchanged |

## Conclusion

No local application or storage configuration fix was necessary: the reported
per-file fetch failure does not reproduce against configured local MinIO. This
does not resolve the separately documented production R2 CORS failure. GAP-41
and the prepared production policy remain as documented in
[the production diagnosis](production-zip-upload-cors.md).
