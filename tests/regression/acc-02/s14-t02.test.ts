import { describe, expect, it } from "vitest";
import {
  InMemoryGitTokenStore,
  generateGitToken,
  hashGitToken,
  parseBasicAuth,
} from "../../../apps/git-bridge/src/auth.js";

describe("Regression ACC-02 (S14-T02): Opaque token generation, hash storage, expiry, and revocation inventory", () => {
  it("generates opaque tokens with prefix and stores only cryptographic hashes", () => {
    const { rawToken, tokenHash } = generateGitToken();
    expect(rawToken.startsWith("glc_git_")).toBe(true);
    expect(rawToken.length).toBeGreaterThan(40);
    expect(tokenHash).toBe(hashGitToken(rawToken));
    expect(tokenHash).not.toEqual(rawToken);
  });

  it("parses Basic and Bearer Authorization headers safely without throwing", () => {
    expect(parseBasicAuth(undefined)).toBeNull();
    expect(parseBasicAuth("InvalidScheme foo")).toBeNull();
    expect(parseBasicAuth("Basic " + Buffer.from("user:pass").toString("base64"))).toEqual({
      username: "user",
      token: "pass",
    });
    expect(parseBasicAuth("Bearer glc_git_12345")).toEqual({
      username: "git",
      token: "glc_git_12345",
    });
    expect(parseBasicAuth("Basic invalid-base-64!!!")).toBeNull();
  });

  it("handles token expiration and revocation in token inventory", async () => {
    const store = new InMemoryGitTokenStore();
    const userId = "user-acc-02-test";

    // 1. Create active token
    const { token: token1, rawToken: raw1 } = await store.createToken({
      userId,
      name: "CLI Device 1",
      scopes: ["git:read"],
    });

    // 2. Create expired token
    const { token: token2, rawToken: raw2 } = await store.createToken({
      userId,
      name: "Old Laptop",
      scopes: ["git:read"],
      expiresAt: new Date(Date.now() - 10000), // expired 10s ago
    });

    // Active lookup
    expect(await store.findActiveToken(raw1)).not.toBeNull();
    expect(await store.findActiveToken(raw2)).toBeNull();

    // Inventory lists non-revoked tokens
    let inventory = await store.listTokens(userId);
    expect(inventory.some((t) => t.id === token1.id)).toBe(true);
    expect(inventory.some((t) => t.id === token2.id)).toBe(true);

    // Revoke token1
    const revoked = await store.revokeToken(token1.id, userId);
    expect(revoked).toBe(true);

    // After revocation, findActiveToken returns null
    expect(await store.findActiveToken(raw1)).toBeNull();

    // And inventory no longer includes revoked token1
    inventory = await store.listTokens(userId);
    expect(inventory.some((t) => t.id === token1.id)).toBe(false);
  });

  it("does not allow revoking tokens belonging to other users", async () => {
    const store = new InMemoryGitTokenStore();
    const { token } = await store.createToken({
      userId: "user-alpha",
      name: "Alpha token",
      scopes: ["git:read"],
    });

    const revokedByBeta = await store.revokeToken(token.id, "user-beta");
    expect(revokedByBeta).toBe(false);

    const revokedByAlpha = await store.revokeToken(token.id, "user-alpha");
    expect(revokedByAlpha).toBe(true);
  });
});
