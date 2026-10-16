import { createHash } from "node:crypto";
import { createClient } from "redis";

export interface AuthRateLimiter {
  consume(ip: string, scope: string): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

const incrementWindow = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

const limits: Record<string, number> = {
  "POST /api/v1/auth/register": 5,
  "POST /api/v1/auth/verify-email": 10,
  "POST /api/v1/auth/login": 10,
  "GET /api/v1/auth/session": 60,
  "POST /api/v1/auth/logout": 60,
  "POST /api/v1/auth/password/forgot": 5,
  "POST /api/v1/auth/password/reset": 10,
  "GET /api/v1/me": 60,
  "PATCH /api/v1/me": 30,
  "GET /api/v1/me/preferences": 60,
  "PATCH /api/v1/me/preferences": 30,
  "GET /api/v1/me/sessions": 60,
  "GET /api/v1/me/sessions/:sessionId": 60,
  "DELETE /api/v1/me/sessions/:sessionId": 30,
  "POST /api/v1/me/password": 10,
  "POST /api/v1/me/avatar": 10,
  "GET /api/v1/me/avatar/content": 60,
};

export async function createRedisAuthRateLimiter(
  url: string,
  options: { namespace?: string; limit?: number; windowMs?: number } = {},
) {
  const namespace = options.namespace ?? "auth:v1";
  const windowMs = options.windowMs ?? 60_000;
  if (!/^[A-Za-z0-9:-]+$/.test(namespace) || windowMs < 1000 || windowMs > 3_600_000)
    throw new Error("Invalid rate-limit configuration");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1))
    throw new Error("Invalid rate-limit configuration");
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 1500, reconnectStrategy: (retries) => Math.min(retries * 100, 1000) },
  });
  client.on("error", () => {
    // Requests fail closed in consume; connection details must not enter logs.
  });
  await client.connect();
  return {
    async consume(ip: string, scope: string) {
      const limit = options.limit ?? limits[scope];
      if (!limit) throw new Error("Unsupported auth rate-limit scope");
      const identity = createHash("sha256").update(ip).digest("hex");
      const route = createHash("sha256").update(scope).digest("hex").slice(0, 16);
      const key = `${namespace}:${route}:${identity}`;
      const result = await client.eval(incrementWindow, {
        keys: [key],
        arguments: [String(windowMs)],
      });
      if (!Array.isArray(result) || result.length !== 2)
        throw new Error("Invalid rate-limit response");
      const count = Number(result[0]);
      const ttl = Number(result[1]);
      if (!Number.isSafeInteger(count) || !Number.isSafeInteger(ttl) || ttl < 0)
        throw new Error("Invalid rate-limit response");
      return {
        allowed: count <= limit,
        retryAfterSeconds: count <= limit ? 0 : Math.max(1, Math.ceil(ttl / 1000)),
      };
    },
    async close() {
      if (client.isOpen) client.destroy();
    },
  } satisfies AuthRateLimiter & { close(): Promise<void> };
}
