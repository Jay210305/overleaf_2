import { describe, expect, it } from "vitest";
import { TabSessionManager } from "../../../apps/web/src/features/editor/editor-tabs.js";

describe("EDT-03 S04-T04 File switching preserves each buffer and selection", () => {
  it("preserves cursor line/column and text selection across multiple switch operations", () => {
    const manager = new TabSessionManager([
      {
        fileId: "f-doc",
        fileName: "document.tex",
        projectId: "p1",
        content: "Line 1\nLine 2\nLine 3",
        cursor: { line: 1, col: 1, head: 0 },
        selection: { anchor: 0, head: 0 },
      },
      {
        fileId: "f-sty",
        fileName: "style.sty",
        projectId: "p1",
        content: "\\ProvidesPackage{custom}",
        cursor: { line: 1, col: 1, head: 0 },
        selection: { anchor: 0, head: 0 },
      },
    ]);

    // Position cursor on doc at Line 2, Col 4
    manager.updateTabBuffer("f-doc", {
      cursor: { line: 2, col: 4, head: 10 },
      selection: { anchor: 7, head: 13 },
      content: "Line 1\nLine 2 updated\nLine 3",
    });

    // Switch to style.sty and update it
    manager.switchTab("f-sty");
    manager.updateTabBuffer("f-sty", {
      cursor: { line: 1, col: 17, head: 16 },
      selection: { anchor: 16, head: 22 },
      content: "\\ProvidesPackage{custom}[2026/10/12]",
    });

    // Switch back to document.tex
    manager.switchTab("f-doc");
    const docTab = manager.getActiveTab();
    expect(docTab?.content).toBe("Line 1\nLine 2 updated\nLine 3");
    expect(docTab?.cursor).toEqual({ line: 2, col: 4, head: 10 });
    expect(docTab?.selection).toEqual({ anchor: 7, head: 13 });

    // Switch back to style.sty
    manager.switchTab("f-sty");
    const styTab = manager.getActiveTab();
    expect(styTab?.content).toBe("\\ProvidesPackage{custom}[2026/10/12]");
    expect(styTab?.cursor).toEqual({ line: 1, col: 17, head: 16 });
    expect(styTab?.selection).toEqual({ anchor: 16, head: 22 });
  });

  it("closing last active tab smoothly clears active tab", () => {
    const manager = new TabSessionManager([
      {
        fileId: "lone-tab",
        fileName: "lone.tex",
        projectId: "p1",
        content: "only file",
      },
    ]);

    expect(manager.getActiveTabId()).toBe("lone-tab");
    manager.closeTab("lone-tab");
    expect(manager.getTabs()).toHaveLength(0);
    expect(manager.getActiveTabId()).toBeNull();
  });
});
