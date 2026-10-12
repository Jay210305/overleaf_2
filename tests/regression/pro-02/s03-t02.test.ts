import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("PRO-02 regression: Create blank, minimal example and template projects (S03-T02)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const response = await fixture.login(email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("creates a blank project with standard LaTeX skeleton", async () => {
    const s = await getSession(user.email);
    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s.cookie, "x-csrf-token": s.csrf },
      payload: { title: `Blank LaTeX ${randomUUID()}` },
    });
    expect(res.statusCode).toBe(201);
    const proj = res.json();
    expect(proj.compiler).toBe("pdflatex");
    expect(proj.mainFileId).not.toBeNull();
  });

  it("instantiates an internal-template project preserving structure", async () => {
    const s = await getSession(user.email);
    // Create template
    const tplRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s.cookie, "x-csrf-token": s.csrf },
      payload: { title: `Template ${randomUUID()}`, compiler: "xelatex" },
    });
    const tpl = tplRes.json();

    // Create from template
    const fromTplRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: s.cookie, "x-csrf-token": s.csrf },
      payload: { title: `Derived ${randomUUID()}`, templateId: tpl.id },
    });
    expect(fromTplRes.statusCode).toBe(201);
    const derived = fromTplRes.json();
    expect(derived.compiler).toBe("xelatex");
    expect(derived.id).not.toBe(tpl.id);
  });
});
