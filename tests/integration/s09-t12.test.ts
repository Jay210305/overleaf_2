import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S09-T12: Implement explicit ownership transfer", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let currentOwner: { id: string; email: string };
  let recipient: { id: string; email: string };
  let bystander: { id: string; email: string };
  let projectId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    currentOwner = await fixture.seed();
    recipient = await fixture.seed();
    bystander = await fixture.seed();

    const pRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active') RETURNING id`,
      [`Ownership Transfer Project ${randomUUID()}`, currentOwner.id],
    );
    projectId = pRes.rows[0]!.id;

    // Recipient is initially an EDITOR
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [projectId, recipient.id],
    );
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

  it("completes full ownership transfer lifecycle: offer, recipient acceptance, former owner retained as editor", async () => {
    const ownerSession = await getSession(currentOwner.email);
    const recipientSession = await getSession(recipient.email);

    // 1. Owner creates transfer offer
    const offerRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/ownership`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
      payload: { recipientUserId: recipient.id },
    });

    expect(offerRes.statusCode).toBe(201);
    const offer = offerRes.json();
    expect(offer.projectId).toBe(projectId);
    expect(offer.recipientUserId).toBe(recipient.id);
    expect(offer.status).toBe("pending");
    const offerId = offer.id;

    // 2. Bystander cannot accept (403)
    const bystanderSession = await getSession(bystander.email);
    const resBystander = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/ownership/${offerId}/accept`,
      headers: { origin, cookie: bystanderSession.cookie, "x-csrf-token": bystanderSession.csrf },
    });
    expect(resBystander.statusCode).toBe(403);

    // 3. Recipient accepts offer
    const acceptRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/ownership/${offerId}/accept`,
      headers: { origin, cookie: recipientSession.cookie, "x-csrf-token": recipientSession.csrf },
    });
    expect(acceptRes.statusCode).toBe(200);
    const updatedProject = acceptRes.json();
    expect(updatedProject.ownerId).toBe(recipient.id);

    // Verify DB state:
    // a) project owner_id is now recipient
    const pCheck = await fixture.db.query<{ owner_id: string }>(
      `SELECT owner_id FROM projects WHERE id = $1`,
      [projectId],
    );
    expect(pCheck.rows[0]!.owner_id).toBe(recipient.id);

    // b) former owner is retained as EDITOR
    const formerCheck = await fixture.db.query<{ role: string }>(
      `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, currentOwner.id],
    );
    expect(formerCheck.rows[0]!.role).toBe("EDITOR");

    // c) recipient is no longer in project_members (they are owner)
    const recipientCheck = await fixture.db.query(
      `SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, recipient.id],
    );
    expect(recipientCheck.rows.length).toBe(0);

    // d) repeat acceptance fails with 409
    const repeatRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/ownership/${offerId}/accept`,
      headers: { origin, cookie: recipientSession.cookie, "x-csrf-token": recipientSession.csrf },
    });
    expect(repeatRes.statusCode).toBe(409);
  });

  it("prevents self-transfer and allows owner cancellation", async () => {
    // Current owner is now `recipient` from previous test
    const ownerSession = await getSession(recipient.email);

    // Self-transfer fails with 400
    const selfRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/ownership`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
      payload: { recipientUserId: recipient.id },
    });
    expect(selfRes.statusCode).toBe(400);

    // Create offer to currentOwner
    const offRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/ownership`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
      payload: { recipientUserId: currentOwner.id },
    });
    expect(offRes.statusCode).toBe(201);
    const offerId = offRes.json().id;

    // Owner cancels offer
    const cancelRes = await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}/ownership/${offerId}`,
      headers: { origin, cookie: ownerSession.cookie, "x-csrf-token": ownerSession.csrf },
    });
    expect(cancelRes.statusCode).toBe(204);

    // Cancelled offer cannot be accepted
    const targetSession = await getSession(currentOwner.email);
    const resTry = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/ownership/${offerId}/accept`,
      headers: { origin, cookie: targetSession.cookie, "x-csrf-token": targetSession.csrf },
    });
    expect(resTry.statusCode).toBe(409);
  });
});
