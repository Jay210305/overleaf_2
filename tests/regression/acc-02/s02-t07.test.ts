import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
beforeAll(async () => {
  fixture = await createSessionFixture();
});
afterAll(async () => fixture.close());

it("pages only the owner's active sessions and invalidates the current session when revoked", async () => {
  const owner = await fixture.seed();
  const first = await fixture.login(owner.email);
  const second = await fixture.login(owner.email);
  const cookie = String(first.headers["set-cookie"]).split(";")[0]!;
  const headers = { origin, cookie, "x-csrf-token": String(first.headers["x-csrf-token"]) };
  const firstPage = await fixture.app.inject({
    method: "GET",
    url: "/api/v1/me/sessions?limit=1",
    headers,
  });
  expect(firstPage.statusCode).toBe(200);
  expect(firstPage.json().items).toHaveLength(1);
  expect(firstPage.json().nextCursor).toEqual(expect.any(String));
  const next = await fixture.app.inject({
    method: "GET",
    url: `/api/v1/me/sessions?limit=1&cursor=${encodeURIComponent(firstPage.json().nextCursor)}`,
    headers,
  });
  expect(next.statusCode).toBe(200);
  expect(next.json().items).toHaveLength(1);
  expect(next.json().items[0].id).not.toBe(firstPage.json().items[0].id);
  expect(
    (await fixture.app.inject({ method: "GET", url: "/api/v1/me/sessions?cursor=bad", headers }))
      .statusCode,
  ).toBe(400);
  const malformedDate = Buffer.from(JSON.stringify({ createdAt: "0", id: randomUUID() })).toString(
    "base64url",
  );
  expect(
    (
      await fixture.app.inject({
        method: "GET",
        url: `/api/v1/me/sessions?cursor=${malformedDate}`,
        headers,
      })
    ).statusCode,
  ).toBe(400);
  const current = [...firstPage.json().items, ...next.json().items].find(
    (item: { current: boolean }) => item.current,
  );
  expect(current).toBeTruthy();
  const revoked = await fixture.app.inject({
    method: "DELETE",
    url: `/api/v1/me/sessions/${current.id}`,
    headers,
  });
  expect(revoked.statusCode).toBe(204);
  expect(String(revoked.headers["set-cookie"])).toContain("Max-Age=0");
  expect((await fixture.app.inject({ method: "GET", url: "/api/v1/me", headers })).statusCode).toBe(
    401,
  );
  expect(
    (
      await fixture.app.inject({
        method: "GET",
        url: "/api/v1/me",
        headers: { origin, cookie: String(second.headers["set-cookie"]).split(";")[0]! },
      })
    ).statusCode,
  ).toBe(200);
});

it("rate limits profile mutations before loading the account", async () => {
  const app = createServer({
    checkReadiness: async () => true,
    origin,
    logger: false,
    rateLimiter: { consume: async () => ({ allowed: false, retryAfterSeconds: 12 }) },
  });
  try {
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/preferences",
      headers: { origin, "x-csrf-token": "bad" },
      payload: { theme: "dark", marker: randomUUID() },
    });
    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("12");
  } finally {
    await app.close();
  }
});
