import { describe, expect, it } from "vitest";
import { DatabaseClient } from "../../../packages/db/src/client.js";
import { seedDevelopment } from "../../../packages/db/seeds/development.js";

describe("PL-01 Seed Environment and Credential Protections", () => {
  it("strictly throws when NODE_ENV is set to production before any DB query", async () => {
    const prevEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      // Even with a dummy/closed DB client, it should fail immediately on NODE_ENV check
      const dummyClient = {} as DatabaseClient;
      await expect(seedDevelopment(dummyClient)).rejects.toThrow(
        "Production seed refuses fixed credentials",
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});
