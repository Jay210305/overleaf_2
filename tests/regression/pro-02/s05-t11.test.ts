import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

loadEnvFile(".env");

/**
 * S05-T11 PRO-02 slice: template instantiation from the preview flow yields
 * an independent project whose main file carries the templated source.
 */
describe("S05-T11 PRO-02 preview instantiate creates independent projects", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let csrf: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    csrf = String(login.headers["x-csrf-token"]);
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

  it("creates two independent projects from one template", async () => {
    const ids: string[] = [];
    for (const title of [`Preview A ${randomUUID()}`, `Preview B ${randomUUID()}`]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/templates/minimal-article/instantiate",
        headers: { origin, cookie, "x-csrf-token": csrf },
        payload: { title },
      });
      expect(response.statusCode).toBe(201);
      ids.push(response.json<{ id: string }>().id);
    }
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      const members = await fixture.db.query(
        "SELECT * FROM project_members WHERE project_id = $1",
        [id],
      );
      expect(members.rows).toHaveLength(0);
      const nodes = await fixture.db.query<{ name: string }>(
        "SELECT name FROM project_nodes WHERE project_id = $1",
        [id],
      );
      expect(nodes.rows.map((row) => row.name)).toEqual(["main.tex"]);
    }
  });
});
