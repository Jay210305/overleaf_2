import { loadEnvFile } from "node:process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGitHubAuthService } from "../../../apps/api/src/modules/integrations/github-auth.js";
import { createSessionFixture } from "../../helpers/s02-session.js";

loadEnvFile(".env");

/**
 * INT-05 scoped slice of S12-T01: the credential-handling step connects with a
 * typed ProviderResult carrying a connectionId and honest link-only
 * capabilities. Repo/branch linking and pull/push guards are S12-T02..T04 work.
 */
describe("S12-T01 INT-05 credential handling connects with link-only capabilities", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let userId: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    userId = (await fixture.seed()).id;
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  const service = () =>
    createGitHubAuthService({
      db: fixture.db,
      config: {
        clientId: "test-client",
        authorizationEndpoint: "https://github.test/authorize",
        tokenEndpoint: "https://github.test/token",
        callbackUrl: "http://127.0.0.1:5173/settings/integrations",
        scopes: ["repo"],
        encryptionKey: "regression-encryption-key-16!!",
      },
      exchangeCode: async () => ({ accessToken: "gho_int05_token", scope: "repo" }),
    });

  it("connects through one shared service with link-only capabilities", async () => {
    const shared = service();
    const started = await shared.start(userId);
    const result = await shared.connect(userId, { code: "any-code", state: started.state });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.connectionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.value.capabilities).toEqual({
        list: false,
        pull: false,
        push: false,
        individualReferenceImport: false,
      });
    }
  });

  it("never reports a synced state when the provider fails", async () => {
    const failing = createGitHubAuthService({
      db: fixture.db,
      config: {
        clientId: "test-client",
        authorizationEndpoint: "https://github.test/authorize",
        tokenEndpoint: "https://github.test/token",
        callbackUrl: "http://127.0.0.1:5173/settings/integrations",
        scopes: ["repo"],
        encryptionKey: "regression-encryption-key-16!!",
      },
      exchangeCode: async () => {
        throw new Error("provider down");
      },
    });
    const started = await failing.start(userId);
    await expect(failing.connect(userId, { code: "x", state: started.state })).rejects.toThrow();
  });
});
