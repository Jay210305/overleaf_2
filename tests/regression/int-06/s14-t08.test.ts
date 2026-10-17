import { describe, expect, it } from "vitest";
import { InMemoryGitTokenStore, authenticateGitRequest } from "../../../apps/git-bridge/src/auth.js";
import {
  buildPackfile,
  createBlobObject,
  createCommitObject,
  createTreeObject,
  unpackPackfile,
  verifyFastForward,
} from "../../../apps/git-bridge/src/protocol.js";

describe("INT-06 S14-T08: Git HTTP token revocation, Unicode, binary packfiles, and fast-forward boundaries regression", () => {
  it("immediately invalidates revoked token across both read and write operations", async () => {
    const store = new InMemoryGitTokenStore();
    const tokenResult = await store.createToken({
      userId: "user-1111",
      name: "Revocable Token",
      scopes: ["git:read", "git:write"],
    });

    // Valid prior to revocation
    const authReadBefore = await authenticateGitRequest({
      tokenStore: store,
      authHeader: `Bearer ${tokenResult.rawToken}`,
      projectId: "proj-1",
      action: "read",
    });
    expect(authReadBefore.ok).toBe(true);

    const authWriteBefore = await authenticateGitRequest({
      tokenStore: store,
      authHeader: `Bearer ${tokenResult.rawToken}`,
      projectId: "proj-1",
      action: "write",
    });
    expect(authWriteBefore.ok).toBe(true);

    // Revoke
    const revoked = await store.revokeToken(tokenResult.token.id, "user-1111");
    expect(revoked).toBe(true);

    // Both read and write immediately fail
    const authReadAfter = await authenticateGitRequest({
      tokenStore: store,
      authHeader: `Bearer ${tokenResult.rawToken}`,
      projectId: "proj-1",
      action: "read",
    });
    expect(authReadAfter.ok).toBe(false);
    if (!authReadAfter.ok) {
      expect(authReadAfter.status).toBe(401);
      expect(authReadAfter.code).toBe("TOKEN_EXPIRED");
    }

    const authWriteAfter = await authenticateGitRequest({
      tokenStore: store,
      authHeader: `Bearer ${tokenResult.rawToken}`,
      projectId: "proj-1",
      action: "write",
    });
    expect(authWriteAfter.ok).toBe(false);
    if (!authWriteAfter.ok) {
      expect(authWriteAfter.status).toBe(401);
      expect(authWriteAfter.code).toBe("TOKEN_EXPIRED");
    }
  });

  it("enforces expiration timestamp on Git tokens", async () => {
    const store = new InMemoryGitTokenStore();
    const expiredToken = await store.createToken({
      userId: "user-2222",
      name: "Past Expiration",
      scopes: ["git:read", "git:write"],
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    });

    const authResult = await authenticateGitRequest({
      tokenStore: store,
      authHeader: `Bearer ${expiredToken.rawToken}`,
      projectId: "proj-2",
      action: "read",
    });
    expect(authResult.ok).toBe(false);
    if (!authResult.ok) {
      expect(authResult.status).toBe(401);
      expect(authResult.code).toBe("TOKEN_EXPIRED");
    }
  });

  it("preserves binary and Unicode files through packfile creation and unpacking", () => {
    // 1. Unicode text
    const unicodeText = "Texto en español con tildes (áéíóú), eñes (ñÑ), y caracteres matemáticos ∑∫√π";
    const unicodeBlob = createBlobObject(unicodeText);

    // 2. Binary buffer
    const binaryData = Buffer.from([0x00, 0xff, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xaa]);
    const binaryBlob = createBlobObject(binaryData);

    const tree = createTreeObject([
      { name: "documento.tex", sha: unicodeBlob.sha },
      { name: "imagen.png", sha: binaryBlob.sha },
    ]);

    const commit = createCommitObject({
      treeSha: tree.sha,
      message: "Commit with Unicode and binary assets",
    });

    const packfile = buildPackfile([
      { type: 1, raw: commit.raw },
      { type: 2, raw: tree.raw },
      { type: 3, raw: unicodeBlob.raw },
      { type: 3, raw: binaryBlob.raw },
    ]);

    // Unpack packfile and inspect blobs
    const unpacked = unpackPackfile(packfile);
    expect(unpacked.blobs.has(unicodeBlob.sha)).toBe(true);
    expect(unpacked.blobs.has(binaryBlob.sha)).toBe(true);

    const retrievedUnicode = unpacked.blobs.get(unicodeBlob.sha)!.toString("utf8");
    expect(retrievedUnicode).toBe(unicodeText);

    const retrievedBinary = unpacked.blobs.get(binaryBlob.sha)!;
    expect(Buffer.compare(binaryData, retrievedBinary)).toBe(0);
  });

  it("verifies fast-forward check rejects diverged and stale base revisions", () => {
    const currentTip = "1111111111111111111111111111111111111111";
    const newTip = "2222222222222222222222222222222222222222";
    const staleBase = "3333333333333333333333333333333333333333";

    // Matching base passes
    const validFf = verifyFastForward(
      { oldSha: currentTip, newSha: newTip, ref: "refs/heads/main" },
      currentTip,
    );
    expect(validFf.ok).toBe(true);

    // Stale base fails
    const invalidFf = verifyFastForward(
      { oldSha: staleBase, newSha: newTip, ref: "refs/heads/main" },
      currentTip,
    );
    expect(invalidFf.ok).toBe(false);
    if (!invalidFf.ok) {
      expect(invalidFf.error).toContain("non-fast-forward");
    }
  });
});
