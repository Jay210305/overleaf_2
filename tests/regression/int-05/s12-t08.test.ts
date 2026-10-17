import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { buildReplacementUpdate } from "../../../apps/jobs/src/sync/apply-changes.js";
import { GitHubPullError } from "../../../apps/jobs/src/sync/github-pull.js";

const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

const rejectsWith = (run: () => unknown, status: number, code: string) => {
  try {
    run();
    throw new Error("expected the replacement update to be rejected");
  } catch (error) {
    expect(error).toBeInstanceOf(GitHubPullError);
    const pullError = error as GitHubPullError;
    expect(pullError.status).toBe(status);
    expect(pullError.code).toBe(code);
  }
};

const loadDoc = (updateBase64: string) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(updateBase64, "base64"));
  return doc;
};

describe("INT-05 S12-T08 canonical text replacement deltas", () => {
  it("builds a bounded delta that converges a document with edit history", () => {
    const doc = new Y.Doc();
    const text = doc.getText("content");
    text.insert(0, "Hello World");
    text.delete(0, 5);
    text.insert(0, "Goodbye");
    const current = base64(Y.encodeStateAsUpdate(doc));
    doc.destroy();

    const replacement = buildReplacementUpdate(current, "Replaced canonical text");
    expect(replacement).not.toBeNull();

    const currentDoc = loadDoc(current);
    expect(replacement!.baseStateVectorBase64).toBe(base64(Y.encodeStateVector(currentDoc)));
    currentDoc.destroy();

    const replica = loadDoc(current);
    Y.applyUpdate(replica, Buffer.from(replacement!.updateBase64, "base64"));
    expect(replica.getText("content").toString()).toBe("Replaced canonical text");
    replica.destroy();
  });

  it("replaces an empty canonical document with the remote text", () => {
    const empty = base64(Y.encodeStateAsUpdate(new Y.Doc()));
    const replacement = buildReplacementUpdate(empty, "\\section{First}\n");
    expect(replacement).not.toBeNull();
    const replica = loadDoc(empty);
    Y.applyUpdate(replica, Buffer.from(replacement!.updateBase64, "base64"));
    expect(replica.getText("content").toString()).toBe("\\section{First}\n");
    replica.destroy();
  });

  it("clears the canonical document when the remote text is empty", () => {
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "to be removed");
    const current = base64(Y.encodeStateAsUpdate(doc));
    doc.destroy();

    const replacement = buildReplacementUpdate(current, "");
    expect(replacement).not.toBeNull();
    const replica = loadDoc(current);
    Y.applyUpdate(replica, Buffer.from(replacement!.updateBase64, "base64"));
    expect(replica.getText("content").toString()).toBe("");
    replica.destroy();
  });

  it("returns no delta when the canonical text already matches the remote content", () => {
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "identical");
    const current = base64(Y.encodeStateAsUpdate(doc));
    doc.destroy();
    expect(buildReplacementUpdate(current, "identical")).toBeNull();
  });

  it("rejects malformed canonical state instead of fabricating a delta", () => {
    // V1 update framing promises one client struct but ends before it.
    const malformed = Buffer.from([1, 1, 0, 0]).toString("base64");
    rejectsWith(() => buildReplacementUpdate(malformed, "next"), 409, "REVISION_CONFLICT");
  });
});
