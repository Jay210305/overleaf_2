import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression PRO-08 (S09-T09): Archive differs from trash; restore and owner-confirmed deletion", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let collaborator: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    collaborator = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("verifies archive is distinct from trash and only owner can permanently delete", async () => {
    // 1. Create project
    const pTitle = `PRO-08 Distinct ${randomUUID()}`;
    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [pTitle, owner.id],
    );
    const projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, collaborator.id],
    );

    const ownerSession = await fixture.login(owner.email);
    const cookie = String(ownerSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(ownerSession.headers["x-csrf-token"]);

    // Archive project
    await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/archive`,
      headers: { origin, cookie, "x-csrf-token": csrf },
    });

    const checkArch = await fixture.db.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(checkArch.rows[0]!.status).toBe("archived");

    // Move from archived to trash
    await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/trash`,
      headers: { origin, cookie, "x-csrf-token": csrf },
    });

    const checkTrash = await fixture.db.query<{ status: string }>(
      `SELECT status FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(checkTrash.rows[0]!.status).toBe("trashed");

    // Collaborator cannot delete permanently
    const collabSession = await fixture.login(collaborator.email);
    const collabCookie = String(collabSession.headers["set-cookie"]).split(";")[0]!;
    const collabCsrf = String(collabSession.headers["x-csrf-token"]);

    const resCollab = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/permanent`,
      headers: { origin, cookie: collabCookie, "x-csrf-token": collabCsrf },
      payload: { confirmTitle: pTitle },
    });
    expect(resCollab.statusCode).toBe(403);

    // Owner permanently deletes with title confirmation
    const resOwner = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/permanent`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { confirmTitle: pTitle },
    });
    expect(resOwner.statusCode).toBe(204);

    const checkFinal = await fixture.db.query(
      `SELECT id FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(checkFinal.rows.length).toBe(0);
  });
});
