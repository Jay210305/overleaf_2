import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture } from "../../helpers/s02-session.js";
import {
  canonicalJsonStringify,
  computeSha256,
  RevisionsRepository,
} from "@latex-collab/db";

describe("NFR-06 Regression - Manifest integrity and deterministic hashing (S03-T07)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let repo: RevisionsRepository;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();
    repo = new RevisionsRepository(fixture.db);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("NFR-06: canonicalJsonStringify guarantees deterministic JSON key ordering and SHA-256 parity", () => {
    const objA = {
      version: 1,
      projectId: "abc",
      items: [{ path: "main.tex", nodeId: "1", kind: "TEXT" }],
      compiler: "pdflatex",
    };

    const objB = {
      compiler: "pdflatex",
      items: [{ nodeId: "1", kind: "TEXT", path: "main.tex" }],
      projectId: "abc",
      version: 1,
    };

    const strA = canonicalJsonStringify(objA);
    const strB = canonicalJsonStringify(objB);

    expect(strA).toBe(strB);
    expect(computeSha256(strA)).toBe(computeSha256(strB));
  });

  it("NFR-06: manifest hash remains reproducible and exactly matches stored revision manifest", async () => {
    const projectId = randomUUID();
    await fixture.db.query(
      `INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'NFR06 Project')`,
      [projectId, user.id],
    );

    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'main.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [randomUUID(), projectId],
    );

    const rev = await repo.createStructuralRevision({
      projectId,
      source: "compile",
    });

    // Recompute manifest hash from returned manifest
    const recomputedHash = computeSha256(canonicalJsonStringify(rev.manifest));
    expect(recomputedHash).toBe(rev.manifestHash);

    // Verify stored DB record matches recomputed hash
    const dbRecord = await fixture.db.query<{ manifest_hash: string }>(
      `SELECT manifest_hash FROM project_revisions WHERE id = $1`,
      [rev.id],
    );
    expect(dbRecord.rows[0]!.manifest_hash).toBe(recomputedHash);
  });
});
