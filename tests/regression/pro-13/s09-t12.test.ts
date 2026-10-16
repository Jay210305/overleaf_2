import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression PRO-13 (S09-T12): Ownership transfer requires recipient acceptance", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let candidate: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    candidate = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`PRO-13 Ownership ${randomUUID()}`, owner.id],
    );
    projectId = pRes.rows[0]!.id;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("leaves ownership intact until recipient explicitly accepts the offer", async () => {
    const ownerSession = await fixture.login(owner.email);
    const cookie = String(ownerSession.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(ownerSession.headers["x-csrf-token"]);

    // Owner creates transfer offer
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/ownership`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { recipientUserId: candidate.id },
    });
    expect(res.statusCode).toBe(201);

    // Verify ownership has NOT changed yet
    const check1 = await fixture.db.query<{ owner_id: string }>(
      `SELECT owner_id FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(check1.rows[0]!.owner_id).toBe(owner.id);
  });
});
