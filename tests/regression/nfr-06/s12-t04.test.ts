import { createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { canonicalJsonStringify, RevisionsRepository } from "@latex-collab/db";
import { buildSourceZip } from "@latex-collab/storage/source-export";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";
import { DefaultTextDocumentService } from "../../../apps/api/src/modules/text/text-document-service.js";
import { buildReplacementUpdate } from "../../../apps/jobs/src/sync/apply-changes.js";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createSessionFixture } from "../../helpers/s02-session.js";

loadEnvFile(".env");
describe("NFR-06 frozen revision identity", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  beforeAll(async () => {
    fixture = await createSessionFixture();
  });
  afterAll(async () => {
    if (fixture) await fixture.close();
  });
  it("exports the revision's original text and the stored manifest hash after a later edit", async () => {
    const owner = await fixture.seed();
    const project = await createProject(fixture.db, owner.id, {
      title: "Frozen export",
      compiler: "pdflatex",
    });
    const fileId = project.mainFileId!;
    const text = new DefaultTextDocumentService(fixture.db);
    const initial = await text.load(project.id, fileId, owner.id);
    await text.apply(
      project.id,
      fileId,
      owner.id,
      buildReplacementUpdate(initial.updateBase64, "original frozen text")!,
    );
    const revision = await new RevisionsRepository(fixture.db).createStructuralRevision({
      projectId: project.id,
      authorId: owner.id,
      source: "checkpoint",
    });
    const later = await text.load(project.id, fileId, owner.id);
    await text.apply(
      project.id,
      fileId,
      owner.id,
      buildReplacementUpdate(later.updateBase64, "later live text")!,
    );
    const config = parseServerConfig(process.env);
    const storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    const zip = await buildSourceZip(fixture.db, storage, {
      projectId: project.id,
      actorId: owner.id,
      revisionNo: revision.revisionNo,
    });
    expect(zip.bytes.includes(Buffer.from("original frozen text"))).toBe(true);
    expect(zip.bytes.includes(Buffer.from("later live text"))).toBe(false);
    const reread = await new RevisionsRepository(fixture.db).getRevision(
      project.id,
      revision.revisionNo,
    );
    expect(reread?.manifest).toEqual(revision.manifest);
    expect(
      createHash("sha256").update(canonicalJsonStringify(reread!.manifest)).digest("hex"),
    ).toBe(revision.manifestHash);
    await fixture.db.query(
      "UPDATE revision_items SET text_bytes = $2 WHERE revision_id = $1 AND path = 'main.tex'",
      [revision.id, Buffer.from("corrupted")],
    );
    await expect(
      buildSourceZip(fixture.db, storage, {
        projectId: project.id,
        actorId: owner.id,
        revisionNo: revision.revisionNo,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});
