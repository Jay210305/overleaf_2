import { describe, expect, it } from "vitest";
import { TabSessionManager } from "../../apps/web/src/features/editor/editor-tabs.js";

describe("S04-T04 File tabs and navigation integration", () => {
  it("switches files repeatedly without losing buffer, selection, or undo state", () => {
    const manager = new TabSessionManager([
      {
        fileId: "file-main",
        fileName: "main.tex",
        projectId: "proj-1",
        content: "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}",
        cursor: { line: 3, col: 6, head: 42 },
        selection: { anchor: 40, head: 45 },
        scrollTop: 120,
        undoHistory: [{ type: "insert", position: 40, text: "Hello" }],
        isDirty: false,
      },
      {
        fileId: "file-ref",
        fileName: "references.bib",
        projectId: "proj-1",
        content: "@article{einstein1905,\n  author = {Albert Einstein}\n}",
        cursor: { line: 2, col: 12, head: 35 },
        selection: { anchor: 30, head: 35 },
        scrollTop: 50,
        undoHistory: [{ type: "insert", position: 0, text: "@article" }],
        isDirty: true,
      },
    ]);

    expect(manager.getActiveTabId()).toBe("file-main");
    const active1 = manager.getActiveTab();
    expect(active1?.content).toContain("Hello");
    expect(active1?.selection?.anchor).toBe(40);

    // Switch to references.bib
    manager.switchTab("file-ref");
    expect(manager.getActiveTabId()).toBe("file-ref");
    const activeRef = manager.getActiveTab();
    expect(activeRef?.fileName).toBe("references.bib");
    expect(activeRef?.content).toContain("Albert Einstein");
    expect(activeRef?.cursor?.line).toBe(2);
    expect(activeRef?.isDirty).toBe(true);

    // Edit references.bib in buffer
    manager.updateTabBuffer("file-ref", {
      content: "@article{einstein1905,\n  author = {Albert Einstein},\n  year = {1905}\n}",
      cursor: { line: 3, col: 16, head: 60 },
      selection: { anchor: 50, head: 60 },
      undoHistory: [
        { type: "insert", position: 0, text: "@article" },
        { type: "insert", position: 50, text: "year = {1905}" },
      ],
    });

    // Switch back to main.tex
    manager.switchTab("file-main");
    expect(manager.getActiveTabId()).toBe("file-main");
    const activeMainAgain = manager.getActiveTab();
    expect(activeMainAgain?.content).toContain("\\documentclass{article}");
    expect(activeMainAgain?.cursor?.head).toBe(42);
    expect(activeMainAgain?.selection?.anchor).toBe(40);
    expect(activeMainAgain?.undoHistory?.length).toBe(1);

    // Switch again to references.bib: all modifications and selection preserved!
    manager.switchTab("file-ref");
    expect(manager.getActiveTabId()).toBe("file-ref");
    const activeRefAgain = manager.getActiveTab();
    expect(activeRefAgain?.content).toContain("year = {1905}");
    expect(activeRefAgain?.cursor?.head).toBe(60);
    expect(activeRefAgain?.selection?.head).toBe(60);
    expect(activeRefAgain?.undoHistory?.length).toBe(2);
  });

  it("closes tab when file is deleted with a visible reason and notification", () => {
    const manager = new TabSessionManager([
      {
        fileId: "file-1",
        fileName: "main.tex",
        projectId: "proj-1",
        content: "main content",
      },
      {
        fileId: "file-2",
        fileName: "chapter1.tex",
        projectId: "proj-1",
        content: "chapter 1 content",
      },
    ]);

    manager.switchTab("file-2");
    expect(manager.getActiveTabId()).toBe("file-2");
    expect(manager.getNotification()).toBeNull();

    // File 2 is deleted on server or locally
    manager.handleFileDeleted("file-2", "File was deleted by collaborator (404)");

    // File 2 tab is closed and adjacent tab (file-1) becomes active
    expect(manager.getTabs().length).toBe(1);
    expect(manager.getActiveTabId()).toBe("file-1");

    // Notification is set with visible reason
    const notif = manager.getNotification();
    expect(notif).not.toBeNull();
    expect(notif?.fileId).toBe("file-2");
    expect(notif?.fileName).toBe("chapter1.tex");
    expect(notif?.reason).toBe("File was deleted by collaborator (404)");

    // Dismiss notification
    manager.clearNotification();
    expect(manager.getNotification()).toBeNull();
  });

  it("opening existing tab focuses it without duplicating tabs", () => {
    const manager = new TabSessionManager([
      {
        fileId: "f1",
        fileName: "intro.tex",
        projectId: "p1",
        content: "Intro",
      },
    ]);

    manager.openTab({
      fileId: "f2",
      fileName: "methods.tex",
      projectId: "p1",
      content: "Methods",
    });

    expect(manager.getTabs().length).toBe(2);
    expect(manager.getActiveTabId()).toBe("f2");

    // Reopen f1
    manager.openTab({
      fileId: "f1",
      fileName: "intro.tex",
      projectId: "p1",
    });

    expect(manager.getTabs().length).toBe(2);
    expect(manager.getActiveTabId()).toBe("f1");
  });
});
