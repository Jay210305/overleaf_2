import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMentionNotifications } from "../../../apps/api/src/modules/notifications/mentions.js";
import { createSessionFixture } from "../../helpers/s02-session.js";

describe("S08-T06 mention delivery idempotency", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(
          import.meta.dirname,
          "../../../packages/db/migrations/0012-notification-idempotency.sql",
        ),
        "utf8",
      ),
    );
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it("stores one notification for repeated publication of the same source", async () => {
    const owner = await fixture.seed();
    const member = await fixture.seed();
    const projectId = randomUUID();
    const sourceId = randomUUID();
    await fixture.db.query("INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Dedupe')", [
      projectId,
      owner.id,
    ]);
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'REVIEWER')",
      [projectId, member.id],
    );
    await fixture.db.transaction(async (tx) => {
      await createMentionNotifications(tx, projectId, sourceId, owner.id, [member.id]);
      await createMentionNotifications(tx, projectId, sourceId, owner.id, [member.id]);
    });
    const found = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM notifications WHERE user_id = $1 AND payload_json->>'sourceId' = $2",
      [member.id, sourceId],
    );
    expect(found.rows[0]?.count).toBe("1");
  });
});
