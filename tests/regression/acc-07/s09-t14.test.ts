import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("Regression ACC-07 (S09-T14): Account deletion under shared ownership rules", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("blocks deletion while owning shared projects, but allows deletion after explicit ownership transfer", async () => {
    const owner = await fixture.seed();
    const collaborator = await fixture.seed();

    const ownerSession = await fixture.login(owner.email, "correct-password-123");
    const ownerCookie = String(ownerSession.headers["set-cookie"]).split(";")[0]!;
    const ownerCsrf = String(ownerSession.headers["x-csrf-token"]);

    // Create shared project owned by owner with collaborator as editor
    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Shared Research Project ${randomUUID()}`, owner.id],
    );
    const projectId = pRes.rows[0]!.id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, collaborator.id],
    );

    // 1. Attempt to delete account while still owning the shared project -> blocked with 409
    const blockedRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/delete",
      headers: { origin, cookie: ownerCookie, "x-csrf-token": ownerCsrf },
      payload: { password: "correct-password-123" },
    });

    expect(blockedRes.statusCode).toBe(409);
    expect(blockedRes.json().code).toBe("SOLE_OWNER_CONFLICT");

    // 2. Transfer ownership to collaborator via ownership transfer workflow
    // Create offer
    const offerRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/ownership`,
      headers: { origin, cookie: ownerCookie, "x-csrf-token": ownerCsrf },
      payload: { recipientUserId: collaborator.id },
    });
    expect(offerRes.statusCode).toBe(201);
    const offerId = offerRes.json().id;

    // Collaborator accepts offer
    const collabSession = await fixture.login(collaborator.email, "correct-password-123");
    const collabCookie = String(collabSession.headers["set-cookie"]).split(";")[0]!;
    const collabCsrf = String(collabSession.headers["x-csrf-token"]);

    const acceptRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/ownership/${offerId}/accept`,
      headers: { origin, cookie: collabCookie, "x-csrf-token": collabCsrf },
    });
    expect(acceptRes.statusCode).toBe(200);

    // Verify collaborator is now owner
    const projCheck = await fixture.db.query<{ owner_id: string }>(
      `SELECT owner_id FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(projCheck.rows[0]!.owner_id).toBe(collaborator.id);

    // 3. Now former owner can safely delete their account
    const deleteRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/me/delete",
      headers: { origin, cookie: ownerCookie, "x-csrf-token": ownerCsrf },
      payload: { password: "correct-password-123" },
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().deleted).toBe(true);

    // Project is still active and owned by collaborator
    const finalProj = await fixture.db.query<{ owner_id: string; status: string }>(
      `SELECT owner_id, status FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(finalProj.rows[0]!.owner_id).toBe(collaborator.id);
    expect(finalProj.rows[0]!.status).toBe("active");
  });
});
