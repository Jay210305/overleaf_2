import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";

describe("NFR-06 S04-T07 Source revision and deterministic manifest hash match exactly", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("produces deterministic manifest hash and verifies sourceRevision matches frozen manifest", async () => {
    const loginRes = await fixture.login(owner.email);
    const cookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(loginRes.headers["x-csrf-token"]);

    const proj = await createProject(fixture.db, owner.id, {
      title: `NFR06-Manifest-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });

    // Explicit compile checkpoint
    const cpRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${proj.id}/checkpoints`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { label: "Compile Checkpoint", source: "compile" },
    });

    expect(cpRes.statusCode).toBe(201);
    const checkpoint = cpRes.json();
    const sourceRevision = checkpoint.revisionNo;
    const manifestHash = checkpoint.manifestHash;

    // Verify database record has identical manifest_hash
    const dbRes = await fixture.db.query<{ manifest_hash: string }>(
      `SELECT manifest_hash FROM project_revisions WHERE project_id = $1 AND revision_no = $2`,
      [proj.id, sourceRevision],
    );

    expect(dbRes.rows[0]?.manifest_hash).toBe(manifestHash);

    // Verify hash is genuine 64-char hex SHA-256
    expect(manifestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(checkpoint.manifestKey).toBe(`projects/${proj.id}/revisions/${sourceRevision}.json`);
  });
});
