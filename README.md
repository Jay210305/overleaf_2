# LaTeX Workspace

Collaborative LaTeX editor maintained by Julio and the Project Co-owner.
S00 supplies a React/Vite shell, Fastify health API, private local services and
repeatable quality checks. Project editing, accounts, collaboration and TeX
compilation are later stages and are explicitly unavailable in the UI.

## Clean local start

Install Node **24.21.0** (see `.node-version`), pnpm **11.25.0**, Python 3 and
Docker with Compose. Use your Node manager to select the pinned runtime first;
confirm `node --version` and `pnpm --version` before continuing.

```sh
pnpm install --frozen-lockfile
pnpm env:init
pnpm infra:up
pnpm dev
```

Open `http://127.0.0.1:5173`. The Connection section must say **Service ready**.
The API exposes `/api/v1/health/live` and `/api/v1/health/ready` on port 3000.
In a second terminal, `pnpm smoke` checks the real browser entry and API.
`pnpm dev` stops both applications when interrupted or when one exits.

`env:init` creates private random development credentials and preserves an existing
`.env`. Do not commit it. Bindings are loopback-only: PostgreSQL 55432, Redis 56379,
MinIO 59000/59001, Mailpit 58025/51025. The default ports must be free. Applications
must use `127.0.0.1` consistently with the allowed browser origin.

MinIO's public image is unavailable upstream. Its local image is built from a
fixed official source revision; the first build needs network access and takes
several minutes. See [development image provenance](infra/minio/README.md).
`infra:up` creates a private bucket after all four services are healthy.

## Verify S00

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm security:check
pnpm artifacts:check
pnpm exec playwright install chromium firefox msedge
pnpm test:e2e
python scripts/plan_lint.py
python scripts/build_icm_map.py --check
```

`pnpm test` covers deterministic unit/component/API/boundary fixtures; its four
critical config/error/health modules require at least 80% coverage.
`test:integration` requires running PostgreSQL, Redis, MinIO and Mailpit.
Browser tests require those services too and start/stop their own browser/API
servers; do not run `pnpm dev` at the same time. They intentionally stop and
restart this project's Redis fixture, so do not run against shared production data.

Browser installation may need OS packages. CI uses supported Ubuntu with
`playwright install --with-deps`. On systems where a user-local Edge executable
is available, set `EDGE_EXECUTABLE_PATH` to its absolute path; otherwise Playwright
uses the installed `msedge` channel. Chromium and Firefox use Playwright builds.

## Stop and recover

Stop applications with Ctrl+C, then run `pnpm infra:down`. Named data volumes are
preserved. Restart with `pnpm infra:up`; `env:init` will not change credentials.
Keep `.env` with those volumes: changing its database password does not rotate
an existing PostgreSQL volume. No reset or volume-deletion command is automated.
Readiness returns 503 on dependency failure while liveness remains 200; the UI
shows unavailability and recovers after retry. Missing/invalid configuration
fails API startup without printing values. Public signup and untrusted compile
flags must remain false; no compile endpoint exists in S00.

Database migration/seed, authentication, durable editing and the compiler are
not implemented in S00. Their commands must be added by their owning tasks.

## Plan and evidence

Read the [master plan](PLAN_IMPLEMENTACION_EDITOR_LATEX_COLABORATIVO.md),
[English planning package](docs/planning/README.md), [task index](implementation/README.md)
and [agent rules](AGENTS.md). Follow one sprint branch at a time; S00 uses
`feature/sprint-00`, future branches include their number and topic.

[S00 progress](docs/progress/sprint-00.md) and its linked reports distinguish
implemented behavior, actual checks and outstanding maintainer review.
Both original planning source documents remain preserved.
