// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, renderHook, act } from "@testing-library/react";
import * as Y from "yjs";
import { computeTextHash } from "@latex-collab/latex";
import {
  EditorModeSwitch,
  useEditorModeSwitch,
} from "../../apps/web/src/features/visual/mode-switch.js";

afterEach(() => {
  cleanup();
});

describe("S11-T07 Integration: Read-Only Code/Visual Mode Switching", () => {
  it("renders mode switch controls and notifies mode changes", () => {
    const onSelectMode = vi.fn();

    render(
      createElement(EditorModeSwitch, {
        mode: "code",
        onSelectMode,
        hasErrors: true,
      })
    );

    const codeBtn = screen.getByTestId("mode-code-btn");
    const visualBtn = screen.getByTestId("mode-visual-btn");
    const errorDot = screen.getByTestId("mode-error-dot");

    expect(codeBtn.getAttribute("aria-checked")).toBe("true");
    expect(visualBtn.getAttribute("aria-checked")).toBe("false");
    expect(errorDot).toBeDefined();

    fireEvent.click(visualBtn);
    expect(onSelectMode).toHaveBeenCalledWith("visual");
  });

  it("leaves source bytes and hash 100% identical when opening and closing visual mode without edits", () => {
    const raw = `\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
\\section{Testing Mode Switching}
This is a document with display math:
\\[ \\sum_{k=1}^n k = \\frac{n(n+1)}{2} \\]
And unknown macro \\unsupportedCommand{arg} here.
\\end{document}`;

    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);
    const initialHash = computeTextHash(raw);

    const onModeChange = vi.fn();
    const { result } = renderHook(() =>
      useEditorModeSwitch({
        yText,
        initialMode: "code",
        onModeChange,
      })
    );

    expect(result.current.mode).toBe("code");

    // Switch to visual mode
    act(() => {
      result.current.setMode("visual", 42);
    });

    expect(result.current.mode).toBe("visual");
    expect(result.current.activeOffset).toBe(42);
    expect(result.current.ast).not.toBeNull();
    expect(result.current.verifySourceByteFidelity()).toBe(true);
    expect(yText.toString()).toBe(raw);
    expect(computeTextHash(yText.toString())).toBe(initialHash);

    // Switch back to code mode without making any edits
    act(() => {
      result.current.setMode("code", 42);
    });

    expect(result.current.mode).toBe("code");
    expect(result.current.verifySourceByteFidelity()).toBe(true);
    expect(yText.toString()).toBe(raw);
    expect(computeTextHash(yText.toString())).toBe(initialHash);
  });

  it("guarantees byte fidelity even on malformed or incomplete LaTeX source", () => {
    const raw = `\\section{Broken {Unclosed brace
\\begin{tabular}{|l|
no end tabular here`;

    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);
    const initialHash = computeTextHash(raw);

    const { result } = renderHook(() =>
      useEditorModeSwitch({
        yText,
        initialMode: "code",
      })
    );

    act(() => {
      result.current.toggleMode();
    });

    expect(result.current.mode).toBe("visual");
    expect(yText.toString()).toBe(raw);
    expect(computeTextHash(yText.toString())).toBe(initialHash);

    act(() => {
      result.current.toggleMode();
    });

    expect(result.current.mode).toBe("code");
    expect(yText.toString()).toBe(raw);
    expect(computeTextHash(yText.toString())).toBe(initialHash);
  });

  it("tracks visual edit state when visual mutation occurs", () => {
    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, "Simple paragraph.");

    const { result } = renderHook(() =>
      useEditorModeSwitch({
        yText,
        initialMode: "code",
      })
    );

    act(() => {
      result.current.setMode("visual");
    });
    expect(result.current.hasUncommittedEdits).toBe(false);

    act(() => {
      result.current.recordVisualEdit();
    });
    expect(result.current.hasUncommittedEdits).toBe(true);
  });
});
