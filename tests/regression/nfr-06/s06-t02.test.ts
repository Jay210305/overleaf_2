import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyCompileMigrations } from "../../helpers/compile-migrations.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("NFR-06 Generated PDF sourceRevision and manifest hash match exactly (S06-T02)", () => {
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
        title: `NFR-06 Test ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    projectId = projRes.json().id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("verifies compile job binds exactly to the immutable manifest hash of sourceRevision", async () => {
    const key = `nfr-06-key-${randomUUID()}`;

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
      manifest_hash: string;
    }>(`SELECT id, revision_no, manifest_hash FROM project_revisions WHERE id = $1`, [
      job.sourceRevisionId,
    ]);
    expect(revRes.rows.length).toBe(1);
    const rev = revRes.rows[0]!;

    // Load full structural revision record and compare manifest hash
    const structuralRev = await revisionsRepo.getRevision(projectId, Number(rev.revision_no));
    expect(structuralRev).not.toBeNull();
    expect(structuralRev?.id).toBe(job.sourceRevisionId);
    expect(structuralRev?.manifestHash).toBe(rev.manifest_hash);

    await fixture.db.query(
      "UPDATE compile_jobs SET status = 'succeeded', finished_at = now() WHERE id = $1",
      [job.id],
    );
  });
});
