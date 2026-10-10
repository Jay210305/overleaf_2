# Development MinIO image

MinIO Community Edition is source-only and its upstream repository is archived.
The public Docker Hub image and old binary URL were unavailable during S00 verification.
This Dockerfile builds the unmodified official revision `7aac2a2c5b7c`
(`v0.0.0-20260212201848-7aac2a2c5b7c`) with Go, then copies the binary and its
AGPL-3.0 license into a non-root Alpine runtime. Both base images are digest-pinned.

Sources: [official repository](https://github.com/minio/minio),
[license at the pinned revision](https://github.com/minio/minio/blob/7aac2a2c5b7c/LICENSE).
No Overleaf code is used. Keep this dependency separate from application code;
redistribution and any future modifications must retain applicable license/source obligations.

This image is a local development fixture, bound to loopback, with generated credentials.
It is not approved for public storage hosting. First build requires registry/module network
access and takes several minutes. `pnpm infra:down` preserves its named volume.
