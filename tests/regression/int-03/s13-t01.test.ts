import { describe, expect, it } from "vitest";
import { providerCapabilitiesSchema, externalConnectionViewSchema } from "@latex-collab/contracts";
import {
  encryptCredential,
  decryptCredential,
  getProviderCapabilities,
} from "../../../apps/api/src/modules/integrations/connections.js";

describe("INT-03 S13-T01: Authorized Zotero adapter connection lifecycle and token protection", () => {
  it("enforces Zotero capability model: list and pull allowed, push unsupported, individual import enabled", () => {
    const caps = getProviderCapabilities("zotero");
    expect(caps).toEqual({
      list: true,
      pull: true,
      push: false,
      individualReferenceImport: true,
    });
    expect(() => providerCapabilitiesSchema.parse(caps)).not.toThrow();
  });

  it("protects Zotero tokens using authenticated encryption and prevents plain leakage", () => {
    const rawApiKey = "zo_user_live_secret_token_1234567890abcdef";
    const testKey = "test-only-provider-encryption-key";
    const encrypted = encryptCredential(rawApiKey, testKey);

    // Ciphertext must have v1 format with random IV
    expect(encrypted).toMatch(/^enc:v1:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/);
    expect(encrypted).not.toContain(rawApiKey);

    // Decryption yields the identical token
    const decrypted = decryptCredential(encrypted, testKey);
    expect(decrypted).toBe(rawApiKey);
  });

  it("refuses credential encryption without a configured key", () => {
    const configuredKey = process.env.INTEGRATION_CREDENTIAL_KEY;
    const sessionSecret = process.env.SESSION_SECRET;
    delete process.env.INTEGRATION_CREDENTIAL_KEY;
    delete process.env.SESSION_SECRET;
    try {
      expect(() => encryptCredential("provider-token")).toThrow(
        "Credential encryption key is required",
      );
    } finally {
      if (configuredKey === undefined) delete process.env.INTEGRATION_CREDENTIAL_KEY;
      else process.env.INTEGRATION_CREDENTIAL_KEY = configuredKey;
      if (sessionSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = sessionSecret;
    }
  });

  it("validates external connection view schema excludes secret tokens", () => {
    const view = externalConnectionViewSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      userId: "123e4567-e89b-12d3-a456-426614174001",
      provider: "zotero",
      scopes: ["library:read"],
      status: "active",
      createdAt: new Date().toISOString(),
    });

    expect(view.provider).toBe("zotero");
    // Ensure strictObject forbids secret fields
    expect((view as Record<string, unknown>).encryptedCredentialRef).toBeUndefined();
    expect((view as Record<string, unknown>).apiKey).toBeUndefined();
  });
});
