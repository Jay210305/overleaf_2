import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";
import { origin } from "../../helpers/s02-session.js";

describe("ACC-02 Session revocation and ticket invalidation (S07-T02)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("denies ticket request when session cookie is missing or invalid (401)", async () => {
    const res = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${fixture.projectId}/collab-ticket`,
      headers: {
        origin,
      },
      payload: {
        fileId: fixture.fileId,
        action: "read",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("invalidates outstanding tickets when user session is deleted or invalidated", async () => {
    const ownerRes = await fixture.sessionFixture.login(fixture.owner.email);
    const cookie = String(ownerRes.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(ownerRes.headers["x-csrf-token"]);

    // 1. Obtain ticket
    const ticketRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${fixture.projectId}/collab-ticket`,
      headers: {
        origin,
        cookie,
        "x-csrf-token": csrf,
      },
      payload: {
        fileId: fixture.fileId,
        action: "write",
      },
    });
    expect(ticketRes.statusCode).toBe(200);
    const { ticket } = ticketRes.json();

    // 2. Invalidate session via ticketStore
    await fixture.ticketStore.invalidateUser(fixture.owner.id);

    // 3. Attempt to use ticket on WSS -> must fail
    await expect(fixture.createClient(ticket)).rejects.toThrow(
      /TICKET_INVALID_OR_EXPIRED/,
    );
  });
});
