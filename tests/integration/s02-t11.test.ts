import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "../../packages/db/src/client.js";
import { S3StorageAdapter } from "../../packages/storage/src/s3.js";
import { createServer } from "../../apps/api/src/server.js";
import { origin } from "../helpers/s02-session.js";
import argon2 from "argon2";
import { randomUUID } from "node:crypto";

loadEnvFile(".env");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

describe("S02-T11 private avatar lifecycle", () => {
  let db: DatabaseClient;
  let storage: S3StorageAdapter;
  let app: ReturnType<typeof createServer>;
  beforeAll(async () => {
    const config = parseServerConfig(process.env);
    db = new DatabaseClient(config.DATABASE_URL);
    for (const name of [
      "0001-core.sql",
      "0002-support.sql",
      "0003-session-security.sql",
      "0004-avatar-cleanup.sql",
    ])
      await db.query(
        readFileSync(resolve(import.meta.dirname, `../../packages/db/migrations/${name}`), "utf8"),
      );
    storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    await storage.ensureBucketExists();
    app = createServer({ checkReadiness: async () => true, db, storage, origin, logger: false });
  });
  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it("stores a bounded avatar privately and exposes it only through the current account", async () => {
    const email = `avatar-${randomUUID()}@example.test`;
    const inserted = await db.query<{ id: string }>(
      "INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at) VALUES ($1, 'Avatar User', $2, NOW()) RETURNING id",
      [email, await argon2.hash("correct-password-123", { type: argon2.argon2id })],
    );
    const userId = inserted.rows[0]!.id;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      payload: { email, password: "correct-password-123" },
    });
    const headers = {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(login.headers["x-csrf-token"]),
    };
    const uploaded = await app.inject({
      method: "POST",
      url: "/api/v1/me/avatar",
      headers: { ...headers, "content-type": "image/png" },
      payload: png,
    });
    expect(uploaded.statusCode).toBe(200);
    const key = await db.query<{ avatar_key: string }>(
      "SELECT avatar_key FROM users WHERE id = $1",
      [userId],
    );
    expect(key.rows[0]!.avatar_key).toMatch(new RegExp(`^avatars/${userId}/`));
    expect(await storage.head(key.rows[0]!.avatar_key)).not.toBeNull();
    const profile = await app.inject({ method: "GET", url: "/api/v1/me", headers });
    expect(profile.json().avatarUrl).toBe("/api/v1/me/avatar/content");
    const image = await app.inject({ method: "GET", url: "/api/v1/me/avatar/content", headers });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.rawPayload).toEqual(png);
  });

  it("schedules the previous private blob for cleanup when an avatar is replaced", async () => {
    const email = `avatar-replace-${randomUUID()}@example.test`;
    const inserted = await db.query<{ id: string }>(
      "INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at) VALUES ($1, 'Replacement User', $2, NOW()) RETURNING id",
      [email, await argon2.hash("correct-password-123", { type: argon2.argon2id })],
    );
    const userId = inserted.rows[0]!.id;
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: { origin, "x-csrf-token": "login-bootstrap" },
      payload: { email, password: "correct-password-123" },
    });
    const headers = {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(login.headers["x-csrf-token"]),
      "content-type": "image/png",
    };
    expect(
      (await app.inject({ method: "POST", url: "/api/v1/me/avatar", headers, payload: png }))
        .statusCode,
    ).toBe(200);
    const first = await db.query<{ avatar_key: string }>(
      "SELECT avatar_key FROM users WHERE id = $1",
      [userId],
    );
    expect(
      (await app.inject({ method: "POST", url: "/api/v1/me/avatar", headers, payload: png }))
        .statusCode,
    ).toBe(200);
    const second = await db.query<{ avatar_key: string }>(
      "SELECT avatar_key FROM users WHERE id = $1",
      [userId],
    );
    expect(second.rows[0]!.avatar_key).not.toBe(first.rows[0]!.avatar_key);
    const queued = await db.query<{ object_key: string; processed_at: Date | null }>(
      "SELECT object_key, processed_at FROM avatar_cleanup_jobs WHERE user_id = $1 AND object_key = $2",
      [userId, first.rows[0]!.avatar_key],
    );
    expect(queued.rows).toEqual([{ object_key: first.rows[0]!.avatar_key, processed_at: null }]);
    expect(await storage.head(first.rows[0]!.avatar_key)).not.toBeNull();
    expect(await storage.head(second.rows[0]!.avatar_key)).not.toBeNull();
    const avatarModule =
      (await import("../../apps/api/src/modules/account/avatar.js")) as unknown as {
        processAvatarCleanup?: (
          database: DatabaseClient,
          objects: S3StorageAdapter,
        ) => Promise<void>;
      };
    expect(avatarModule.processAvatarCleanup).toBeTypeOf("function");
    await avatarModule.processAvatarCleanup!(db, storage);
    expect(await storage.head(first.rows[0]!.avatar_key)).toBeNull();
    expect(await storage.head(second.rows[0]!.avatar_key)).not.toBeNull();
    const completed = await db.query<{ processed_at: Date | null }>(
      "SELECT processed_at FROM avatar_cleanup_jobs WHERE object_key = $1",
      [first.rows[0]!.avatar_key],
    );
    expect(completed.rows[0]!.processed_at).not.toBeNull();
  });
});
