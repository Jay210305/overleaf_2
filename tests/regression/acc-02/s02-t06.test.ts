import { expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";

it("rate limiting does not bypass Origin and CSRF denial", async () => {
  const app = createServer({
    checkReadiness: async () => true,
    origin: "http://127.0.0.1:5173",
    rateLimiter: { consume: async () => ({ allowed: true, retryAfterSeconds: 0 }) },
    logger: false,
  });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin: "http://evil.example", "x-csrf-token": "forged-header" },
      payload: { email: "writer@example.test", password: "correct-password-123" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("CSRF_DENIED");
  } finally {
    await app.close();
  }
});

it.each([
  ["POST", "/api/v1/auth/register"],
  ["POST", "/api/v1/auth/verify-email"],
  ["POST", "/api/v1/auth/login"],
  ["GET", "/api/v1/auth/session"],
  ["POST", "/api/v1/auth/logout"],
  ["POST", "/api/v1/auth/password/forgot"],
  ["POST", "/api/v1/auth/password/reset"],
])("limits %s %s before invoking its handler", async (method, url) => {
  const app = createServer({
    checkReadiness: async () => true,
    origin: "http://127.0.0.1:5173",
    rateLimiter: { consume: async () => ({ allowed: false, retryAfterSeconds: 12 }) },
    logger: false,
  });
  try {
    const response = await app.inject({
      method: method as "GET" | "POST",
      url,
      headers: { origin: "http://127.0.0.1:5173" },
    });
    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBe("12");
    expect(response.headers["access-control-expose-headers"]).toContain("retry-after");
  } finally {
    await app.close();
  }
});
