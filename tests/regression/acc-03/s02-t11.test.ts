import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { S3StorageAdapter } from "../../../packages/storage/src/s3.js";
import { createServer } from "../../../apps/api/src/server.js";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

loadEnvFile(".env");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64",
);

describe("S02-T11 avatar account authorization", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let app: ReturnType<typeof createServer>;
  beforeAll(async () => {
    fixture = await createSessionFixture();
    await fixture.db.query(
      readFileSync(
        resolve(import.meta.dirname, "../../../packages/db/migrations/0004-avatar-cleanup.sql"),
        "utf8",
      ),
    );
    const config = parseServerConfig(process.env);
    const storage = new S3StorageAdapter({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    });
    await storage.ensureBucketExists();
    app = createServer({
      checkReadiness: async () => true,
      db: fixture.db,
      storage,
      origin,
      logger: false,
    });
  });
  afterAll(async () => {
    await app.close();
    await fixture.close();
  });

  it("rejects invalid image bytes, forged CSRF/Origin, and another user's target", async () => {
    const owner = await fixture.seed();
    const foreign = await fixture.seed();
    const signed = await fixture.login(owner.email);
    const headers = {
      origin,
      cookie: String(signed.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(signed.headers["x-csrf-token"]),
      "content-type": "image/png",
    };
    const upload = (url: string, supplied: Record<string, string>, payload: Buffer) =>
      app.inject({ method: "POST", url, headers: supplied, payload });
    expect(
      (await upload("/api/v1/me/avatar", headers, Buffer.from("not-an-image"))).statusCode,
    ).toBe(400);
    const corruptPng = Buffer.from(png);
    corruptPng[20] = corruptPng[20]! ^ 1;
    expect((await upload("/api/v1/me/avatar", headers, corruptPng)).statusCode).toBe(400);
    expect(
      (await upload("/api/v1/me/avatar", { ...headers, "content-type": "image/jpeg" }, png))
        .statusCode,
    ).toBe(400);
    expect(
      (await upload("/api/v1/me/avatar", { ...headers, "x-csrf-token": "forged" }, png)).statusCode,
    ).toBe(403);
    expect(
      (await upload("/api/v1/me/avatar", { ...headers, origin: "https://foreign.example" }, png))
        .statusCode,
    ).toBe(403);
    expect((await upload(`/api/v1/me/avatar?userId=${foreign.id}`, headers, png)).statusCode).toBe(
      400,
    );
    expect((await upload("/api/v1/me/avatar", headers, Buffer.alloc(1_000_001))).statusCode).toBe(
      413,
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/me/avatar/content?userId=${foreign.id}`,
          headers,
        })
      ).statusCode,
    ).toBe(400);
    const own = await fixture.db.query<{ avatar_key: string | null }>(
      "SELECT avatar_key FROM users WHERE id = $1",
      [owner.id],
    );
    const other = await fixture.db.query<{ avatar_key: string | null }>(
      "SELECT avatar_key FROM users WHERE id = $1",
      [foreign.id],
    );
    expect(own.rows[0]!.avatar_key).toBeNull();
    expect(other.rows[0]!.avatar_key).toBeNull();
  });

  it("does not expose an avatar to another account or disabled account", async () => {
    const owner = await fixture.seed();
    const foreign = await fixture.seed();
    const ownerLogin = await fixture.login(owner.email);
    const foreignLogin = await fixture.login(foreign.email);
    const ownerHeaders = {
      origin,
      cookie: String(ownerLogin.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(ownerLogin.headers["x-csrf-token"]),
      "content-type": "image/png",
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/me/avatar",
          headers: ownerHeaders,
          payload: png,
        })
      ).statusCode,
    ).toBe(200);
    const foreignHeaders = {
      origin,
      cookie: String(foreignLogin.headers["set-cookie"]).split(";")[0]!,
    };
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/me/avatar/content",
          headers: foreignHeaders,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/me/avatar/content", headers: { origin } }))
        .statusCode,
    ).toBe(401);
    await fixture.db.query("UPDATE users SET disabled_at = NOW() WHERE id = $1", [owner.id]);
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/me/avatar/content", headers: ownerHeaders }))
        .statusCode,
    ).toBe(403);
  });
});
