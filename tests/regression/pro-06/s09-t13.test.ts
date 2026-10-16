import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture } from "../../helpers/s02-session.js";
import { createUserExportArchive } from "../../../apps/jobs/src/exports/user-data.js";

describe("Regression PRO-06 (S09-T13): Export access validity and expiration rules", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("produces expiring download authorization and valid structure", async () => {
    const archive = await createUserExportArchive(fixture.db, user.id);

    expect(archive.exportId).toBeDefined();
    expect(archive.downloadUrl).toContain(archive.exportId);

    // Verify expiry is in the future
    const now = Date.now();
    const expiryTime = new Date(archive.expiresAt).getTime();
    expect(expiryTime).toBeGreaterThan(now);
    // Expiration should not exceed 48 hours
    expect(expiryTime - now).toBeLessThanOrEqual(48 * 60 * 60 * 1000);
  });
});
