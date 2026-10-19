# Hosted email maintenance — 2026-10-18

Scope: S02 account-email transport and the existing S08 invitation sender.
Initial checkout: `main`, base `50699ff`; initially clean. Before deployment,
fetched contributor commits through `3c9d6e4` and integrated the fix on
`codex/fix-resend-email`, based on that commit. The initial fix is retained in
the recoverable `codex-resend-maintenance-before-main-update` stash. This is maintenance of existing
completed slices, not a new sprint. No schema, registration policy, release gate
or task status changed. Actual effort was not measured. Co-maintainer review is
pending.

The production operator reached the container but returned its generic failure.
The user's SMTP connection probe returned `ESOCKET`; the user has Railway Hobby
and no configured SMTP provider credentials. Railway documents SMTP as available
only on Pro and above. Resend HTTPS support therefore addresses the hosted
transport requirement; the production database and actual delivery have not
been independently verified in this session.

Changes: `packages/config/src/server.ts` accepts the server-only Resend key;
`apps/api/src/modules/auth/mail.ts` shares the existing link templates across
SMTP and HTTPS; `apps/api/src/main.ts` and the trusted invitation operator select
that transport. HTTP redirects are refused, requests time out after 10 seconds,
and raw network errors/provider response bodies are not surfaced. No new
dependency was installed. Existing SMTP entry points remain available for local
Mailpit tests. Configuration and rollout are in [hosted email](../operations/hosted-email.md).

Verification on Windows with the installed workspace tools:

- Before implementation: `pnpm exec vitest run tests/unit/auth-mail.test.ts --coverage.enabled=false`
  failed all four tests because the shared sender factory did not exist.
- After implementation: `pnpm exec vitest run tests/unit/auth-mail.test.ts tests/integration/s00-t07.test.ts --coverage.enabled=false`
  passed 2 files / 13 tests. These use simulated HTTPS acceptance, provider
  rejection and network failure; they check four link flows, transport
  precedence, missing settings and safe config errors. They do not send email.
- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `pnpm build` passed for the workspace, including the compiled API/operator;
  Vite emitted its existing large-chunk warning.
- `git diff --check` passed.

Production
deployment, real Resend delivery, PostgreSQL-backed registration and browser
verification have not been run. The user's production key was not read.
Full unit/integration/browser gates were not run for this transport-only slice.

Next: review, deploy the code and `EMAIL_FROM=onboarding@resend.dev`, issue the
invite for the Resend account email, verify inbox receipt, register, verify the
email and sign in. Other recipients require a verified sender domain.

## Deployment continuation

The user explicitly authorized production deployment with their co-maintainer.
Read-only SSH inspection found the deployed operator still using SMTP. GitHub
main had newer contributor work; it was fetched and preserved before deployment.
Integration retains the new HTML email templates, SMTP timeouts, cookie/session
changes and frontend. The email sender now propagates delivery failure instead
of logging secrets or reporting success, and the operator no longer prints raw
invitation tokens. No account verification was bypassed.

Production checks printed only booleans and the requested account's state:
Resend key present, test sender configured, public signup false, valid operator
configuration, account not yet registered/verified/disabled. No secret was read
into chat. After integration, 16 focused tests, typecheck and lint passed.
Build and deployment results follow after completion.

The integrated workspace build passed (Vite large-chunk warning only), and the
source/build secret scan passed. Local Mailpit integration was attempted:
all five tests were blocked by localhost SMTP access in the sandbox (`EACCES`),
then failed with `ECONNREFUSED` outside the sandbox because Mailpit was not
running on `127.0.0.1:51025`. No SMTP integration PASS is claimed.

Uploaded the integrated code to the explicitly authorized existing production
`latex-api` service using `railway up --service latex-api --environment production --detach`.
Deployment ID: `ce1649f2-fa18-4838-a9f3-52e124d0c8ba`. No GitHub merge or push was
performed; future GitHub-driven redeployments need this source change integrated.

Deployment outcome: Railway reported `SUCCESS` for the deployment above. An SSH
check imported the deployed `createEmailSenders` factory and confirmed both
`/api/v1/health/live` and `/api/v1/health/ready` returned HTTP 200. The production
trusted invitation command for the explicitly requested recipient exited 0 and
printed `Trusted registration invitation sent.` This establishes provider
acceptance, not inbox receipt. The command regenerated the account's one-use
invitation, replacing previous unused invitations. Registration, password choice
and email verification are left to the user through the newest email link.
