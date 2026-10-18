import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { mergeConcurrentGitAndWebEdits } from "../../../apps/git-bridge/src/import.js";

describe("Regression COL-12 (S14-T04): Concurrent offline edit and Git import CRDT recovery", () => {
  it("converges concurrent Git import and Web client edits on the same document", () => {
    const baseContent =
      "\\documentclass{article}\n\\begin{document}\nInitial Common Section\n\\end{document}\n";
    const webPrepend = "% Web collaborator top banner comment\n";
    const gitAppend = "% Git CLI collaborator bottom citation note\n";

    const result = mergeConcurrentGitAndWebEdits(baseContent, gitAppend, webPrepend);

    // Verify both CRDT documents converged identically
    const webText = result.docA.getText("content").toString();
    const gitText = result.docB.getText("content").toString();

    expect(webText).toBe(gitText);
    expect(webText).toBe(result.mergedContent);

    // Verify both contributions survived without data loss
    expect(webText).toContain("Web collaborator top banner comment");
    expect(webText).toContain("Git CLI collaborator bottom citation note");
    expect(webText).toContain("Initial Common Section");
  });

  it("handles concurrent insertions at identical positions deterministically", () => {
    const baseDoc = new Y.Doc();
    baseDoc.getText("content").insert(0, "ABC");
    const baseState = Y.encodeStateAsUpdate(baseDoc);

    // Client Web inserts at pos 1
    const docWeb = new Y.Doc();
    Y.applyUpdate(docWeb, baseState);
    docWeb.getText("content").insert(1, "[WEB]");
    const webUpdate = Y.encodeStateAsUpdate(docWeb, Y.encodeStateVector(baseDoc));

    // Client Git inserts at pos 1
    const docGit = new Y.Doc();
    Y.applyUpdate(docGit, baseState);
    docGit.getText("content").insert(1, "[GIT]");
    const gitUpdate = Y.encodeStateAsUpdate(docGit, Y.encodeStateVector(baseDoc));

    // Exchange updates
    Y.applyUpdate(docWeb, gitUpdate);
    Y.applyUpdate(docGit, webUpdate);

    // Verify identical convergence
    expect(docWeb.getText("content").toString()).toBe(docGit.getText("content").toString());
    // Both tokens are present
    expect(docWeb.getText("content").toString()).toContain("[WEB]");
    expect(docWeb.getText("content").toString()).toContain("[GIT]");
  });
});
