import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { RevisionsRepository } from "@latex-collab/db";

describe("Regression COL-10 (S09-T01): Immutable labeled history and pagination", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id) VALUES ($1, $2) RETURNING id`,
      [`COL-10 Project ${randomUUID()}`, user.id],
    );
    projectId = pRes.rows[0]!.id;

    const revRepo = new RevisionsRepository(fixture.db);
    for (let i = 1; i <= 5; i++) {
      await revRepo.createStructuralRevision({
        projectId,
        authorId: user.id,
        source: "manual",
        label: i % 2 === 0 ? `Milestone ${i}` : null,
      });
    }
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("verifies revisions are strictly immutable while labels are editable", async () => {
    const login = await fixture.login(user.email);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(login.headers["x-csrf-token"]);

    // Read revision 3
    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions/3`,
      headers: { origin, cookie },
    });
    expect(getRes.statusCode).toBe(200);
    const rev3 = getRes.json();
    const originalHash = rev3.manifestHash;

    // Set label on revision 3
    const labelRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/revisions/3/label`,
      headers: { origin, cookie, "x-csrf-token": csrf },
      payload: { label: "Labeled rev 3" },
    });
    expect(labelRes.statusCode).toBe(200);

    // Verify hash didn't mutate
    const getResAfter = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/revisions/3`,
      headers: { origin, cookie },
    });
    expect(getResAfter.json().manifestHash).toBe(originalHash);
    expect(getResAfter.json().label).toBe("Labeled rev 3");
  });
});
