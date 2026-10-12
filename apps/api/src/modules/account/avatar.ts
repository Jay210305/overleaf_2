import { randomUUID } from "node:crypto";
import { inflateSync } from "node:zlib";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseClient } from "@latex-collab/db";
import type { StorageAdapter } from "@latex-collab/storage";
import { assertAvatarKeyScope } from "@latex-collab/storage";
import { requireSession } from "../../plugins/require-session.js";
import { requireSessionCsrf } from "../../plugins/csrf.js";
import { problem } from "../../plugins/errors.js";
import { AuthError } from "../auth/errors.js";
import { readProfile } from "./profile.js";

const maxAvatarBytes = 1_000_000;
const maxSide = 1024;
const absoluteMs = 30 * 24 * 60 * 60 * 1000;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const avatarPath = "/api/v1/me/avatar/content";

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function validPng(bytes: Buffer): boolean {
  if (bytes.length < 57 || bytes.length > maxAvatarBytes || !bytes.subarray(0, 8).equals(signature))
    return false;
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  let ended = false;
  const compressed: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (length > maxAvatarBytes || end > bytes.length) return false;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 4, offset + 8 + length);
    if (crc32(chunk) !== bytes.readUInt32BE(offset + 8 + length)) return false;
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset === 8 && type !== "IHDR") return false;
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) return false;
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = ({ 0: 1, 2: 3, 4: 2, 6: 4 } as Record<number, number>)[body[9]!] ?? 0;
      if (
        width < 1 ||
        width > maxSide ||
        height < 1 ||
        height > maxSide ||
        body[8] !== 8 ||
        !channels ||
        body[10] !== 0 ||
        body[11] !== 0 ||
        body[12] !== 0
      )
        return false;
    } else if (type === "IDAT") compressed.push(body);
    else if (type === "IEND") {
      if (length !== 0 || compressed.length === 0 || end !== bytes.length) return false;
      ended = true;
      break;
    } else if (type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90) return false;
    offset = end;
  }
  if (!ended) return false;
  const rowLength = width * channels + 1;
  const expected = rowLength * height;
  try {
    const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected + 1 });
    if (pixels.length !== expected) return false;
    for (let row = 0; row < height; row++) if (pixels[row * rowLength]! > 4) return false;
  } catch {
    return false;
  }
  return true;
}

function reject(reply: FastifyReply, request: FastifyRequest, error: AuthError) {
  return reply
    .code(error.status)
    .type("application/problem+json")
    .send(problem(error.status, error.code, request.id));
}

export function registerAvatarRoutes(
  app: FastifyInstance,
  options: {
    db?: DatabaseClient | undefined;
    storage?: StorageAdapter | undefined;
    origin?: string | undefined;
    secureCookies: boolean;
  },
): void {
  app.addContentTypeParser(
    ["image/png", "image/jpeg", "image/webp"],
    {
      parseAs: "buffer",
      bodyLimit: maxAvatarBytes,
    },
    (_request, body, done) => done(null, body),
  );

  app.post("/api/v1/me/avatar", async (request, reply) => {
    try {
      if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const current = await requireSession(
        options.db,
        request,
        options.origin,
        options.secureCookies,
        true,
      );
      if (
        Object.keys(request.query as object).length ||
        request.headers["content-type"] !== "image/png" ||
        !Buffer.isBuffer(request.body) ||
        !validPng(request.body)
      )
        throw new AuthError(400, "VALIDATION_ERROR");
      const key = `avatars/${current.userId}/${randomUUID()}.png`;
      try {
        await options.storage.put(key, request.body, "image/png");
      } catch {
        throw new AuthError(503, "SERVICE_UNAVAILABLE");
      }
      try {
        await options.db.transaction(async (tx) => {
          const found = await tx.query<{
            avatar_key: string | null;
            csrf_hash: string | null;
            expires_at: Date;
            created_at: Date;
            revoked_at: Date | null;
            disabled_at: Date | null;
            email_verified_at: Date | null;
          }>(
            `SELECT u.avatar_key, s.csrf_hash, s.expires_at, s.created_at, s.revoked_at, u.disabled_at, u.email_verified_at
             FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.user_id = $2 FOR UPDATE OF s, u`,
            [current.sessionId, current.userId],
          );
          const row = found.rows[0];
          if (
            !row ||
            row.revoked_at ||
            row.expires_at.getTime() <= Date.now() ||
            row.created_at.getTime() + absoluteMs <= Date.now()
          )
            throw new AuthError(401, "AUTHENTICATION_REQUIRED");
          if (row.disabled_at || !row.email_verified_at)
            throw new AuthError(403, "ACCOUNT_DISABLED");
          requireSessionCsrf(request.headers["x-csrf-token"], row.csrf_hash);
          if (row.avatar_key) assertAvatarKeyScope(row.avatar_key, current.userId);
          await tx.query("UPDATE users SET avatar_key = $1 WHERE id = $2", [key, current.userId]);
          if (row.avatar_key)
            await tx.query(
              "INSERT INTO avatar_cleanup_jobs (user_id, object_key) VALUES ($1, $2) ON CONFLICT (object_key) DO NOTHING",
              [current.userId, row.avatar_key],
            );
        });
      } catch (error) {
        try {
          await options.storage.delete(key);
        } catch {
          /* Orphan reconciliation remains a storage operation. */
        }
        throw error;
      }
      return reply.code(200).send(await readProfile(options.db, current.userId));
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });

  app.get(avatarPath, async (request, reply) => {
    try {
      if (!options.db || !options.storage) throw new AuthError(503, "SERVICE_UNAVAILABLE");
      const current = await requireSession(
        options.db,
        request,
        options.origin,
        options.secureCookies,
      );
      if (Object.keys(request.query as object).length) throw new AuthError(400, "VALIDATION_ERROR");
      const found = await options.db.query<{ avatar_key: string | null }>(
        "SELECT avatar_key FROM users WHERE id = $1",
        [current.userId],
      );
      const key = found.rows[0]?.avatar_key;
      if (!key) throw new AuthError(404, "RESOURCE_NOT_FOUND");
      assertAvatarKeyScope(key, current.userId);
      let bytes: Uint8Array;
      try {
        bytes = await options.storage.get(key);
      } catch {
        throw new AuthError(503, "SERVICE_UNAVAILABLE");
      }
      return reply.type("image/png").code(200).send(Buffer.from(bytes));
    } catch (error) {
      if (error instanceof AuthError) return reject(reply, request, error);
      throw error;
    }
  });
}

/** Retryable, bounded cleanup of replaced avatars. A live profile reference is never deleted. */
export async function processAvatarCleanup(
  db: DatabaseClient,
  storage: StorageAdapter,
  batchSize = 10,
): Promise<void> {
  for (let index = 0; index < batchSize; index++) {
    const found = await db.transaction(async (tx) => {
      const pending = await tx.query<{ id: string; user_id: string; object_key: string }>(
        `SELECT id, user_id, object_key FROM avatar_cleanup_jobs
         WHERE processed_at IS NULL AND scheduled_at <= NOW()
         ORDER BY scheduled_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const job = pending.rows[0];
      if (!job) return false;
      const stillUsed = await tx.query<{ id: string }>(
        "SELECT id FROM users WHERE avatar_key = $1 LIMIT 1",
        [job.object_key],
      );
      if (stillUsed.rows.length) {
        await tx.query(
          "UPDATE avatar_cleanup_jobs SET attempts = attempts + 1, last_attempt_at = NOW(), scheduled_at = NOW() + interval '5 minutes' WHERE id = $1",
          [job.id],
        );
        return true;
      }
      try {
        assertAvatarKeyScope(job.object_key, job.user_id);
        await storage.delete(job.object_key);
        await tx.query("UPDATE avatar_cleanup_jobs SET processed_at = NOW() WHERE id = $1", [
          job.id,
        ]);
      } catch {
        await tx.query(
          "UPDATE avatar_cleanup_jobs SET attempts = attempts + 1, last_attempt_at = NOW(), scheduled_at = NOW() + interval '5 minutes' WHERE id = $1",
          [job.id],
        );
      }
      return true;
    });
    if (!found) break;
  }
}
