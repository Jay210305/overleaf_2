# Production ZIP upload diagnosis — 2026-10-19

Scope: deployed S05-T01/S05-T02 upload transport used by the dashboard ZIP importer.
Checkout: clean `main` at `3f3a755` before this documentation/configuration change.
This is deployment troubleshooting, not a new sprint or a task-status change.
Actual effort was not measured.

## Finding

The importer extracts the ZIP in the browser, creates folders through the API,
requests an authorized presigned URL for each file, PUTs bytes directly to storage,
and completes the upload through the API. The screenshot's per-file `Failed to fetch`
is consistent with the storage transfer being blocked by the browser.

Read-only Railway configuration inspection confirmed that `latex-api` uses Cloudflare
R2 bucket `latex-collab-prod`, not a Railway Bucket. The deployed application origin
is `https://latex-editor-do7.pages.dev`. The API already allows both deployed Pages
origins; its CORS configuration does not configure R2.

A live OPTIONS request to the configured R2 endpoint and bucket, with Origin
`https://latex-editor-do7.pages.dev`, requested method PUT and header `content-type`,
returned HTTP 403, no `Access-Control-Allow-Origin`, and:

```xml
<Error><Code>Unauthorized</Code><Message>CORS not configured for this bucket</Message></Error>
```

This reproduces a concrete production configuration failure without uploading
project contents or exposing signed URLs or credentials.

## Prepared correction

[`infra/cloudflare/r2-cors.json`](../../infra/cloudflare/r2-cors.json) contains the
Cloudflare dashboard policy for PUT with Content-Type from the two deployed Pages
origins. It grants no public object access; presigned URLs and API completion
authorization remain required. No wildcard origins or additional operations are
needed by this importer.

Apply through Cloudflare Dashboard → R2 Object Storage → `latex-collab-prod` →
Settings → CORS Policy → Add CORS policy → JSON → paste the file → Save.
This is the dashboard format, not Wrangler's `rules` configuration format.

## Verification and blocker

| Check | Actual result |
|---|---|
| `git status --short`, branch, recent log and remote branch inspection | Clean `main` before changes; existing S05 branch inspected |
| `railway status --json` with network access | Production API deployment SUCCESS |
| Filtered `railway variables --service latex-api --json` | R2 endpoint/bucket and Pages origins confirmed; credentials never printed or saved |
| Live R2 OPTIONS with PUT / content-type from deployed origin | FAIL: HTTP 403, CORS not configured |
| S3 SDK `GetBucketCorsCommand` with existing API credentials held in memory | BLOCKED: AccessDenied, HTTP 403 |
| Apply production CORS policy | NOT_RUN: no available Cloudflare management session/credential; existing object credentials cannot read bucket CORS |
| Browser retry of the user's ZIP | NOT_RUN: policy application and authenticated browser session required |
| `git diff --check` | PASS |
| `pnpm exec prettier --check infra/cloudflare/r2-cors.json` | PASS |
| Node JSON assertions for exact origins, PUT only and Content-Type only | PASS |
| `python scripts/plan_lint.py` | PASS: 184 tasks, 93 requirements, 16 stages; original sources unchanged |
| Application unit/integration/build checks | NOT_RUN: application code is unchanged |

After applying, repeat the OPTIONS request for each allowed origin. Expect success
with the matching `Access-Control-Allow-Origin`, PUT allowed and content-type allowed.
A foreign origin must not receive an allow-origin header. Then retry ZIP import in
the deployed app and verify uploaded files and contents. The importer's current
failure flow may have created a project containing folders only; inspect those
projects before deciding whether to remove them.

Root cause is confirmed; production resolution remains pending under GAP-41.
Official reference: [Cloudflare R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/).
