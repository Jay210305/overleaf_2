import { describe, it, expect } from "vitest";
import { checkSpelling } from "@latex-collab/editor";

describe("Regression EDT-11: Local spell checking leaves LaTeX commands unchanged", () => {
  it("does not flag LaTeX markup keywords as misspellings", () => {
    const markup = "\\textbf{bold text} \\textit{italic text} \\emph{emphasized}";
    const errors = checkSpelling(markup);
    // Should not flag textbf, textit, emph
    const words = errors.map((e) => e.word);
    expect(words).not.toContain("textbf");
    expect(words).not.toContain("textit");
    expect(words).not.toContain("emph");
  });

  it("identifies misspelled words inside section titles without flagging the command", () => {
    const section = "\\section{A brand nuw approach}";
    const errors = checkSpelling(section);

    expect(errors.length).toBe(1);
    expect(errors[0]?.word).toBe("nuw");
    expect(errors[0]?.suggestions).toContain("new");
  });

  it("leaves citation keys alone in cite commands", () => {
    const citation =
      "According to previous studies \\cite{knuth1984texbook,lamport94latex}, the method holds.";
    const errors = checkSpelling(citation);
    const words = errors.map((e) => e.word);
    expect(words).not.toContain("knuth1984texbook");
    expect(words).not.toContain("lamport94latex");
  });
});
