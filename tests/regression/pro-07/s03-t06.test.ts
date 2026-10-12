import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("PRO-07 Regression - Project root document selection", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession() {
    const response = await fixture.login(owner.email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  it("PRO-07: permits selecting only active .tex files within the same project as root", async () => {
    const session = await getSession();

    // Create project
    const pRes = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { title: `PRO-07 Root Test ${randomUUID()}` },
    });
    const project = pRes.json();

    // 1. Create a subfolder and a valid sub .tex file
    const fRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "src", parentId: null, kind: "FOLDER" },
    });
    const folder = fRes.json();

    const texRes = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/nodes`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { name: "thesis.tex", parentId: folder.id, kind: "FILE" },
    });
    const thesisTex = texRes.json();

    // 2. Select thesis.tex as root
    const selectRes = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { mainFileId: thesisTex.id },
    });
    expect(selectRes.statusCode).toBe(200);
    expect(selectRes.json().mainFileId).toBe(thesisTex.id);

    // 3. Delete thesis.tex, then try to select it again -> 400
    await fixture.app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/nodes/${thesisTex.id}`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
    });

    const deletedSelect = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { mainFileId: thesisTex.id },
    });
    expect(deletedSelect.statusCode).toBe(400);

    // 4. Try selecting folder as root -> 400
    const folderSelect = await fixture.app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/settings`,
      headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf },
      payload: { mainFileId: folder.id },
    });
    expect(folderSelect.statusCode).toBe(400);
  });
});
