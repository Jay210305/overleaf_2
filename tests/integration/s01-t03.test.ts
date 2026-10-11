import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient, PersistenceError } from "../../packages/db/src/client.js";
import { ProjectRepository } from "../../packages/db/src/repositories/projects.js";

loadEnvFile(".env");

describe("S01-T03 Transaction and repository primitives", () => {
  let db: DatabaseClient;
  let repo: ProjectRepository;

  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
    repo = new ProjectRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it("commits transactions explicitly on success", async () => {
    const userId = randomUUID();
    const projId = randomUUID();

    await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
        userId,
        `tx-commit-${userId.slice(0, 8)}@test.com`,
        "Tx Commit User",
      ]);
      await tx.query(
        `INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Committed Project')`,
        [projId, userId],
      );
    });

    const userCheck = await db.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    const projCheck = await db.query(`SELECT id FROM projects WHERE id = $1`, [projId]);

    expect(userCheck.rows).toHaveLength(1);
    expect(projCheck.rows).toHaveLength(1);
  });

  it("rolls back transactions cleanly on error", async () => {
    const userId = randomUUID();
    const projId = randomUUID();

    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`,
          [userId, `tx-rb-${userId.slice(0, 8)}@test.com`, "Tx Rollback User"],
        );
        // Intentional failure: invalid compiler causes check constraint failure
        await tx.query(
          `INSERT INTO projects (id, owner_id, title, compiler) VALUES ($1, $2, 'Failed Proj', 'shell')`,
          [projId, userId],
        );
      }),
    ).rejects.toThrow(PersistenceError);

    // Verify user was NOT persisted due to rollback
    const userCheck = await db.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    expect(userCheck.rows).toHaveLength(0);
  });

  it("lists projects with deterministic cursor pagination and stable ordering", async () => {
    const ownerId = randomUUID();
    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `repo-${ownerId.slice(0, 8)}@test.com`,
      "Repo User",
    ]);

    // Create 3 projects
    const p1 = randomUUID();
    const p2 = randomUUID();
    const p3 = randomUUID();

    await db.query(
      `INSERT INTO projects (id, owner_id, title, updated_at) VALUES
       ($1, $4, 'Project 1', '2026-01-01T10:00:00Z'),
       ($2, $4, 'Project 2', '2026-01-01T11:00:00Z'),
       ($3, $4, 'Project 3', '2026-01-01T12:00:00Z')`,
      [p1, p2, p3, ownerId],
    );

    // Fetch page 1 with limit 2
    const page1 = await repo.list(ownerId, { limit: 2, filter: "owned", order: "updatedAt" });
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0]!.title).toBe("Project 3"); // Newest first
    expect(page1.items[1]!.title).toBe("Project 2");
    expect(page1.nextCursor).not.toBeNull();

    // Fetch page 2 using cursor
    const page2 = await repo.list(ownerId, {
      cursor: page1.nextCursor!,
      limit: 2,
      filter: "owned",
      order: "updatedAt",
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.title).toBe("Project 1");
    expect(page2.nextCursor).toBeNull();
  });

  it("rejects tampered or malformed pagination cursors", async () => {
    const actorId = randomUUID();
    await expect(
      repo.list(actorId, {
        cursor: "not-a-valid-base64",
        limit: 10,
        filter: "owned",
        order: "updatedAt",
      }),
    ).rejects.toThrow(PersistenceError);

    await expect(
      repo.list(actorId, {
        cursor: Buffer.from(JSON.stringify({ sortValue: "123", id: "not-a-uuid" })).toString(
          "base64url",
        ),
        limit: 10,
        filter: "owned",
        order: "updatedAt",
      }),
    ).rejects.toThrow(PersistenceError);
  });

  it("lists projects with deterministic cursor pagination when ordered by owner", async () => {
    const ownerId = randomUUID();
    await db.query(`INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`, [
      ownerId,
      `owner-ord-${ownerId.slice(0, 8)}@test.com`,
      "Owner Order User",
    ]);

    const p1 = randomUUID();
    const p2 = randomUUID();
    const p3 = randomUUID();

    await db.query(
      `INSERT INTO projects (id, owner_id, title) VALUES
       ($1, $4, 'Project Alpha'),
       ($2, $4, 'Project Beta'),
       ($3, $4, 'Project Gamma')`,
      [p1, p2, p3, ownerId],
    );

    const page1 = await repo.list(ownerId, { limit: 2, filter: "owned", order: "owner" });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await repo.list(ownerId, {
      cursor: page1.nextCursor!,
      limit: 2,
      filter: "owned",
      order: "owner",
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("preserves non-database application errors thrown within transactions", async () => {
    class DomainCustomError extends Error {
      readonly domainCode = "REVISION_UNAUTHORIZED";
      constructor() {
        super("Domain-level business invariant violated");
        this.name = "DomainCustomError";
      }
    }

    const userId = randomUUID();

    await expect(
      db.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO users (id, email_normalized, display_name) VALUES ($1, $2, $3)`,
          [userId, `app-err-${userId.slice(0, 8)}@test.com`, "App Err User"],
        );
        throw new DomainCustomError();
      }),
    ).rejects.toThrow(DomainCustomError);

    // Verify transaction rolled back cleanly
    const check = await db.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    expect(check.rows).toHaveLength(0);
  });

  it("rejects invalid filter or order values", async () => {
    const actorId = randomUUID();
    await expect(
      repo.list(actorId, {
        limit: 10,
        filter: "malicious_filter" as "owned",
        order: "updatedAt",
      }),
    ).rejects.toThrow(PersistenceError);

    await expect(
      repo.list(actorId, {
        limit: 10,
        filter: "owned",
        order: "malicious_order" as "updatedAt",
      }),
    ).rejects.toThrow(PersistenceError);
  });
});
