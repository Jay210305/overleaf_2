import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";

describe("COL-03 S04-T10 REST role enforcement on text routes", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let viewer: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    reviewer = await fixture.seed();
    viewer = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const res = await fixture.login(email);
    return {
      cookie: String(res.headers["set-cookie"]).split(";")[0]!,
      csrf: String(res.headers["x-csrf-token"]),
    };
  }

  it("permits READ for REVIEWER and VIEWER but strictly denies EDIT (PUT) with 403", async () => {
    const proj = await createProject(fixture.db, owner.id, {
      title: "COL-03-REST-Roles",
      compiler: "pdflatex",
    });
    const fileId = proj.mainFileId!;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role, joined_at)
       VALUES ($1, $2, 'REVIEWER', NOW()), ($1, $3, 'VIEWER', NOW())`,
      [proj.id, reviewer.id, viewer.id],
    );

    const reviewerSession = await getSession(reviewer.email);
    const viewerSession = await getSession(viewer.email);

    // REVIEWER READ: 200
    const revRead = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${proj.id}/files/${fileId}/text`,
      headers: { origin, cookie: reviewerSession.cookie },
    });
    expect(revRead.statusCode).toBe(200);

    // REVIEWER PUT: 403
    const revPut = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${proj.id}/files/${fileId}/text`,
      headers: { origin, cookie: reviewerSession.cookie, "x-csrf-token": reviewerSession.csrf },
      payload: {
        updateBase64: revRead.json().updateBase64,
        baseStateVectorBase64: revRead.json().stateVectorBase64,
      },
    });
    expect(revPut.statusCode).toBe(403);
    expect(revPut.json().code).toBe("PROJECT_PERMISSION_DENIED");

    // VIEWER READ: 200
    const viewRead = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${proj.id}/files/${fileId}/text`,
      headers: { origin, cookie: viewerSession.cookie },
    });
    expect(viewRead.statusCode).toBe(200);

    // VIEWER PUT: 403
    const viewPut = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${proj.id}/files/${fileId}/text`,
      headers: { origin, cookie: viewerSession.cookie, "x-csrf-token": viewerSession.csrf },
      payload: {
        updateBase64: viewRead.json().updateBase64,
        baseStateVectorBase64: viewRead.json().stateVectorBase64,
      },
    });
    expect(viewPut.statusCode).toBe(403);
    expect(viewPut.json().code).toBe("PROJECT_PERMISSION_DENIED");
  });
});
