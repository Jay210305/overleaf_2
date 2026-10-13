# S05-T02 Multi-file Upload Design

The project workspace needs a keyboard- and pointer-accessible way to add permitted source and binary files. Users can select or drop several files, see progress and individual failures, cancel a transfer, and retry without creating duplicate nodes. The server remains the authority for names, type, quota, project permission and completion.

## Approaches considered

1. **Direct signed PUT with per-file controls (chosen).** Reuse S05-T01 presign/complete endpoints, upload bytes with `XMLHttpRequest` for progress and abort, then refresh the tree after durable completion. This follows the existing storage boundary and needs a local CORS policy.
2. Proxy bytes through the API. This could simplify browser CORS but adds a second upload path and duplicates the existing verification boundary.
3. One batch request. This would make progress and per-file retry difficult and would require a new server transaction/endpoint.

## UI and state

`FileUploader` sits above the existing workspace file tree. A labeled multi-file input is the keyboard path; a drop target offers the same action for pointer users. Each row has filename, status, progress, a cancel button while transferring, and a retry button on failure. Errors stay attached to their file. Successful completion calls back to refresh the tree. The browser never inserts a file node optimistically.

Files run sequentially so concurrent selections cannot race on the same name or quota. A per-file state stores the file, SHA-256, signed upload ID/URL/expiry, and a stable completion idempotency key. If completion or PUT outcome is uncertain, retry first calls completion with the same upload ID and key. If the API confirms the object is absent or the intent expired, the browser can request a new presign; the server's sibling collision check prevents a second node. Canceled transfers abort XHR and leave staging for the private cleanup job.

## Browser/server boundary

The browser checks obvious invalid names, extension/MIME pairs and 25 MiB size before presign for immediate feedback; the API repeats all validation. It computes SHA-256 with Web Crypto, presigns with cookie and CSRF, sends a PUT directly to the signed URL with XHR (without cookies), then completes with cookie, CSRF and a stable idempotency key. The signed URL is never logged or rendered. API problem status maps to useful per-file messages. A 201 completion is the only success state.

Local MinIO needs `MINIO_API_CORS_ALLOW_ORIGIN` set to the exact configured `APP_ORIGIN`, with no wildcard origin. The pinned MinIO returned HTTP 501 for bucket CORS configuration, so its global origin setting is the supported local boundary; the presigned URL itself authorizes only PUT. Hosted storage must use an equivalent exact-origin CORS policy at deployment. No browser secret or broad object permission is added.

## Verification

Test multi-selection, progress, cancel, retry and failure messages with browser component assertions; exercise the signed PUT CORS preflight and upload against local MinIO; verify completion refreshes real project nodes without duplicates. Run scoped integration/regression checks, axe and keyboard checks where available, then the shared quality gates. S05-T09 and S05-T01 reviews remain prerequisites to `done`.
