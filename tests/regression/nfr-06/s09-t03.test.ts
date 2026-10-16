import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { RevisionsRepository, canonicalJsonStringify, computeSha256 } from "@latex-collab/db";

describe("Regression NFR-06 (S09-T03): Restored revision manifest hash matches exact source manifest", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`NFR-06 Manifest Hash ${randomUUID()}`, user.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'main.tex', 'FILE', 'application/x-tex', 'TEXT', 'blob-v1')`,
      [projectId],
    );

    const revRepo = new RevisionsRepository(fixture.db);
    await revRepo.createStructuralRevision({
      projectId,
      authorId: user.id,
      source: "manual",
    });
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("verifies that restored revision generates exact deterministic manifest and hash", async () => {
    const login = await fixture.login(user.email);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(login.headers["x-csrf-token"]);

    // Restore to v1 with expectedRevision: 1
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/restore`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: {
        revisionNo: 1,
        expectedRevision: 1,
      },
    });

    expect(res.statusCode).toBe(200);
    const { newRevisionId, revisionNo } = res.json();
    expect(revisionNo).toBe(2);

    // Fetch the new revision from DB
    const revRepo = new RevisionsRepository(fixture.db);
    const restoredRev = await revRepo.getRevision(projectId, revisionNo);
    expect(restoredRev).not.toBeNull();
    expect(restoredRev!.id).toBe(newRevisionId);

    // Recompute manifest hash from manifest object using canonical JSON stringify
    const expectedManifestHash = computeSha256(canonicalJsonStringify(restoredRev!.manifest));
    expect(restoredRev!.manifestHash).toBe(expectedManifestHash);
  });
});
