import { describe, it, expect } from "vitest";
import { createServer } from "../../apps/api/src/server";
describe("S00 API health", () => {
  it("keeps live separate from failed readiness", async () => {
    const app = createServer({ checkReadiness: async () => false, logger: false });
    expect((await app.inject("/api/v1/health/live")).statusCode).toBe(200);
    const ready = await app.inject("/api/v1/health/ready");
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      requestId: expect.any(String),
    });
    await app.close();
  });
  it("reports real successful readiness and controlled not-found", async () => {
    const app = createServer({ checkReadiness: async () => true, logger: false });
    expect((await app.inject("/api/v1/health/ready")).json()).toMatchObject({ status: "ready" });
    const missing = await app.inject("/api/v1/projects");
    expect(missing.statusCode).toBe(404);
    expect(missing.headers["content-type"]).toContain("application/problem+json");
    await app.close();
  });
});
it("redacts internal errors and ignores untrusted request IDs", async () => {
  const app = createServer({
    checkReadiness: async () => {
      throw new Error("token-secret-private-source");
    },
    logger: false,
  });
  const response = await app.inject({
    url: "/api/v1/health/ready",
    headers: { "x-request-id": "private-source" },
  });
  expect(response.body).not.toContain("private-source");
  expect(response.statusCode).toBe(503);
  await app.close();
});
it("central error handler preserves status without private details", async () => {
  const app = createServer({ checkReadiness: async () => true, logger: false });
  app.get("/error", () => {
    throw new Error("private manuscript");
  });
  app.get("/invalid", () => {
    throw Object.assign(new Error("private password"), { statusCode: 400 });
  });
  const error = await app.inject("/error");
  expect(error.statusCode).toBe(500);
  expect(error.body).not.toContain("private");
  expect((await app.inject("/invalid")).statusCode).toBe(400);
  await app.close();
});
it("serves exact-origin CORS and uses generated IDs in default logs", async () => {
  const app = createServer({ checkReadiness: async () => true, origin: "http://localhost:5173" });
  const response = await app.inject({
    url: "/api/v1/health/live",
    headers: { origin: "http://localhost:5173", "x-request-id": "untrusted-value" },
  });
  expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  expect(response.headers["x-request-id"]).not.toBe("untrusted-value");
  await app.close();
});
