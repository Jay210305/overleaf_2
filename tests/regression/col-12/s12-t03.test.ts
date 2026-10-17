import { describe, expect, it } from "vitest";
import {
  classifyPull,
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
): SyncBaseManifest => ({
  version: 1,
  remoteSha: sha("b"),
  entries: entries.map((entry) => ({ kind: entry.kind ?? "text", ...entry })),
});
const actionsOf = (entries: PullEntry[]) => entries.map((entry) => `${entry.action}:${entry.path}`);

/**
 * COL-12 scoped slice: two offline clients recover safely through concurrent
 * edit/rename/delete conflicts. Every divergent state is surfaced before any
 * apply step, and nothing is force-overwritten.
 */
describe("S12-T03 COL-12 concurrent edit/rename/delete conflicts", () => {
  it("surfaces a concurrent edit on both sides as a text conflict with both fingerprints", () => {
    const { entries, conflicts } = classifyPull({
      base: baseOf([{ path: "main.tex", localFingerprint: "fp-v1", remoteSha: sha("1") }]),
      localFiles: [localFile("main.tex", "fp-v2")],
      remoteEntries: [remoteFile("main.tex", sha("2"))],
    });
    expect(actionsOf(entries)).toEqual(["conflict:main.tex"]);
    expect(entries[0]).toMatchObject({
      action: "conflict",
      localKind: "text",
      localFingerprint: "fp-v2",
      remoteSha: sha("2"),
    });
    expect(conflicts).toEqual([{ path: "main.tex", kind: "text" }]);
  });

  it("applies a remote rename safely when the local file is untouched", () => {
    const { entries, conflicts } = classifyPull({
      base: baseOf([
        { path: "chapters/files.tex", localFingerprint: "fp-f1", remoteSha: sha("1") },
      ]),
      localFiles: [localFile("chapters/files.tex", "fp-f1")],
      remoteEntries: [remoteFile("chapters/renamed.tex", sha("1"))],
    });
    expect(actionsOf(entries)).toEqual(["delete:chapters/files.tex", "add:chapters/renamed.tex"]);
    expect(conflicts).toEqual([]);
  });

  it("conflicts when a local edit races a remote rename instead of losing the edit", () => {
    const { entries, conflicts } = classifyPull({
      base: baseOf([
        { path: "chapters/files.tex", localFingerprint: "fp-f1", remoteSha: sha("1") },
      ]),
      localFiles: [localFile("chapters/files.tex", "fp-f2")],
      remoteEntries: [remoteFile("chapters/renamed.tex", sha("1"))],
    });
    expect(actionsOf(entries)).toEqual(["conflict:chapters/files.tex", "add:chapters/renamed.tex"]);
    expect(conflicts).toEqual([{ path: "chapters/files.tex", kind: "tree" }]);
  });

  it("keeps an unchanged local file when the remote deleted it, and deletes it when safe", () => {
    const unchanged = classifyPull({
      base: baseOf([{ path: "notes.tex", localFingerprint: "fp-n1", remoteSha: sha("1") }]),
      localFiles: [localFile("notes.tex", "fp-n1")],
      remoteEntries: [],
    });
    expect(actionsOf(unchanged.entries)).toEqual(["delete:notes.tex"]);
    const edited = classifyPull({
      base: baseOf([{ path: "notes.tex", localFingerprint: "fp-n1", remoteSha: sha("1") }]),
      localFiles: [localFile("notes.tex", "fp-n2")],
      remoteEntries: [],
    });
    expect(actionsOf(edited.entries)).toEqual(["conflict:notes.tex"]);
    expect(edited.conflicts).toEqual([{ path: "notes.tex", kind: "tree" }]);
  });

  it("conflicts when the local side deleted a file the remote changed", () => {
    const { entries, conflicts } = classifyPull({
      base: baseOf([{ path: "report.tex", localFingerprint: "fp-r1", remoteSha: sha("1") }]),
      localFiles: [],
      remoteEntries: [remoteFile("report.tex", sha("2"))],
    });
    expect(actionsOf(entries)).toEqual(["conflict:report.tex"]);
    expect(conflicts).toEqual([{ path: "report.tex", kind: "tree" }]);
  });

  it("keeps a local deletion when the remote file is unchanged", () => {
    const { entries, conflicts } = classifyPull({
      base: baseOf([{ path: "report.tex", localFingerprint: "fp-r1", remoteSha: sha("1") }]),
      localFiles: [],
      remoteEntries: [remoteFile("report.tex", sha("1"))],
    });
    expect(actionsOf(entries)).toEqual(["keep-deleted:report.tex"]);
    expect(conflicts).toEqual([]);
  });

  it("recovers two offline clients: one renames, the other edits another file", () => {
    const { entries, conflicts } = classifyPull({
      base: baseOf([
        { path: "one.tex", localFingerprint: "fp-o1", remoteSha: sha("1") },
        { path: "two.tex", localFingerprint: "fp-t1", remoteSha: sha("2") },
      ]),
      localFiles: [localFile("one.tex", "fp-o1"), localFile("two.tex", "fp-t2")],
      remoteEntries: [remoteFile("one-renamed.tex", sha("1")), remoteFile("two.tex", sha("2"))],
    });
    expect(actionsOf(entries)).toEqual([
      "add:one-renamed.tex",
      "delete:one.tex",
      "keep-local:two.tex",
    ]);
    expect(conflicts).toEqual([]);
  });
});
