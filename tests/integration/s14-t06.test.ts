import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockWritingAssistantProvider } from "@latex-collab/contracts";
import {
  clearUserConsents,
  setAssistanceProvider,
} from "../../apps/api/src/modules/assistance/routes.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S14-T06: Optional private writing assistance, opt-in consent, and quota limits", () => {
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
       VALUES ('AI Assistance Project', $1, 'pdflatex', 'active')
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

  it("denies assistance when user has not opted in (403 AI_CONSENT_REQUIRED)", async () => {
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/assistance`,
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrfToken,
      },
      payload: {
        projectId: project.id,
        fragment: "This is teh fragment with typos.",
        mode: "grammar",
        optInConsent: false, // Explicit opt-in missing
      },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code).toBe("AI_CONSENT_REQUIRED");
    expect(body.detail).toContain("Writing assistant requires explicit opt-in consent");
  });

  it("grants assistance when user has opted in and provides suggestion", async () => {
    // 1. Grant opt-in consent
    const consentRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/assistance/consent",
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrfToken,
      },
      payload: { consentGranted: true },
    });
    expect(consentRes.statusCode).toBe(200);
    expect(consentRes.json().consentGranted).toBe(true);

    // 2. Request assistance on fragment
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/assistance`,
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrfToken,
      },
      payload: {
        projectId: project.id,
        fragment: "This is teh document intro.",
        mode: "grammar",
        optInConsent: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.suggestion).toBe("This is the document intro.");
    expect(body.tokensUsed).toBeGreaterThan(0);
    expect(body.remainingQuota).toBeGreaterThanOrEqual(0);
  });

  it("rejects fragments exceeding maximum allowed character limit (400 VALIDATION_ERROR)", async () => {
    const hugeFragment = "A".repeat(4001); // Exceeds 4000 character limit

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/assistance`,
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrfToken,
      },
      payload: {
        projectId: project.id,
        fragment: hugeFragment,
        mode: "grammar",
        optInConsent: true,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
  });

  it("falls back gracefully when provider fails or disconnects without blocking editor", async () => {
    try {
      setAssistanceProvider(new MockWritingAssistantProvider(true)); // will throw error

      const res = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/assistance`,
        headers: {
          origin,
          cookie,
          "x-csrf-token": csrfToken,
        },
      payload: {
        projectId: project.id,
        fragment: "\\textbf{Some text}",
        mode: "explain_error",
        optInConsent: true,
      },
    });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(false);
      expect(body.fallbackAvailable).toBe(true);
      expect(body.staticHelp).toBeDefined();
      expect(body.error).toContain("provider temporarily unavailable");
    } finally {
      setAssistanceProvider(null);
    }
  });
});
