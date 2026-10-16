import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import {
  generateUserExportData,
  createUserExportArchive,
} from "../../apps/jobs/src/exports/user-data.js";

describe("S09-T13: Export authorized user data", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let otherUser: { id: string; email: string };
  let ownedProjectId: string;
  let sharedProjectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();
    otherUser = await fixture.seed();

    // 1. Owned project
    const p1 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`User Owned Project ${randomUUID()}`, user.id],
    );
    ownedProjectId = p1.rows[0]!.id;

    // 2. Shared project owned by otherUser
    const p2 = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Collaborator Project ${randomUUID()}`, otherUser.id],
    );
    sharedProjectId = p2.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [sharedProjectId, user.id],
    );

    // 3. User tag
    await fixture.db.query(
      `INSERT INTO project_tags (user_id, name, color) VALUES ($1, 'My Tag', '#123456')`,
      [user.id],
    );

    // 4. Preferences
    await fixture.db.query(
      `INSERT INTO user_preferences (user_id, locale, timezone, theme)
       VALUES ($1, 'es', 'America/Bogota', 'dark')
       ON CONFLICT (user_id) DO UPDATE SET locale = 'es', theme = 'dark'`,
      [user.id],
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("gathers full authorized user data without leaking password_hash, token_hash, or collaborator secrets", async () => {
    const exportBundle = await generateUserExportData(fixture.db, user.id);

    // 1. Account assertions
    expect(exportBundle.account.id).toBe(user.id);
    expect(exportBundle.account.email).toBe(user.email);
    expect(
      (exportBundle.account as unknown as Record<string, unknown>).password_hash,
    ).toBeUndefined();
    expect(
      (exportBundle.account as unknown as Record<string, unknown>).passwordHash,
    ).toBeUndefined();

    // 2. Preferences assertions
    expect(exportBundle.preferences).toBeDefined();
    expect(exportBundle.preferences!.locale).toBe("es");
    expect(exportBundle.preferences!.theme).toBe("dark");

    // 3. Sessions assertions (no token hash)
    expect(Array.isArray(exportBundle.sessions)).toBe(true);
    for (const s of exportBundle.sessions) {
      expect((s as unknown as Record<string, unknown>).token_hash).toBeUndefined();
      expect((s as unknown as Record<string, unknown>).tokenHash).toBeUndefined();
    }

    // 4. Owned projects
    const ownedIds = exportBundle.ownedProjects.map((p) => p.id);
    expect(ownedIds).toContain(ownedProjectId);
    expect(ownedIds).not.toContain(sharedProjectId);

    // 5. Shared memberships (describes membership without other users' sensitive info)
    const membershipProjectIds = exportBundle.memberships.map((m) => m.projectId);
    expect(membershipProjectIds).toContain(sharedProjectId);
    const sharedMembership = exportBundle.memberships.find((m) => m.projectId === sharedProjectId)!;
    expect(sharedMembership.role).toBe("EDITOR");
    expect((sharedMembership as unknown as Record<string, unknown>).ownerEmail).toBeUndefined();
    expect((sharedMembership as unknown as Record<string, unknown>).password).toBeUndefined();

    // 6. Tags
    expect(exportBundle.tags.some((t) => t.name === "My Tag")).toBe(true);
  });

  it("POST /api/v1/me/data-export initiates export job with 202 Accepted", async () => {
    const session = await fixture.login(user.email);
    const cookie = String(session.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(session.headers["x-csrf-token"]);

    const res = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/data-export",
      headers: { origin, cookie, "x-csrf-token": csrf },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.status).toBe("queued");
    expect(body.id).toMatch(/^export-/);
  });

  it("createUserExportArchive generates expiring access details", async () => {
    const archiveResult = await createUserExportArchive(fixture.db, user.id);
    expect(archiveResult.userId).toBe(user.id);
    expect(archiveResult.downloadUrl).toMatch(/\/api\/v1\/me\/data-export\//);
    expect(new Date(archiveResult.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(archiveResult.bundle.account.id).toBe(user.id);
  });
});
