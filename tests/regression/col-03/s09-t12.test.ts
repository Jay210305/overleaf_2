import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression COL-03 (S09-T12): Role authorization for ownership transfer", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let editor: { id: string; email: string };
  let candidate: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    editor = await fixture.seed();
    candidate = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`COL-03 Ownership Transfer ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, editor.id],
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("denies ownership transfer offer initiation by non-owners with 403 Forbidden", async () => {
    const editorSession = await fixture.login(editor.email);
    const cookie = String(editorSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(editorSession.headers["x-csrf-token"]);

    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/ownership`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { recipientUserId: candidate.id },
    });

    expect(res.statusCode).toBe(403);
  });
});
