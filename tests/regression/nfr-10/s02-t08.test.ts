import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, safeLoggerOptions } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("NFR-10 S02-T08 real auth denial logs", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  const lines: string[] = [];

  beforeAll(async () => {
    fixture = await createSessionFixture();
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      origin,
      logger: {
        ...safeLoggerOptions(),
        stream: { write: (line: string) => lines.push(line) },
      },
    });
  });
  afterAll(async () => {
    await app.close();
    await fixture.close();
  });

  it("keeps cookies, CSRF, query tokens and private source out of captured route logs", async () => {
    const privateSource = `private-tex-${randomUUID()}`;
    const user = await fixture.seed();
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      payload: { email: user.email, password: "correct-password-123" },
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(login.headers["x-csrf-token"]);
    const denied = await app.inject({
      method: "PATCH",
      url: `/api/v1/me?token=${privateSource}`,
      headers: { origin, cookie, "x-csrf-token": "forged-csrf" },
      payload: { displayName: privateSource },
    });
    expect(denied.statusCode).toBe(403);
    await fixture.db.query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1", [user.id]);
    const revoked = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: { origin, cookie, "x-csrf-token": csrf },
    });
    expect(revoked.statusCode).toBe(401);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const captured = lines.join("\n");
    expect(captured).toContain(revoked.json().requestId);
    for (const sensitive of [privateSource, cookie, csrf, user.email, "forged-csrf"])
      expect(captured).not.toContain(sensitive);
  });
});
