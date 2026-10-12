import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("PRO-03 regression: Rename projects and persist ownership, dates and description (S03-T01)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const response = await fixture.login(email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("persists title rename, description modification and ownership across PATCH", async () => {
    const session = await getSession(user.email);
    const initialTitle = `Initial ${randomUUID()}`;

    const createRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: initialTitle, description: "First description" },
    });
    expect(createRes.statusCode).toBe(201);
    const proj = createRes.json();

    const newTitle = `Renamed ${randomUUID()}`;
    const patchRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${proj.id}`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "if-match": `"${proj.currentRevision}"`,
      },
      payload: { title: newTitle, description: "Updated description" },
    });
    expect(patchRes.statusCode).toBe(200);
    const updated = patchRes.json();
    expect(updated.title).toBe(newTitle);
    expect(updated.description).toBe("Updated description");
    expect(updated.ownerId).toBe(user.id);

    // Verify in database
    const dbCheck = await fixture.db.query<{
      title: string;
      description: string;
      owner_id: string;
    }>("SELECT title, description, owner_id FROM projects WHERE id = $1", [proj.id]);
    expect(dbCheck.rows[0]!.title).toBe(newTitle);
    expect(dbCheck.rows[0]!.description).toBe("Updated description");
    expect(dbCheck.rows[0]!.owner_id).toBe(user.id);
  });
});
