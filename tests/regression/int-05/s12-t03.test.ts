import { describe, expect, it } from "vitest";
import {
  GitHubPullError,
  classifyPull,
  isIgnoredRemotePath,
  validateRemoteTree,
  type LocalFile,
  type PullEntry,
  type RemoteTreeEntry,
  type SyncBaseManifest,
} from "../../../apps/jobs/src/sync/github-pull.js";

const sha = (c: string) => c.repeat(40);
const remoteFile = (path: string, shaValue: string | null, sizeBytes = 10): RemoteTreeEntry => ({
  path,
  kind: "file",
  sizeBytes,
  sha: shaValue,
});
const remoteFolder = (path: string): RemoteTreeEntry => ({
  path,
  kind: "folder",
  sizeBytes: 0,
  sha: null,
});
const localFile = (
  path: string,
  fingerprint: string,
  kind: "text" | "binary" = "text",
  sizeBytes = 10,
): LocalFile => ({ path, kind, fingerprint, sizeBytes });
const baseOf = (
  entries: Array<{
    path: string;
    kind?: "text" | "binary";
    localFingerprint: string;
    remoteSha: string | null;
  }>,
  remoteSha = sha("b"),
): SyncBaseManifest => ({
  version: 1,
  remoteSha,
  entries: entries.map((entry) => ({ kind: entry.kind ?? "text", ...entry })),
});
const actionsOf = (entries: PullEntry[]) => entries.map((entry) => `${entry.action}:${entry.path}`);

const expectReject = (entries: RemoteTreeEntry[], status: number, code: string) => {
  try {
    validateRemoteTree(entries);
    throw new Error("expected validateRemoteTree to reject");
  } catch (error) {
    expect(error).toBeInstanceOf(GitHubPullError);
    const pullError = error as GitHubPullError;
    expect(pullError.status).toBe(status);
    expect(pullError.code).toBe(code);
  }
};

describe("S12-T03 INT-05 pull validation and classification", () => {
  it("rejects unsafe remote paths with VALIDATION_ERROR", () => {
    for (const bad of [
      "../evil.tex",
      "a/../../b.tex",
      "/abs.tex",
      "a\\b.tex",
      "a//b.tex",
      "",
      "a/./b.tex",
      "bad\0.tex",
    ]) {
      expectReject([remoteFile(bad, sha("a"))], 400, "VALIDATION_ERROR");
    }
  });

  it("rejects oversized or over-quota remote trees with QUOTA_EXCEEDED", () => {
    expectReject([remoteFile("big.bin", sha("a"), 25 * 1024 * 1024 + 1)], 413, "QUOTA_EXCEEDED");
    expectReject(
      Array.from({ length: 2001 }, (_, index) => remoteFile(`f${index}.tex`, sha("a"))),
      413,
      "QUOTA_EXCEEDED",
    );
    expectReject(
      Array.from({ length: 5 }, (_, index) =>
        remoteFile(`big${index}.bin`, sha("a"), 24 * 1024 * 1024),
      ),
      413,
      "QUOTA_EXCEEDED",
    );
  });

  it("ignores .git, dotenv secrets and TeX build output, never source", () => {
    for (const ignored of [
      ".git/config",
      "nested/.git/HEAD",
      ".env",
      ".env.local",
      "main.aux",
      "build/main.log",
      "paper.out",
      "paper.toc",
      "paper.synctex.gz",
      "paper.fls",
      "paper.fdb_latexmk",
      "server.pem",
      "private.key",
    ]) {
      expect(isIgnoredRemotePath(ignored), ignored).toBe(true);
    }
    for (const kept of ["main.tex", "refs/library.bib", "figures/chart.pdf", "chapters/one.png"]) {
      expect(isIgnoredRemotePath(kept), kept).toBe(false);
    }
    const accepted = validateRemoteTree([
      remoteFile(".env", sha("a")),
      remoteFile("main.aux", sha("a"), 25 * 1024 * 1024 + 1),
      remoteFile("main.tex", sha("b")),
    ]);
    expect(accepted.map((entry) => entry.path)).toEqual(["main.tex"]);
  });

  it("classifies a first pull conservatively without overwriting shared paths", () => {
    const { entries, conflicts } = classifyPull({
      base: null,
      localFiles: [
        localFile("main.tex", "fp-main"),
        localFile("local-only.tex", "fp-local"),
        localFile("figures/img.png", "fp-bin", "binary"),
      ],
      remoteEntries: [
        remoteFile("main.tex", sha("1")),
        remoteFile("chapters/intro.tex", sha("2")),
        remoteFolder("figures"),
        remoteFolder("assets"),
      ],
    });
    expect(actionsOf(entries)).toEqual([
      "add:chapters/intro.tex",
      "keep-local:figures/img.png",
      "keep-local:local-only.tex",
      "conflict:main.tex",
    ]);
    expect(conflicts).toEqual([{ path: "main.tex", kind: "text" }]);
  });

  it("classifies precise three-way states against a recorded agreement", () => {
    const base = baseOf([
      { path: "main.tex", localFingerprint: "fp-v1", remoteSha: sha("1") },
      { path: "notes.tex", localFingerprint: "fp-n1", remoteSha: sha("2") },
      { path: "gone.tex", localFingerprint: "fp-g1", remoteSha: sha("3") },
      { path: "conflict.tex", localFingerprint: "fp-c1", remoteSha: sha("4") },
      { path: "local-only.tex", localFingerprint: "fp-l1", remoteSha: null },
    ]);
    const { entries, conflicts } = classifyPull({
      base,
      localFiles: [
        localFile("main.tex", "fp-v1"),
        localFile("notes.tex", "fp-n2"),
        localFile("gone.tex", "fp-g1"),
        localFile("conflict.tex", "fp-c2"),
        localFile("local-only.tex", "fp-l1"),
        localFile("new-local.tex", "fp-nl"),
      ],
      remoteEntries: [
        remoteFile("main.tex", sha("1")),
        remoteFile("notes.tex", sha("2")),
        remoteFile("conflict.tex", sha("9")),
        remoteFile("local-only.tex", sha("5")),
        remoteFile("fresh.tex", sha("6")),
      ],
    });
    expect(actionsOf(entries)).toEqual([
      "conflict:conflict.tex",
      "add:fresh.tex",
      "delete:gone.tex",
      "update:local-only.tex",
      "unchanged:main.tex",
      "keep-local:new-local.tex",
      "keep-local:notes.tex",
    ]);
    expect(conflicts).toEqual([{ path: "conflict.tex", kind: "text" }]);
  });

  it("treats unverifiable remote hashes as changed, never as unchanged", () => {
    const base = baseOf([{ path: "main.tex", localFingerprint: "fp-v1", remoteSha: sha("1") }]);
    const { entries } = classifyPull({
      base,
      localFiles: [localFile("main.tex", "fp-v1")],
      remoteEntries: [remoteFile("main.tex", null)],
    });
    expect(actionsOf(entries)).toEqual(["update:main.tex"]);
  });

  it("flags kind mismatches and binary conflicts", () => {
    const { entries, conflicts } = classifyPull({
      base: null,
      localFiles: [
        localFile("assets", "fp-file"),
        localFile("chapters/one.tex", "fp-one"),
        localFile("scan.png", "fp-scan", "binary"),
      ],
      remoteEntries: [
        remoteFolder("assets"),
        remoteFile("chapters", sha("6")),
        remoteFile("scan.png", sha("7")),
      ],
    });
    expect(entries.map((entry) => `${entry.action}:${entry.path}`).sort()).toEqual([
      "conflict:assets",
      "conflict:chapters",
      "conflict:scan.png",
      "keep-local:chapters/one.tex",
    ]);
    expect(conflicts).toEqual([
      { path: "assets", kind: "tree" },
      { path: "chapters", kind: "tree" },
      { path: "scan.png", kind: "binary" },
    ]);
  });
});
