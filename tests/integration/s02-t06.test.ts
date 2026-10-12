import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { createServer } from "../../apps/api/src/server.js";
import { createRedisAuthRateLimiter } from "../../apps/api/src/plugins/rate-limit.js";
import { createSessionFixture, origin } from "../helpers/s02-session.js";

describe("S02-T06 distributed authentication rate limit", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;

  beforeAll(async () => {
    fixture = await createSessionFixture();
  });
  afterAll(async () => fixture.close());

  it("returns 429 and Retry-After across two API replicas without distinguishing recovery accounts", async () => {
    const namespace = `s02-t06-${randomUUID()}`;
    const url = parseServerConfig(process.env).REDIS_URL;
    const first = await createRedisAuthRateLimiter(url, { namespace, limit: 2, windowMs: 60_000 });
    const second = await createRedisAuthRateLimiter(url, { namespace, limit: 2, windowMs: 60_000 });
    const createApp = (rateLimiter: typeof first) =>
      createServer({
        checkReadiness: async () => true,
        db: fixture.db,
        origin,
        sendPasswordReset: async () => {},
        rateLimiter,
        logger: false,
      });
    const appA = createApp(first);
    const appB = createApp(second);
    const request = (app: typeof appA, email: string) =>
      app.inject({
        method: "POST",
        url: "/api/v1/auth/password/forgot",
        headers: { origin, "x-csrf-token": "recovery-bootstrap" },
        payload: { email },
      });
    try {
      const unknown = `unknown-${randomUUID()}@example.test`;
      const firstResult = await request(appA, unknown);
      const secondResult = await request(appB, `other-${randomUUID()}@example.test`);
      expect(firstResult.statusCode).toBe(202);
      expect(secondResult.statusCode).toBe(202);
      expect(firstResult.body).toBe(secondResult.body);
      const limited = await request(appA, unknown);
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toMatch(/^[1-9][0-9]*$/);
      expect(limited.headers["content-type"]).toContain("application/problem+json");
      expect(limited.json().code).toBe("RATE_LIMITED");
      expect(limited.body).not.toContain(unknown);
    } finally {
      await appA.close();
      await appB.close();
      await first.close();
      await second.close();
    }
  });

  it("fails closed on limiter outage instead of letting authentication proceed", async () => {
    const app = createServer({
      checkReadiness: async () => true,
      origin,
      rateLimiter: {
        consume: async () => {
          throw new Error("redis-secret-connection");
        },
      },
      logger: false,
    });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: { origin, "x-csrf-token": "login-bootstrap" },
        payload: { email: "writer@example.test", password: "correct-password-123" },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe("SERVICE_UNAVAILABLE");
      expect(response.body).not.toContain("redis-secret-connection");
    } finally {
      await app.close();
    }
  });

  it("increments atomically and releases the short window after expiry", async () => {
    const limiter = await createRedisAuthRateLimiter(parseServerConfig(process.env).REDIS_URL, {
      namespace: `s02-t06-${randomUUID()}`,
      limit: 2,
      windowMs: 1000,
    });
    try {
      const attempts = await Promise.all(
        Array.from({ length: 8 }, () => limiter.consume("127.0.0.1", "POST /api/v1/auth/login")),
      );
      expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(2);
      expect(attempts.filter((attempt) => !attempt.allowed)).toHaveLength(6);
      expect(attempts.find((attempt) => !attempt.allowed)?.retryAfterSeconds).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect((await limiter.consume("127.0.0.1", "POST /api/v1/auth/login")).allowed).toBe(true);
    } finally {
      await limiter.close();
    }
  });
});
