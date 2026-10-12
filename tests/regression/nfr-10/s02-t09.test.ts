import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { writeAuditEvent } from "../../../packages/db/src/repositories/audit.js";
import { createSessionFixture } from "../../helpers/s02-session.js";

let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
beforeAll(async () => {
  fixture = await createSessionFixture();
});
afterAll(async () => {
  await fixture.close();
});

it("ignores caller-supplied password, token, source and metadata when writing an event", async () => {
  const actor = await fixture.seed();
  const requestId = randomUUID();
  const targetId = randomUUID();
  const hostile = {
    action: "session.revoked" as const,
    actorId: actor.id,
    targetId,
    requestId,
    password: "private-password-marker",
    token: "private-token-marker",
    source: "private-source-marker",
    metadataRedacted: { source: "private-source-marker" },
  };
  await fixture.db.transaction((tx) => writeAuditEvent(tx, hostile));
  const stored = await fixture.db.query<{
    metadata_redacted: unknown;
    action: string;
    target_id: string;
  }>("SELECT metadata_redacted, action, target_id FROM audit_events WHERE request_id = $1", [
    requestId,
  ]);
  expect(stored.rows).toEqual([
    { metadata_redacted: {}, action: "session.revoked", target_id: targetId },
  ]);
  expect(JSON.stringify(stored.rows)).not.toContain("private-");
});
