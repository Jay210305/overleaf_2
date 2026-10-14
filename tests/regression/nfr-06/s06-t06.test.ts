import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { applyCompileMigrations } from "../../helpers/compile-migrations.js";
import { RevisionsRepository } from "@latex-collab/db";
import { persistJobArtifacts } from "../../../apps/jobs/src/compilation/artifacts.js";

describe("NFR-06 Artifacts provenance and immutable manifest hash matching (S06-T06)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let storage: S3StorageAdapter;
  let user: { id: string; email: string };
  let projectId: string;
  let session: { cookie: string; csrf: string };
  let revisionsRepo: RevisionsRepository;

  const validPdfBytes = new TextEncoder().encode("%PDF-1.5\nProvenance test\n%%EOF");

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await applyCompileMigrations(fixture.db);
    revisionsRepo = new RevisionsRepository(fixture.db);

    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });

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
        title: `NFR-06 Artifacts Test ${randomUUID()}`,
        compiler: "pdflatex",
      },
    });
    projectId = projRes.json().id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("verifies persisted artifact set binds exactly to source revision manifest hash and survives project edits", async () => {
    const enqRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/compilations`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "idempotency-key": `nfr06-${randomUUID()}`,
      },
      payload: { compiler: "pdflatex" },
    });
    expect(enqRes.statusCode).toBe(202);
    const { id: jobId, sourceRevisionId } = enqRes.json();

    // Fetch the frozen revision manifest hash
    const revRow = await fixture.db.query<{ revision_no: number }>(
      `SELECT revision_no FROM project_revisions WHERE id = $1`,
      [sourceRevisionId],
    );
    const revision = await revisionsRepo.getRevision(projectId, Number(revRow.rows[0]?.revision_no));
    expect(revision).toBeDefined();
    const expectedManifestHash = revision!.manifestHash;

    // Persist artifacts with this exact manifest hash
    const artifactSet = await persistJobArtifacts({
      db: fixture.db,
      storage,
      projectId,
      jobId,
      sourceHash: expectedManifestHash,
      artifacts: [
        { name: "output.pdf", mime: "application/pdf", bytes: validPdfBytes, sha256: "pdf-hash" },
      ],
    });

    expect(artifactSet.sourceHash).toBe(expectedManifestHash);

    // Later project node edits do not alter the persisted artifact set's sourceHash
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, size_bytes, content_kind)
       VALUES ($1, $2, null, 'chapter2.tex', 'FILE', 'text/x-tex', 50, 'TEXT')`,
      [randomUUID(), projectId],
    );

    const artDbRow = await fixture.db.query<{ source_hash: string }>(
      `SELECT source_hash FROM artifact_sets WHERE id = $1`,
      [artifactSet.id],
    );
    expect(artDbRow.rows[0]?.source_hash).toBe(expectedManifestHash);
  });
});
