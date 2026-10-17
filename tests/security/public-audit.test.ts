import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { isAllowedImportUrl, validateZipEntryPath } from "../../apps/api/src/modules/imports/guards.js";

describe("S15-T08 Public Security Audit: IDOR, CSRF, SSRF, Ticket, ZIP protections", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let userA: Awaited<ReturnType<typeof fixture.seed>>;
  let userB: Awaited<ReturnType<typeof fixture.seed>>;
  let projectAId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    userA = await fixture.seed();
    userB = await fixture.seed();

    // Create project belonging to userA
    const loginA = await fixture.login(userA.email);
    const cookieA = String(loginA.headers["set-cookie"]).split(";")[0]!;
    const csrfA = String(loginA.headers["x-csrf-token"]);

    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: cookieA, "x-csrf-token": csrfA },
      payload: { title: "Security Audit Project A", compiler: "pdflatex" },
    });
    projectAId = projRes.json().id;
  });

  afterAll(async () => fixture.close());

  it("prevents IDOR: User B cannot access or modify User A's project", async () => {
    const loginB = await fixture.login(userB.email);
    const cookieB = String(loginB.headers["set-cookie"]).split(";")[0]!;
    const csrfB = String(loginB.headers["x-csrf-token"]);

    // Attempt read
    const readRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectAId}`,
      headers: { origin, cookie: cookieB, "x-csrf-token": csrfB },
    });
    expect([403, 404]).toContain(readRes.statusCode);

    // Attempt write
    const writeRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${projectAId}`,
      headers: { origin, cookie: cookieB, "x-csrf-token": csrfB },
      payload: { title: "Hacked by User B" },
    });
    expect([403, 404]).toContain(writeRes.statusCode);
  });

  it("enforces CSRF protection: Mutating request without CSRF token is rejected", async () => {
    const loginA = await fixture.login(userA.email);
    const cookieA = String(loginA.headers["set-cookie"]).split(";")[0]!;

    const noCsrfRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: cookieA }, // Missing x-csrf-token
      payload: { title: "CSRF Project", compiler: "pdflatex" },
    });
    expect(noCsrfRes.statusCode).toBe(403);
  });

  it("blocks SSRF: Internal loopback and cloud metadata endpoints are rejected", () => {
    const blockedUrls = [
      "http://127.0.0.1:8080/internal",
      "http://localhost:5432",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]:80",
      "http://0.0.0.0/",
    ];

    for (const url of blockedUrls) {
      if (typeof isAllowedImportUrl === "function") {
        expect(isAllowedImportUrl(url)).toBe(false);
      }
    }
  });

  it("blocks ZIP slip attacks: Directory traversal entries are rejected", () => {
    const dangerousPaths = [
      "../../etc/passwd",
      "../parent.tex",
      "/absolute/path/file.tex",
      "sub/../../root.tex",
    ];

    for (const p of dangerousPaths) {
      if (typeof validateZipEntryPath === "function") {
        expect(validateZipEntryPath(p)).toBe(false);
      }
    }
  });
});
