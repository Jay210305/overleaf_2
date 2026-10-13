import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

loadEnvFile(".env");

describe("S05-T01 verified uploads", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  let storage: S3StorageAdapter;
  let projectId: string;
  let ownerId: string;
  let cookie: string;
  let csrf: string;

  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const authHeaders = () => ({ origin, cookie, "x-csrf-token": csrf });
  const presign = (payload: Record<string, unknown>, targetProjectId = projectId) =>
    app.inject({
      method: "POST",
      url: `/api/v1/projects/${targetProjectId}/uploads/presign`,
      headers: authHeaders(),
      payload,
    });
  const complete = (
    uploadId: string,
    sha256: string,
    targetProjectId = projectId,
    key = randomUUID(),
  ) =>
    app.inject({
      method: "POST",
      url: `/api/v1/projects/${targetProjectId}/uploads/complete`,
      headers: { ...authHeaders(), "idempotency-key": key },
      payload: { uploadId, sha256 },
    });

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../packages/db/migrations/0005-upload-intents.sql"),
        "utf8",
      ),
    );
    const owner = await fixture.seed();
    ownerId = owner.id;
    const project = await createProject(fixture.db, owner.id, {
      title: "S05 upload fixture",
      compiler: "pdflatex",
    });
    projectId = project.id;
    const login = await fixture.login(owner.email);
    cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    csrf = String(login.headers["x-csrf-token"]);
    const config = parseServerConfig(process.env);
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      storage,
      origin,
      logger: false,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    if (fixture) await fixture.close();
  });

  it("removes a completed intent when its node is physically deleted", async () => {
    const constraint = await fixture.db.query<{ confdeltype: string }>(
      `SELECT confdeltype FROM pg_constraint
       WHERE conname = 'pending_uploads_completed_node_id_fkey'`,
    );
    expect(constraint.rows[0]?.confdeltype).toBe("c");
  });

  it("issues a scoped presigned PUT for an authorized bibliography file", async () => {
    const bytes = Buffer.from("@book{sample, title={A test}}\n", "utf8");
    const response = await presign({
      fileName: "references.bib",
      mime: "application/x-bibtex",
      sizeBytes: bytes.length,
      sha256: digest(bytes),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      uploadId: expect.any(String),
      url: expect.stringContaining(`/projects/${projectId}/`),
      expiresAt: expect.any(String),
    });
  });

  it("commits verified bibliography bytes to canonical Yjs text exactly once", async () => {
    const bytes = Buffer.from("@article{unicode, title={Investigación ñ}}\n", "utf8");
    const metadata = {
      fileName: `source-${randomUUID()}.bib`,
      mime: "application/x-bibtex",
      sizeBytes: bytes.length,
      sha256: digest(bytes),
    };
    const signed = await presign(metadata);
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    const put = await fetch(url, { method: "PUT", body: bytes });
    expect(put.status).toBe(200);

    const key = randomUUID();
    const first = await complete(uploadId, metadata.sha256, projectId, key);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      projectId,
      name: metadata.fileName,
      kind: "FILE",
      contentKind: "TEXT",
      mime: metadata.mime,
      sizeBytes: bytes.length,
    });
    const retry = await complete(uploadId, metadata.sha256, projectId, key);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().id).toBe(first.json().id);
    const changedKey = await complete(uploadId, metadata.sha256, projectId, randomUUID());
    expect(changedKey.statusCode).toBe(409);

    const text = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${first.json().id}/text`,
      headers: { origin, cookie },
    });
    expect(text.statusCode).toBe(200);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(text.json().updateBase64, "base64"));
    expect(Buffer.from(doc.getText("content").toString(), "utf8")).toEqual(bytes);
  });

  it("rejects unsafe names, unsupported types and oversize claims before issuing a URL", async () => {
    const valid = { mime: "application/x-bibtex", sizeBytes: 5, sha256: "a".repeat(64) };
    const unsafe = await presign({ ...valid, fileName: "../other.bib" });
    expect(unsafe.statusCode).toBe(400);
    expect(unsafe.json()).not.toHaveProperty("url");
    const unsupported = await presign({ ...valid, fileName: "active.svg", mime: "image/svg+xml" });
    expect(unsupported.statusCode).toBe(422);
    const tooLarge = await presign({
      ...valid,
      fileName: "large.bib",
      sizeBytes: 25 * 1024 * 1024 + 1,
    });
    expect(tooLarge.statusCode).toBe(413);
  });

  it("rejects a new file when the project byte quota is full", async () => {
    const full = await createProject(fixture.db, ownerId, {
      title: "Full upload project",
      compiler: "pdflatex",
    });
    await fixture.db.query(
      "UPDATE project_nodes SET size_bytes = $1 WHERE project_id = $2 AND deleted_at IS NULL",
      [100 * 1024 * 1024, full.id],
    );
    const response = await presign(
      {
        fileName: "extra.bib",
        mime: "application/x-bibtex",
        sizeBytes: 1,
        sha256: digest(Buffer.from("x")),
      },
      full.id,
    );
    expect(response.statusCode).toBe(413);
    expect(response.json()).not.toHaveProperty("url");
  });

  it("denies completion when actual object bytes differ from the promised hash", async () => {
    const claimed = Buffer.from("@book{safe, title={Safe}}\n", "utf8");
    const signed = await presign({
      fileName: `mismatch-${randomUUID()}.bib`,
      mime: "application/x-bibtex",
      sizeBytes: claimed.length,
      sha256: digest(claimed),
    });
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    const forged = Buffer.from("x".repeat(claimed.length), "utf8");
    expect((await fetch(url, { method: "PUT", body: forged })).status).toBe(200);
    const denied = await complete(uploadId, digest(claimed));
    expect(denied.statusCode).toBe(422);
    const nodes = await fixture.db.query<{ id: string }>(
      "SELECT id FROM project_nodes WHERE project_id = $1 AND name LIKE 'mismatch-%' AND deleted_at IS NULL",
      [projectId],
    );
    expect(nodes.rows).toEqual([]);
  });

  it("denies an object with a different stored byte size before creating a node", async () => {
    const claimed = Buffer.from("@book{size}\n", "utf8");
    const fileName = `size-${randomUUID()}.bib`;
    const signed = await presign({
      fileName,
      mime: "application/x-bibtex",
      sizeBytes: claimed.length,
      sha256: digest(claimed),
    });
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    expect(
      (await fetch(url, { method: "PUT", body: Buffer.concat([claimed, Buffer.from("x")]) }))
        .status,
    ).toBe(200);
    const denied = await complete(uploadId, digest(claimed));
    expect(denied.statusCode).toBe(422);
    const nodes = await fixture.db.query<{ id: string }>(
      "SELECT id FROM project_nodes WHERE project_id = $1 AND name = $2 AND deleted_at IS NULL",
      [projectId, fileName],
    );
    expect(nodes.rows).toEqual([]);
  });

  it("commits concurrent retries of one completion only once", async () => {
    const bytes = Buffer.from("@misc{parallel}\n", "utf8");
    const fileName = `parallel-${randomUUID()}.bib`;
    const signed = await presign({
      fileName,
      mime: "application/x-bibtex",
      sizeBytes: bytes.length,
      sha256: digest(bytes),
    });
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    expect((await fetch(url, { method: "PUT", body: bytes })).status).toBe(200);
    const key = randomUUID();
    const [first, second] = await Promise.all([
      complete(uploadId, digest(bytes), projectId, key),
      complete(uploadId, digest(bytes), projectId, key),
    ]);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().id).toBe(second.json().id);
    const nodes = await fixture.db.query<{ id: string }>(
      "SELECT id FROM project_nodes WHERE project_id = $1 AND name = $2 AND deleted_at IS NULL",
      [projectId, fileName],
    );
    expect(nodes.rows).toHaveLength(1);
  });

  it("does not let a different project use an issued uploadId", async () => {
    const bytes = Buffer.from("@misc{foreign}\n", "utf8");
    const signed = await presign({
      fileName: `foreign-${randomUUID()}.bib`,
      mime: "application/x-bibtex",
      sizeBytes: bytes.length,
      sha256: digest(bytes),
    });
    expect(signed.statusCode).toBe(200);
    const other = await createProject(fixture.db, ownerId, {
      title: "Other project",
      compiler: "pdflatex",
    });
    const denied = await complete(signed.json().uploadId, digest(bytes), other.id);
    expect(denied.statusCode).toBe(404);
  });

  it("does not issue a PUT URL for another owner's project", async () => {
    const otherOwner = await fixture.seed();
    const foreign = await createProject(fixture.db, otherOwner.id, {
      title: "Foreign upload project",
      compiler: "pdflatex",
    });
    const bytes = Buffer.from("@misc{foreign}\n");
    const denied = await presign(
      {
        fileName: "foreign.bib",
        mime: "application/x-bibtex",
        sizeBytes: bytes.length,
        sha256: digest(bytes),
      },
      foreign.id,
    );
    expect(denied.statusCode).toBe(404);
    expect(denied.json()).not.toHaveProperty("url");
  });

  it("denies a viewer and rechecks an editor revoked after presign", async () => {
    const viewer = await fixture.seed();
    const editor = await fixture.seed();
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'VIEWER'), ($1, $3, 'EDITOR')`,
      [projectId, viewer.id, editor.id],
    );
    const viewerLogin = await fixture.login(viewer.email);
    const editorLogin = await fixture.login(editor.email);
    const body = {
      fileName: `roles-${randomUUID()}.bib`,
      mime: "application/x-bibtex",
      sizeBytes: 2,
      sha256: digest(Buffer.from("x\n")),
    };
    const denied = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/uploads/presign`,
      headers: {
        origin,
        cookie: String(viewerLogin.headers["set-cookie"]).split(";")[0]!,
        "x-csrf-token": String(viewerLogin.headers["x-csrf-token"]),
      },
      payload: body,
    });
    expect(denied.statusCode).toBe(403);
    const editorHeaders = {
      origin,
      cookie: String(editorLogin.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(editorLogin.headers["x-csrf-token"]),
    };
    const signed = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/uploads/presign`,
      headers: editorHeaders,
      payload: body,
    });
    expect(signed.statusCode).toBe(200);
    const { uploadId, url } = signed.json() as { uploadId: string; url: string };
    expect((await fetch(url, { method: "PUT", body: Buffer.from("x\n") })).status).toBe(200);
    await fixture.db.query(
      "UPDATE project_members SET revoked_at = NOW() WHERE project_id = $1 AND user_id = $2",
      [projectId, editor.id],
    );
    const completion = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/uploads/complete`,
      headers: { ...editorHeaders, "idempotency-key": randomUUID() },
      payload: { uploadId, sha256: body.sha256 },
    });
    expect(completion.statusCode).toBe(404);
    const nodes = await fixture.db.query<{ id: string }>(
      "SELECT id FROM project_nodes WHERE project_id = $1 AND name = $2 AND deleted_at IS NULL",
      [projectId, body.fileName],
    );
    expect(nodes.rows).toEqual([]);
  });
});
