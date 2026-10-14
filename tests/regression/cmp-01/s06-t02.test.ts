import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyCompileMigrations } from "../../helpers/compile-migrations.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("CMP-01 Revision manifest binding for compilation (S06-T02)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let projectId: string;
  let session: { cookie: string; csrf: string };
  let revisionsRepo: RevisionsRepository;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyCompileMigrations(fixture.db);
    revisionsRepo = new RevisionsRepository(fixture.db);

    user = await fixture.seed();
    const loginRes = await fixture.login(user.email);
    session = {
      cookie: String(loginRes.headers["set-cookie"]).split(";")[0]!,
      csrf: String(loginRes.headers["x-csrf-token"]),
    };

    const projRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
      },
      payload: {
        title: `CMP-01 Test ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    projectId = projRes.json().id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("produces an immutable revision manifest containing main.tex item ready for compilation", async () => {
    const key = `cmp-01-key-${randomUUID()}`;

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": key,
      },
      payload: { compiler: "pdflatex" },
    });

    expect(res.statusCode).toBe(202);
    const job = res.json();

    const revRes = await fixture.db.query<{
      id: string;
      revision_no: number;
    }>(`SELECT id, revision_no FROM project_revisions WHERE id = $1`, [job.sourceRevisionId]);
    expect(revRes.rows.length).toBe(1);

    const revision = await revisionsRepo.getRevision(
      projectId,
      Number(revRes.rows[0]!.revision_no),
    );
    expect(revision).not.toBeNull();
    expect(revision?.manifest.compiler).toBe("pdflatex");

    // Must contain main.tex
    const mainItem = revision?.manifest.items.find((item) => item.path === "main.tex");
    expect(mainItem).toBeDefined();
    expect(mainItem?.kind).toBe("TEXT");

    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job.id],
    );
  });
});
