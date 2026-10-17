import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearUserConsents } from "../../../apps/api/src/modules/assistance/routes.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression INT-09 (S14-T06): Mandatory opt-in consent for writing assistance", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let project: { id: string };
  let cookie: string;
  let csrfToken: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status)
       VALUES ('INT-09 Consent Project', $1, 'pdflatex', 'active')
       RETURNING id`,
      [user.id],
    );
    project = { id: projRes.rows[0]!.id };

    const loginRes = await fixture.login(user.email, "correct-password-123");
    cookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    csrfToken = String(loginRes.headers["x-csrf-token"]);

    clearUserConsents();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("requires explicit opt-in consent before any text is processed", async () => {
    // 1. Initial consent status check
    const statusRes = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/assistance/consent",
      headers: { origin, cookie },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().consentGranted).toBe(false);

    // 2. Request without consent is rejected
    const reqRes1 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/assistance`,
      headers: { origin, cookie, "x-csrf-token": csrfToken },
      payload: {
        projectId: project.id,
        fragment: "Manuscript text snippet",
        mode: "grammar",
        optInConsent: false,
      },
    });
    expect(reqRes1.statusCode).toBe(403);
    expect(reqRes1.json().code).toBe("AI_CONSENT_REQUIRED");

    // 3. User grants consent
    const optInRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/assistance/consent",
      headers: { origin, cookie, "x-csrf-token": csrfToken },
      payload: { consentGranted: true },
    });
    expect(optInRes.statusCode).toBe(200);
    expect(optInRes.json().consentGranted).toBe(true);

    // 4. Request with consent succeeds
    const reqRes2 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/assistance`,
      headers: { origin, cookie, "x-csrf-token": csrfToken },
      payload: {
        projectId: project.id,
        fragment: "Manuscript text snippet",
        mode: "rephrase",
        optInConsent: true,
      },
    });
    expect(reqRes2.statusCode).toBe(200);
    expect(reqRes2.json().ok).toBe(true);

    // 5. User revokes consent
    const optOutRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/assistance/consent",
      headers: { origin, cookie, "x-csrf-token": csrfToken },
      payload: { consentGranted: false },
    });
    expect(optOutRes.statusCode).toBe(200);
    expect(optOutRes.json().consentGranted).toBe(false);

    // 6. Request after revocation is immediately blocked
    const reqRes3 = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/assistance`,
      headers: { origin, cookie, "x-csrf-token": csrfToken },
      payload: {
        projectId: project.id,
        fragment: "Manuscript text snippet",
        mode: "grammar",
        optInConsent: true, // Even if payload claims consent, server-side consent state is checked!
      },
    });
    expect(reqRes3.statusCode).toBe(403);
    expect(reqRes3.json().code).toBe("AI_CONSENT_REQUIRED");
  });
});
