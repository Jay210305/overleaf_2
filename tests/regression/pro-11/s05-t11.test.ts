import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

loadEnvFile(".env");

/**
 * S05-T11 PRO-11 slice: catalogue detail carries the same versioned manifest
 * as the list, with source contents any authenticated session may preview.
 */
describe("S05-T11 PRO-11 detail matches the versioned catalogue", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let cookie: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: false,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  it("returns identical manifests from list and detail", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/templates",
      headers: { origin, cookie },
    });
    const listed = list.json<{
      templates: Array<{ id: string; manifestHash: string; files: unknown[] }>;
    }>().templates;
    for (const template of listed) {
      const detail = await app.inject({
        method: "GET",
        url: `/api/v1/templates/${template.id}`,
        headers: { origin, cookie },
      });
      expect(detail.statusCode).toBe(200);
      const body = detail.json<{ manifestHash: string; files: unknown[] }>();
      expect(body.manifestHash).toBe(template.manifestHash);
      expect(body.files).toEqual(template.files);
    }
  });
});
