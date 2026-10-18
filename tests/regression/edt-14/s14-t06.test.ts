import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MockWritingAssistantProvider } from "@latex-collab/contracts";
import {
  checkAndConsumeQuota,
  clearUserConsents,
  resetUserQuota,
  setAssistanceProvider,
} from "../../../apps/api/src/modules/assistance/routes.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression EDT-14 (S14-T06): Static command/error help first, non-blocking fallback, and quota management", () => {
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
       VALUES ('EDT-14 Static Help Project', $1, 'pdflatex', 'active')
       RETURNING id`,
      [user.id],
    );
    project = { id: projRes.rows[0]!.id };

    const loginRes = await fixture.login(user.email, "correct-password-123");
    cookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    csrfToken = String(loginRes.headers["x-csrf-token"]);

    clearUserConsents();
    await fixture.app.inject({
      method: "POST",
      url: "/api/v1/assistance/consent",
      headers: { origin, cookie, "x-csrf-token": csrfToken },
      payload: { consentGranted: true },
    });
    resetUserQuota(user.id);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("serves static LaTeX help definitions offline without external calls", async () => {
    const res = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/assistance/static-help",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.helpEntries).toBeDefined();
    expect(body.helpEntries["Undefined control sequence"]).toContain("unrecognized macro");
    expect(body.helpEntries["Missing $ inserted"]).toContain("math symbol");
  });

  it("preserves editor use by returning static fallback when provider fails", async () => {
    try {
      setAssistanceProvider(new MockWritingAssistantProvider(true)); // Simulates disconnected/failing backend

      const res = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${project.id}/assistance`,
        headers: { origin, cookie, "x-csrf-token": csrfToken },
        payload: {
          projectId: project.id,
          fragment: "\\textbf{Hello World}",
          mode: "explain_error",
          optInConsent: true,
        },
      });

      // Does not throw 500 or crash; returns structured fallback
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ok).toBe(false);
      expect(body.fallbackAvailable).toBe(true);
      expect(body.staticHelp).toBeDefined();
    } finally {
      setAssistanceProvider(null);
    }
  });

  it("enforces bounded quota to protect resource consumption", () => {
    const testUserId = "user-quota-test";
    resetUserQuota(testUserId);

    // Consume up to 50 requests
    for (let i = 0; i < 50; i++) {
      const q = checkAndConsumeQuota(testUserId);
      expect(q.allowed).toBe(true);
    }

    // 51st request should be rejected
    const blocked = checkAndConsumeQuota(testUserId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    // Reset allows requests again
    resetUserQuota(testUserId);
    const afterReset = checkAndConsumeQuota(testUserId);
    expect(afterReset.allowed).toBe(true);
  });
});
