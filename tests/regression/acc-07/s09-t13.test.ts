import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { generateUserExportData } from "../../../apps/jobs/src/exports/user-data.js";

describe("Regression ACC-07 (S09-T13): Export user data GDPR compliance and secret isolation", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };
  let stranger: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();
    stranger = await fixture.seed();

    // Stranger's private project
    await fixture.db.query(
      `INSERT INTO projects (title, owner_id, status) VALUES ($1, $2, 'active')`,
      [`Stranger Secret Project ${randomUUID()}`, stranger.id],
    );

    // Stranger's tag
    await fixture.db.query(
      `INSERT INTO project_tags (user_id, name, color) VALUES ($1, 'Stranger Tag', '#999999')`,
      [stranger.id],
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("ensures export contains zero data or tags from unshared foreign users", async () => {
    const exportBundle = await generateUserExportData(fixture.db, user.id);

    // Should not contain stranger's tag
    expect(exportBundle.tags.some((t) => t.name === "Stranger Tag")).toBe(false);

    // Should not contain stranger's project
    expect(
      exportBundle.ownedProjects.some((p) => p.title.includes("Stranger Secret Project")),
    ).toBe(false);
  });
});
