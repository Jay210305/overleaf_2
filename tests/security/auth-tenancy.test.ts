import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S02-T08 cross-route authorization", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let user: Awaited<ReturnType<typeof fixture.seed>>;
  let projectId: string;
  const privateValue = `private-boundary-${randomUUID()}`;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    user = await fixture.seed();
    await fixture.db.query("UPDATE users SET display_name = $1 WHERE id = $2", [
      privateValue,
      user.id,
    ]);
    const project = await fixture.db.query<{ id: string }>(
      "INSERT INTO projects (owner_id, title) VALUES ($1, $2) RETURNING id",
      [user.id, privateValue],
    );
    projectId = project.rows[0]!.id;
    fixture.app.get(
      "/api/v1/projects/:projectId/s02-t08-private",
      { config: { projectAction: "READ" } },
      async () => ({ value: privateValue }),
    );
  });
  afterAll(async () => fixture.close());

  async function login() {
    const response = await fixture.login(user.email);
    expect(response.statusCode).toBe(200);
    return {
      origin,
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(response.headers["x-csrf-token"]),
    };
  }

  it("rejects a revoked cookie across account and project reads without private output", async () => {
    const headers = await login();
    const paths = [
      "/api/v1/me",
      "/api/v1/me/sessions",
      `/api/v1/projects/${projectId}/s02-t08-private`,
    ];
    for (const url of paths) {
      const valid = await fixture.app.inject({ method: "GET", url, headers });
      expect(valid.statusCode, url).toBe(200);
    }
    await fixture.db.query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1", [user.id]);
    for (const url of paths) {
      const denied = await fixture.app.inject({ method: "GET", url, headers });
      expect(denied.statusCode, url).toBe(401);
      expect(denied.body).not.toContain(privateValue);
      expect(denied.body).not.toContain(headers.cookie);
    }
  });

  it("denies a disabled account and forged mutation headers before modifying its profile", async () => {
    const headers = await login();
    const patch = (requestHeaders: Record<string, string>) =>
      fixture.app.inject({
        method: "PATCH",
        url: "/api/v1/me",
        headers: requestHeaders,
        payload: { displayName: "unwanted replacement" },
      });
    for (const forged of [
      { ...headers, origin: "https://foreign.example" },
      { ...headers, "x-csrf-token": "forged-secret" },
    ]) {
      const denied = await patch(forged);
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain(privateValue);
    }
    const unchanged = await fixture.db.query<{ display_name: string }>(
      "SELECT display_name FROM users WHERE id = $1",
      [user.id],
    );
    expect(unchanged.rows[0]!.display_name).toBe(privateValue);
    await fixture.db.query("UPDATE users SET disabled_at = NOW() WHERE id = $1", [user.id]);
    for (const url of ["/api/v1/me", `/api/v1/projects/${projectId}/s02-t08-private`]) {
      const denied = await fixture.app.inject({ method: "GET", url, headers });
      expect(denied.statusCode, url).toBe(403);
      expect(denied.body).not.toContain(privateValue);
    }
  });
});
