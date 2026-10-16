import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

loadEnvFile(".env");

/**
 * S05-T06 PRO-02 slice: template instantiation is a real project-creation
 * path with editable canonical text and no copied authorization.
 */
describe("S05-T06 PRO-02 template instantiation creates projects", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let cookie: string;
  let csrf: string;
  let actorId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    const owner = await fixture.seed();
    actorId = owner.id;
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

  it("creates an owned project with replayable main.tex", async () => {
    const title = `PRO-02 template ${randomUUID()}`;
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/templates/minimal-article/instantiate",
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { title },
    });
    expect(response.statusCode).toBe(201);
    const created = response.json<{ id: string; mainFileId: string }>();
    const project = await fixture.db.query<{ owner_id: string; title: string; status: string }>(
      "SELECT owner_id, title, status FROM projects WHERE id = $1",
      [created.id],
    );
    expect(project.rows[0]).toMatchObject({ owner_id: actorId, title, status: "active" });
    const updates = await fixture.db.query<{ payload_bytes: Buffer }>(
      "SELECT payload_bytes FROM crdt_updates WHERE file_id = $1 ORDER BY seq ASC",
      [created.mainFileId],
    );
    const doc = new Y.Doc();
    for (const row of updates.rows) Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
    expect(doc.getText("content").toString()).toContain("\\maketitle");
    doc.destroy();
    const members = await fixture.db.query("SELECT * FROM project_members WHERE project_id = $1", [
      created.id,
    ]);
    expect(members.rows).toHaveLength(0);
  });
});
