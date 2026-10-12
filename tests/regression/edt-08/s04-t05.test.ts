import { describe, expect, it } from "vitest";
import {
  searchAcrossFiles,
  previewReplace,
} from "../../../packages/editor/src/keymap.js";

describe("EDT-08 S04-T05 Search and replace locally and across project with regex and preview", () => {
  const projectFiles = [
    {
      id: "f1",
      name: "intro.tex",
      content: "This is a LaTeX sample document.\nLaTeX is powerful.\nLatex is sometimes capitalized differently.",
    },
    {
      id: "f2",
      name: "results.tex",
      content: "Final results shown using LaTeX equations.\nCheck table 1.",
    },
  ];

  it("finds case-sensitive exact matches across project files", () => {
    const matches = searchAcrossFiles(projectFiles, {
      query: "LaTeX",
      caseSensitive: true,
      isRegex: false,
    });

    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.fileName)).toEqual(["intro.tex", "intro.tex", "results.tex"]);
  });

  it("finds case-insensitive matches", () => {
    const matches = searchAcrossFiles(projectFiles, {
      query: "latex",
      caseSensitive: false,
      isRegex: false,
    });

    expect(matches).toHaveLength(4);
  });

  it("supports regex pattern and generates replacement preview", () => {
    const matches = searchAcrossFiles(projectFiles, {
      query: "table \\d+",
      isRegex: true,
      caseSensitive: false,
    });

    expect(matches).toHaveLength(1);
    const m = matches[0]!;
    expect(m.fileName).toBe("results.tex");
    expect(m.lineContent).toBe("Check table 1.");

    const replaced = previewReplace(m.lineContent, m.startIndex, m.endIndex, "Table~\\ref{tab:1}");
    expect(replaced).toBe("Check Table~\\ref{tab:1}.");
  });
});
