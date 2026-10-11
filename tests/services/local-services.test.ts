import { loadEnvFile } from "node:process";
import { describe, it, expect } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { createReadiness } from "../../apps/api/src/readiness";
loadEnvFile(".env");
describe("S00 real dependencies", () => {
  it("checks PostgreSQL, Redis, private bucket and Mailpit", async () => {
    const probes = createReadiness(parseServerConfig(process.env));
    try {
      expect(await probes.check()).toBe(true);
    } finally {
      await probes.close();
    }
  });
  it("fails readiness on an unreachable dependency", async () => {
    const config = parseServerConfig(process.env);
    const probes = createReadiness({ ...config, REDIS_URL: "redis://127.0.0.1:1" });
    try {
      expect(await probes.check()).toBe(false);
    } finally {
      await probes.close();
    }
  });
  it("bucket denies anonymous reads", async () => {
    const config = parseServerConfig(process.env);
    const response = await fetch(`${config.S3_ENDPOINT}/${config.S3_BUCKET}`);
    expect(response.status).toBe(403);
  });
});
