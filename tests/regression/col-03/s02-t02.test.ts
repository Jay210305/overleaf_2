import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("COL-03 S02-T02 session identity boundary", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  beforeAll(async () => {
    fixture = await createSessionFixture();
  });
  afterAll(async () => {
    await fixture.close();
  });

  it("resolves only the authenticated account for each opaque cookie", async () => {
    const owner = await fixture.seed();
    const foreign = await fixture.seed();
    const ownerLogin = await fixture.login(owner.email);
    const foreignLogin = await fixture.login(foreign.email);
    const ownerCookie = String(ownerLogin.headers["set-cookie"]).split(";")[0]!;
    const foreignCookie = String(foreignLogin.headers["set-cookie"]).split(";")[0]!;
    const ownerSession = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: ownerCookie, origin },
    });
    const foreignSession = await fixture.app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: { cookie: foreignCookie, origin },
    });
    expect(ownerSession.json()).toMatchObject({ id: owner.id, email: owner.email });
    expect(foreignSession.json()).toMatchObject({ id: foreign.id, email: foreign.email });
    expect(ownerSession.json()).not.toHaveProperty("passwordHash");
    expect(ownerSession.json()).not.toHaveProperty("tokenHash");
  });
});
