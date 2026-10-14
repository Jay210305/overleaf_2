import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCollabTestFixture, type CollabTestFixture } from "../../helpers/collab-fixture.js";
import { origin } from "../../helpers/s02-session.js";

describe("COL-03 Role enforcement on WSS tickets (S07-T02)", () => {
  let fixture: CollabTestFixture;

  beforeAll(async () => {
    fixture = await createCollabTestFixture();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("permits OWNER and EDITOR to request write tickets over REST", async () => {
    const ownerTicket = await fixture.getTicket(fixture.owner.email, fixture.fileId, "write");
    expect(ownerTicket).toBeDefined();

    const editorTicket = await fixture.getTicket(fixture.editor.email, fixture.fileId, "write");
    expect(editorTicket).toBeDefined();
  });

  it("strictly forbids VIEWER from obtaining write ticket (403 PROJECT_PERMISSION_DENIED)", async () => {
    const viewerRes = await fixture.sessionFixture.login(fixture.viewer.email);
    const cookie = String(viewerRes.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(viewerRes.headers["x-csrf-token"]);

    const res = await fixture.app.inject({
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

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("PROJECT_PERMISSION_DENIED");
  });

  it("allows VIEWER to obtain read ticket", async () => {
    const viewerTicket = await fixture.getTicket(fixture.viewer.email, fixture.fileId, "read");
    expect(viewerTicket).toBeDefined();
  });
});
