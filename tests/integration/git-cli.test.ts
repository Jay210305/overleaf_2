import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryGitTokenStore } from "../../apps/git-bridge/src/auth.js";
import { createGitBridgeServer } from "../../apps/git-bridge/src/server.js";
import { createSessionFixture } from "../helpers/s02-session.js";

const execAsync = promisify(exec);

describe("S14-T08 / INT-06: Git CLI protocol, Unicode/binary handling, repeated sync, and token revocation", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let tokenStore: InMemoryGitTokenStore;
  let server: ReturnType<typeof createGitBridgeServer>;
  let serverUrl: string;
  let ownerUser: { id: string; email: string };
  let project: { id: string };
  let rawToken: string;
  let tokenId: string;
  let workDir: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    ownerUser = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status)
       VALUES ('S14-T08 Git CLI Test', $1, 'pdflatex', 'active')
       RETURNING id`,
      [ownerUser.id],
    );
    project = { id: projRes.rows[0]!.id };

    tokenStore = new InMemoryGitTokenStore();
    const tokenResult = await tokenStore.createToken({
      userId: ownerUser.id,
      name: "CLI Full Test Token",
      scopes: ["git:read", "git:write"],
    });
    rawToken = tokenResult.rawToken;
    tokenId = tokenResult.token.id;

    server = createGitBridgeServer({
      db: fixture.db,
      tokenStore,
    });

    const address = await server.listen({ port: 0, host: "127.0.0.1" });
    serverUrl = address;

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "s14-t08-cli-"));
  });

  afterAll(async () => {
    fs.rmSync(workDir, { recursive: true, force: true });
    await server.close();
    await fixture.close();
  });

  function getAuthedUrl(token: string): string {
    const encodedUser = encodeURIComponent(ownerUser.email);
    return `${serverUrl.replace("http://", `http://${encodedUser}:${token}@`)}/git/${project.id}.git`;
  }

  it("handles Unicode files and UTF-8 content across Git clone and push", async () => {
    const cloneDir = path.join(workDir, "repo-unicode");
    const authedUrl = getAuthedUrl(rawToken);

    await execAsync(`git clone ${authedUrl} ${cloneDir}`, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    await execAsync(`git config user.email "${ownerUser.email}"`, { cwd: cloneDir });
    await execAsync(`git config user.name "Unicode Author"`, { cwd: cloneDir });

    // Add file with UTF-8 characters: accents, symbols, CJK, emoji
    const unicodeContent = [
      "% UTF-8 Internationalization Test",
      "\\section{Introducción al Cálculo Diferencial}",
      "Demostración: $\\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi}$",
      "Caracteres especiales: ñ, á, é, í, ó, ú, ç, ü, ß",
      "Multilingual: 日本語のテストとColaboración",
    ].join("\n");

    const filePath = path.join(cloneDir, "capitulo_1.tex");
    fs.writeFileSync(filePath, unicodeContent, "utf8");

    await execAsync(`git add capitulo_1.tex`, { cwd: cloneDir });
    await execAsync(`git commit -m "Add Unicode chapter with math and accents"`, { cwd: cloneDir });

    const pushRes = await execAsync(`git push origin main`, {
      cwd: cloneDir,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    expect((pushRes.stdout + "\n" + pushRes.stderr).toLowerCase()).toContain("main -> main");

    // Fresh clone into new directory to verify faithful retrieval
    const cloneDir2 = path.join(workDir, "repo-unicode-verify");
    await execAsync(`git clone ${authedUrl} ${cloneDir2}`, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const retrievedContent = fs.readFileSync(path.join(cloneDir2, "capitulo_1.tex"), "utf8");
    expect(retrievedContent).toBe(unicodeContent);
  });

  it("handles binary files across Git push and subsequent clone", async () => {
    const clientDir = path.join(workDir, "repo-unicode");

    // Create a 256-byte pseudo-binary asset containing all possible byte values 0..255
    const binaryData = Buffer.alloc(256);
    for (let i = 0; i < 256; i++) {
      binaryData[i] = i;
    }

    const binaryPath = path.join(clientDir, "figure.png");
    fs.writeFileSync(binaryPath, binaryData);

    await execAsync(`git add figure.png`, { cwd: clientDir });
    await execAsync(`git commit -m "Add binary figure asset"`, { cwd: clientDir });

    const pushRes = await execAsync(`git push origin main`, {
      cwd: clientDir,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    expect((pushRes.stdout + "\n" + pushRes.stderr).toLowerCase()).toContain("main -> main");

    // Clone into fresh folder and verify exact binary byte equality
    const verifyDir = path.join(workDir, "repo-binary-verify");
    const authedUrl = getAuthedUrl(rawToken);

    await execAsync(`git clone ${authedUrl} ${verifyDir}`, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const readBackBinary = fs.readFileSync(path.join(verifyDir, "figure.png"));
    expect(Buffer.compare(binaryData, readBackBinary)).toBe(0);
  });

  it("performs repeated synchronization rounds between two independent working copies", async () => {
    const authedUrl = getAuthedUrl(rawToken);
    const repoA = path.join(workDir, "working-copy-a");
    const repoB = path.join(workDir, "working-copy-b");

    await execAsync(`git clone ${authedUrl} ${repoA}`, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    await execAsync(`git config user.email "${ownerUser.email}"`, { cwd: repoA });
    await execAsync(`git config user.name "Editor A"`, { cwd: repoA });

    await execAsync(`git clone ${authedUrl} ${repoB}`, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    await execAsync(`git config user.email "${ownerUser.email}"`, { cwd: repoB });
    await execAsync(`git config user.name "Editor B"`, { cwd: repoB });

    // Round 1: Repo A commits & pushes sync_a.tex
    fs.writeFileSync(path.join(repoA, "sync_a.tex"), "Content from Editor A\n", "utf8");
    await execAsync(`git add sync_a.tex`, { cwd: repoA });
    await execAsync(`git commit -m "Editor A commit round 1"`, { cwd: repoA });
    await execAsync(`git push origin main`, {
      cwd: repoA,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    // Repo B pulls and observes sync_a.tex
    await execAsync(`git pull origin main`, {
      cwd: repoB,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    expect(fs.existsSync(path.join(repoB, "sync_a.tex"))).toBe(true);
    expect(fs.readFileSync(path.join(repoB, "sync_a.tex"), "utf8")).toBe("Content from Editor A\n");

    // Round 2: Repo B commits & pushes sync_b.tex
    fs.writeFileSync(path.join(repoB, "sync_b.tex"), "Content from Editor B\n", "utf8");
    await execAsync(`git add sync_b.tex`, { cwd: repoB });
    await execAsync(`git commit -m "Editor B commit round 2"`, { cwd: repoB });
    await execAsync(`git push origin main`, {
      cwd: repoB,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    // Repo A pulls and observes sync_b.tex
    await execAsync(`git pull origin main`, {
      cwd: repoA,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    expect(fs.existsSync(path.join(repoA, "sync_b.tex"))).toBe(true);
    expect(fs.readFileSync(path.join(repoA, "sync_b.tex"), "utf8")).toBe("Content from Editor B\n");
  });

  it("rejects Git operations when token is revoked", async () => {
    // Revoke the token
    const revoked = await tokenStore.revokeToken(tokenId, ownerUser.id);
    expect(revoked).toBe(true);

    const clientDir = path.join(workDir, "repo-unicode");
    fs.appendFileSync(path.join(clientDir, "capitulo_1.tex"), "\n% Unauthenticated append");
    await execAsync(`git commit -am "Attempt push with revoked token"`, { cwd: clientDir });

    let pushFailed = false;
    let errorOutput = "";

    try {
      await execAsync(`git push origin main`, {
        cwd: clientDir,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (err: unknown) {
      pushFailed = true;
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      errorOutput = (execErr.stderr ?? "") + "\n" + (execErr.stdout ?? "") + "\n" + (execErr.message ?? "");
    }

    expect(pushFailed).toBe(true);
    expect(
      errorOutput.includes("TOKEN_EXPIRED") ||
      errorOutput.includes("Autenticación falló") ||
      errorOutput.includes("Authentication failed") ||
      errorOutput.includes("401") ||
      errorOutput.includes("fatal:"),
    ).toBe(true);
  });

  it("rejects Git clone when token has expired", async () => {
    // Create an already-expired token
    const expiredTokenResult = await tokenStore.createToken({
      userId: ownerUser.id,
      name: "Expired Token",
      scopes: ["git:read", "git:write"],
      expiresAt: new Date(Date.now() - 10000), // 10s in the past
    });

    const expiredUrl = getAuthedUrl(expiredTokenResult.rawToken);
    const destDir = path.join(workDir, "repo-expired");

    let cloneFailed = false;
    let errorOutput = "";

    try {
      await execAsync(`git clone ${expiredUrl} ${destDir}`, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (err: unknown) {
      cloneFailed = true;
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      errorOutput = (execErr.stderr ?? "") + "\n" + (execErr.stdout ?? "") + "\n" + (execErr.message ?? "");
    }

    expect(cloneFailed).toBe(true);
    expect(
      errorOutput.includes("TOKEN_EXPIRED") ||
      errorOutput.includes("Autenticación falló") ||
      errorOutput.includes("Authentication failed") ||
      errorOutput.includes("401") ||
      errorOutput.includes("fatal:"),
    ).toBe(true);
  });
});
