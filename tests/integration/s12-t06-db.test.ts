import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { RevisionsRepository } from "@latex-collab/db";
import { createServer } from "../../apps/api/src/server.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
let app: ReturnType<typeof createServer>;
let projectId: string;
let revisionId: string;
let cookie: string;
let csrf: string;

beforeAll(async () => {
  fixture = await createSessionFixture();
  await fixture.db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(80816)");
    await tx.query(
      readFileSync(
        resolve(import.meta.dirname, "../../packages/db/migrations/0016-revision-export-links.sql"),
        "utf8",
      ),
    );
  });
  const owner = await fixture.seed();
  const login = await fixture.login(owner.email);
  cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  csrf = String(login.headers["x-csrf-token"]);
  const project = await createProject(fixture.db, owner.id, {
    title: "Frozen export link",
    compiler: "pdflatex",
  });
  projectId = project.id;
  const revision = await new RevisionsRepository(fixture.db).createStructuralRevision({
    projectId,
    authorId: owner.id,
    source: "manual",
    label: "T06 export",
  });
  revisionId = revision.id;
  app = createServer({
    checkReadiness: async () => true,
    db: fixture.db,
    origin,
    logger: false,
    storage: {} as never,
  });
});
afterAll(async () => {
  if (app) await app.close();
  if (fixture) await fixture.close();
});

it("persists a source link, serves exact frozen ZIP with current authorization, and expires it", async () => {
  const headers = { origin, cookie, "x-csrf-token": csrf };
  const created = await app.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/revisions/${revisionId}/exports/links`,
    headers,
    payload: { kind: "source" },
  });
  expect(created.statusCode).toBe(201);
  const { id, url } = created.json() as { id: string; url: string };
  const read = await app.inject({ method: "GET", url, headers: { origin, cookie } });
  expect(read.statusCode).toBe(200);
  expect(read.headers["content-type"]).toContain("application/zip");
  expect(read.rawPayload.subarray(0, 2).toString()).toBe("PK");
  const stranger = await fixture.seed();
  const strangerLogin = await fixture.login(stranger.email);
  const strangerCookie = String(strangerLogin.headers["set-cookie"]).split(";")[0]!;
  expect(
    (await app.inject({ method: "GET", url, headers: { origin, cookie: strangerCookie } }))
      .statusCode,
  ).toBe(404);
  await fixture.db.query(
    "UPDATE revision_export_links SET expires_at = now() - interval '1 second' WHERE id = $1",
    [id],
  );
  expect((await app.inject({ method: "GET", url, headers: { origin, cookie } })).statusCode).toBe(
    410,
  );
});
