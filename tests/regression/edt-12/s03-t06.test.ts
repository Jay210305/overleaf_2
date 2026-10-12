import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("EDT-12 Regression - Compiler engine allowlist, auto-compile and timeout bounding", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession() {
    const response = await fixture.login(owner.email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("EDT-12: permits only allowlisted compiler engines and rejects arbitrary commands", async () => {
    const session = await getSession();

    const pRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `EDT-12 Compiler Test ${randomUUID()}` },
    });
    const project = pRes.json();

    const allowed = ["pdflatex", "xelatex", "lualatex", "latex"];
    for (const compiler of allowed) {
      const res = await fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/settings`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        payload: { compiler },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().compiler).toBe(compiler);
    }

    const disallowed = ["shell", "bash", "python", "rm", ""];
    for (const compiler of disallowed) {
      const res = await fixture.app.inject({
        method: "PATCH",
        url: `/api/v1/projects/${project.id}/settings`,
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
        payload: { compiler },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it("EDT-12: bounds timeout policy to server-enforced limits [5, 120] seconds", async () => {
    const session = await getSession();

    const pRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `EDT-12 Timeout Test ${randomUUID()}` },
    });
    const project = pRes.json();

    // Below minimum (4) -> 400
    const tooLow = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { timeoutSeconds: 4 },
    });
    expect(tooLow.statusCode).toBe(400);

    // Above maximum (121) -> 400
    const tooHigh = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { timeoutSeconds: 121 },
    });
    expect(tooHigh.statusCode).toBe(400);

    // Valid boundaries: 5 and 120
    const valid5 = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { timeoutSeconds: 5, autoCompile: true, texliveImageVersion: "2024.2" },
    });
    expect(valid5.statusCode).toBe(200);
    expect(valid5.json().timeoutSeconds).toBe(5);
    expect(valid5.json().autoCompile).toBe(true);
    expect(valid5.json().texliveImageVersion).toBe("2024.2");

    const valid120 = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { timeoutSeconds: 120 },
    });
    expect(valid120.statusCode).toBe(200);
    expect(valid120.json().timeoutSeconds).toBe(120);
  });
});
