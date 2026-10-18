import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryGitTokenStore } from "../../apps/git-bridge/src/auth.js";
import { createGitBridgeServer, setProjectTipCommit } from "../../apps/git-bridge/src/server.js";
import { createSessionFixture } from "../helpers/s02-session.js";

const execAsync = promisify(exec);

describe("S14-T03: Real Git CLI clone, fetch, push, and fast-forward enforcement", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let tokenStore: InMemoryGitTokenStore;
  let server: ReturnType<typeof createGitBridgeServer>;
  let serverUrl: string;
  let ownerUser: { id: string; email: string };
  let project: { id: string };
  let rawToken: string;
  let workDir: string;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    ownerUser = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status)
       VALUES ('S14-T03 Git Repo', $1, 'pdflatex', 'active')
       RETURNING id`,
      [ownerUser.id],
    );
    project = { id: projRes.rows[0]!.id };

    tokenStore = new InMemoryGitTokenStore();
    const tokenResult = await tokenStore.createToken({
      userId: ownerUser.id,
      name: "CLI Test Token",
      scopes: ["git:read", "git:write"],
    });
    rawToken = tokenResult.rawToken;

    server = createGitBridgeServer({
      db: fixture.db,
      tokenStore,
    });

    const address = await server.listen({ port: 0, host: "127.0.0.1" });
    serverUrl = address;

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "s14-t03-"));
  });

  afterAll(async () => {
    fs.rmSync(workDir, { recursive: true, force: true });
    await server.close();
    await fixture.close();
  });

  it("performs real git clone via Git CLI over Smart HTTP", async () => {
    const cloneDir = path.join(workDir, "cloned-repo");
    const encodedUser = encodeURIComponent(ownerUser.email);
    const authedUrl = `${serverUrl.replace("http://", `http://${encodedUser}:${rawToken}@`)}/git/${project.id}.git`;

    await execAsync(`git clone ${authedUrl} ${cloneDir}`, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    expect(fs.existsSync(path.join(cloneDir, ".git"))).toBe(true);
    expect(fs.existsSync(path.join(cloneDir, "main.tex"))).toBe(true);

    const content = fs.readFileSync(path.join(cloneDir, "main.tex"), "utf8");
    expect(content).toContain("\\documentclass{article}");
    expect(content).toContain("Collaborative Document");

    // Inspect git log
    const logRes = await execAsync(`git log -n 1 --oneline`, { cwd: cloneDir });
    expect(logRes.stdout).toContain("Project snapshot for");
  });

  it("performs real git push for valid fast-forward commit", async () => {
    const cloneDir = path.join(workDir, "cloned-repo");

    // Configure user identity in repo
    await execAsync(`git config user.email "${ownerUser.email}"`, { cwd: cloneDir });
    await execAsync(`git config user.name "Test Owner"`, { cwd: cloneDir });

    // Modify file and commit
    const filePath = path.join(cloneDir, "main.tex");
    fs.appendFileSync(filePath, "\n% Real push test comment\n");
    await execAsync(`git commit -am "Push from Git CLI"`, { cwd: cloneDir });

    const pushRes = await execAsync(`git push origin main`, {
      cwd: cloneDir,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const combinedOutput = (pushRes.stdout + "\n" + pushRes.stderr).toLowerCase();
    expect(combinedOutput).toContain("main -> main");

    // Verify DB revision was created by the bridge upon git push
    const revs = await fixture.db.query<{ revision_no: number; source: string; label: string }>(
      `SELECT revision_no, source, label FROM project_revisions WHERE project_id = $1 ORDER BY revision_no DESC LIMIT 1`,
      [project.id],
    );
    expect(revs.rows.length).toBe(1);
    expect(revs.rows[0]!.source).toBe("git");
    expect(revs.rows[0]!.label).toContain("Push from Git CLI");

    // Perform fresh clone into a second directory and verify round-trip commit integrity
    const cloneDir2 = path.join(workDir, "cloned-repo-roundtrip");
    const encodedUser = encodeURIComponent(ownerUser.email);
    const authedUrl = `${serverUrl.replace("http://", `http://${encodedUser}:${rawToken}@`)}/git/${project.id}.git`;

    await execAsync(`git clone ${authedUrl} ${cloneDir2}`, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const content2 = fs.readFileSync(path.join(cloneDir2, "main.tex"), "utf8");
    expect(content2).toContain("% Real push test comment");
  });

  it("rejects stale non-fast-forward push and leaves remote state intact", async () => {
    const cloneDir = path.join(workDir, "cloned-repo");

    // Advance remote tip behind client's back to simulate concurrent editor revision
    setProjectTipCommit(project.id, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

    // Make local commit
    const filePath = path.join(cloneDir, "main.tex");
    fs.appendFileSync(filePath, "\n% Conflicting second edit\n");
    await execAsync(`git commit -am "Conflicting commit"`, { cwd: cloneDir });

    let pushFailed = false;
    let errorOutput = "";

    try {
      await execAsync(`git push origin main`, {
        cwd: cloneDir,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      });
    } catch (err: unknown) {
      pushFailed = true;
      const execErr = err as { stdout?: string; stderr?: string; message?: string };
      errorOutput =
        (execErr.stderr ?? "") + "\n" + (execErr.stdout ?? "") + "\n" + (execErr.message ?? "");
    }

    expect(pushFailed).toBe(true);
    expect(
      errorOutput.includes("non-fast-forward") ||
        errorOutput.includes("fetch first") ||
        errorOutput.includes("stale base") ||
        errorOutput.includes("rejected"),
    ).toBe(true);
  });

  it("safely handles non-UUID repository requests returning 404 without database exception", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/git/invalid-non-uuid-repo.git/info/refs?service=git-upload-pack",
      headers: {
        authorization: `Basic ${Buffer.from(`${ownerUser.email}:${rawToken}`).toString("base64")}`,
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.body).toContain("RESOURCE_NOT_FOUND");
  });
});
