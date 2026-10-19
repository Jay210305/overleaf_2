# Hosted account email

The API and trusted invitation operator use the same transport selection:
`RESEND_API_KEY` selects Resend's HTTPS API; otherwise `SMTP_URL` selects SMTP.
Both require `EMAIL_FROM`. Missing email configuration leaves API email operations
unavailable and makes the operator exit unsuccessfully. Provider errors do not
fall back to another transport or print tokens, keys or response bodies.

## Railway Hobby and the first account

Railway Hobby blocks outbound SMTP. Set these server variables on `latex-api`:

```text
RESEND_API_KEY=<private Resend sending key>
EMAIL_FROM=onboarding@resend.dev
APP_ORIGIN=https://<actual-frontend-host>
```

Use the actual frontend origin, without a path or trailing slash. The origin is
used for emailed registration, verification and password-reset links. Keep the
key out of browser variables and Git. Existing SMTP settings can remain for
local development; Resend wins when both transports are configured.

Resend's test sender can send only to the email associated with the Resend
account. Verify a domain you own before sending invitations to other people.
The Railway-provided hostname does not grant control over the domain's email DNS.

Deploy the code containing HTTPS support and the staged variable changes. Once
the new deployment is healthy, execute from the linked project's terminal:

```sh
railway ssh --service latex-api -- node apps/api/dist/operator/invite-trusted.js "your-email@example.com" "Your Name"
```

Success prints `Trusted registration invitation sent.` Open the emailed link,
register with that exact email, then use the separate verification email and
sign in. Invites expire after 24 hours. Reissuing an invitation replaces the
previous unused invitation. An already registered account cannot be invited
again; use sign-in or password recovery instead.

Do not run integration fixtures or seeds against production. Local simulated
transport tests do not establish real provider delivery or inbox receipt.

## Provider references

- [Railway outbound email restrictions](https://docs.railway.com/networking/outbound-networking)
- [Resend send email API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend test-domain recipient restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
