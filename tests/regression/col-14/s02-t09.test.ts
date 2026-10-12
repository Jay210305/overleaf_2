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

it("restricts audit actions and persists no denied or foreign mutation", async () => {
  const actor = await fixture.seed();
  const target = randomUUID();
  const requestId = randomUUID();
  await expect(
    fixture.db.transaction((tx) =>
      writeAuditEvent(tx, {
        action: "project.download" as "session.login",
        actorId: actor.id,
        targetId: target,
        requestId,
      }),
    ),
  ).rejects.toThrow();
  expect(
    (await fixture.db.query("SELECT id FROM audit_events WHERE request_id = $1", [requestId])).rows,
  ).toEqual([]);
  const denied = await fixture.app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { origin: "https://foreign.example", "x-csrf-token": "valid-bootstrap" },
    payload: { email: actor.email, password: "correct-password-123" },
  });
  expect(denied.statusCode).toBe(403);
  expect(
    (
      await fixture.db.query("SELECT id FROM audit_events WHERE request_id = $1", [
        denied.headers["x-request-id"],
      ])
    ).rows,
  ).toEqual([]);
});
