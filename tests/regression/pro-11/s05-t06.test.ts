import { loadEnvFile } from "node:process";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

loadEnvFile(".env");

/**
 * S05-T06 PRO-11 slice: the catalogue is versioned, filterable and carries
 * file-level preview manifests with verifiable hashes.
 */
describe("S05-T06 PRO-11 versioned template catalogue", () => {
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

  it("serves stable versions with verifiable file manifests", async () => {
    const first = await app.inject({
      method: "GET",
      url: "/api/v1/templates",
      headers: { origin, cookie },
    });
    expect(first.statusCode).toBe(200);
    const listed = first.json<{
      templates: Array<{
        id: string;
        version: string;
        manifestHash: string;
        files: Array<{ path: string; sha256: string; sizeBytes: number; mime: string }>;
      }>;
    }>().templates;
    expect(listed).toHaveLength(2);
    for (const template of listed) {
      expect(template.version).toMatch(/^\d+\.\d+\.\d+$/);
      const recomputed = createHash("sha256")
        .update(
          JSON.stringify(template.files.map((file) => [file.path, file.sha256, file.sizeBytes])),
          "utf8",
        )
        .digest("hex");
      expect(template.manifestHash).toBe(recomputed);
    }
    const thesis = listed.find((template) => template.id === "thesis-outline")!;
    expect(thesis.files.map((file) => file.path).sort()).toEqual([
      "chapters/intro.tex",
      "main.tex",
      "refs.bib",
    ]);
    const second = await app.inject({
      method: "GET",
      url: "/api/v1/templates",
      headers: { origin, cookie },
    });
    expect(second.json()).toEqual(first.json());
  });
});
