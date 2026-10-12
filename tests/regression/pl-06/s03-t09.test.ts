import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture } from "../../helpers/s02-session.js";

describe("PL-06 Regression - Relational constraints and domain invariants for file tree", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user1: { id: string; email: string };
  let user2: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user1 = await fixture.seed();
    user2 = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("PL-06: database enforces same-project parent constraint via composite FK", async () => {
    // Create two projects directly
    const p1Id = randomUUID();
    const p2Id = randomUUID();

    await fixture.db.query(
      `INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'P1'), ($3, $4, 'P2')`,
      [p1Id, user1.id, p2Id, user2.id],
    );

    // Create a folder in Project 1
    const p1FolderId = randomUUID();
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'p1_folder', 'FOLDER', 'application/octet-stream', 'BINARY')`,
      [p1FolderId, p1Id],
    );

    // Attempt direct SQL insertion in Project 2 with parentId from Project 1
    const foreignChildId = randomUUID();
    await expect(
      fixture.db.query(
        `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
         VALUES ($1, $2, $3, 'intruder.tex', 'FILE', 'application/x-tex', 'TEXT')`,
        [foreignChildId, p2Id, p1FolderId],
      ),
    ).rejects.toThrow();
  });

  it("PL-06: database enforces unique active sibling and root names via partial unique indexes", async () => {
    const projId = randomUUID();
    await fixture.db.query(
      `INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'PL06 Project')`,
      [projId, user1.id],
    );

    // 1. Root uniqueness
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'main.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [randomUUID(), projId],
    );

    // Duplicate root name fails
    await expect(
      fixture.db.query(
        `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
         VALUES ($1, $2, NULL, 'main.tex', 'FILE', 'application/x-tex', 'TEXT')`,
        [randomUUID(), projId],
      ),
    ).rejects.toThrow();

    // 2. Sibling uniqueness under folder
    const folderId = randomUUID();
    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, NULL, 'docs', 'FOLDER', 'application/octet-stream', 'BINARY')`,
      [folderId, projId],
    );

    await fixture.db.query(
      `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
       VALUES ($1, $2, $3, 'chapter1.tex', 'FILE', 'application/x-tex', 'TEXT')`,
      [randomUUID(), projId, folderId],
    );

    // Duplicate sibling fails
    await expect(
      fixture.db.query(
        `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, content_kind)
         VALUES ($1, $2, $3, 'chapter1.tex', 'FILE', 'application/x-tex', 'TEXT')`,
        [randomUUID(), projId, folderId],
      ),
    ).rejects.toThrow();
  });
});
