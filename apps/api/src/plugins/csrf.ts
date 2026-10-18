import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { isOriginAllowed } from "@latex-collab/config/server";
import { AuthError } from "../modules/auth/errors.js";

export function requireExactOrigin(
  request: FastifyRequest,
  expected: string | readonly string[] | undefined,
): void {
  if (!expected || !isOriginAllowed(request.headers.origin, expected)) {
    throw new AuthError(403, "CSRF_DENIED");
  }
}

export function requireAnonymousCsrf(
  request: FastifyRequest,
  expected: string | readonly string[] | undefined,
): void {
  requireExactOrigin(request, expected);
  const value = request.headers["x-csrf-token"];
  if (typeof value !== "string" || value.length < 8 || value.length > 256)
    throw new AuthError(403, "CSRF_DENIED");
}

export function requireSessionCsrf(value: unknown, storedHash: string | null): void {
  if (
    typeof value !== "string" ||
    value.length < 32 ||
    value.length > 256 ||
    !storedHash ||
    !/^[0-9a-f]{64}$/.test(storedHash)
  )
    throw new AuthError(403, "CSRF_DENIED");
  const actual = createHash("sha256").update(value).digest();
  const expectedHash = Buffer.from(storedHash, "hex");
  if (!timingSafeEqual(actual, expectedHash)) throw new AuthError(403, "CSRF_DENIED");
}
