// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import * as Y from "yjs";
import { computeTextHash } from "@latex-collab/latex";
import { useEditorModeSwitch } from "../../../apps/web/src/features/visual/mode-switch.js";

afterEach(() => {
  cleanup();
});

describe("S11-T07 Regression EDT-13: Mode Switching Invariants", () => {
  it("EDT-13: Multiple code-visual mode switches leave canonical source hash invariant", () => {
    const raw = `% Important comment header
\\documentclass{IEEEtran}
\\begin{document}
\\title{Deep Space Exploration}
\\author{Alice \\and Bob}
\\maketitle
\\begin{abstract}
We explore outer space with \\LaTeX{}.
\\end{abstract}
\\section{Introduction}
Text with strange spacing:   three spaces   here.
\\end{document}
% Trailing comment without newline`;

    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, raw);
    const expectedHash = computeTextHash(raw);

    const { result } = renderHook(() =>
      useEditorModeSwitch({
        yText,
        initialMode: "code",
      }),
    );

    // Switch to visual and back 5 times
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.setMode("visual");
      });
      expect(result.current.mode).toBe("visual");
      expect(computeTextHash(yText.toString())).toBe(expectedHash);

      act(() => {
        result.current.setMode("code");
      });
      expect(result.current.mode).toBe("code");
      expect(computeTextHash(yText.toString())).toBe(expectedHash);
    }

    expect(yText.toString()).toBe(raw);
  });

  it("EDT-13: Erroneous LaTeX source preserves raw text across mode transitions", () => {
    const brokenRaw = `\\begin{equation}
\\incompleteMacro{
% missing end and close brace`;

    const yDoc = new Y.Doc();
    const yText = yDoc.getText("content");
    yText.insert(0, brokenRaw);
    const expectedHash = computeTextHash(brokenRaw);

    const { result } = renderHook(() =>
      useEditorModeSwitch({
        yText,
        initialMode: "code",
      }),
    );

    act(() => {
      result.current.toggleMode();
    });

    expect(result.current.mode).toBe("visual");
    expect(yText.toString()).toBe(brokenRaw);
    expect(computeTextHash(yText.toString())).toBe(expectedHash);

    act(() => {
      result.current.toggleMode();
    });

    expect(result.current.mode).toBe("code");
    expect(yText.toString()).toBe(brokenRaw);
    expect(computeTextHash(yText.toString())).toBe(expectedHash);
  });
});
