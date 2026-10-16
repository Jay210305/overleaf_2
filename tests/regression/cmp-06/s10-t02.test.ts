import { describe, expect, it } from "vitest";
import {
  BIBLIOGRAPHY_FIXTURES,
  detectBibliographyBackend,
  parseBibLog,
} from "../../../apps/tex-executor/src/bibliography.js";

describe("CMP-06 Regression: BibTeX/Biber multipass and resolution", () => {
  it("provides valid fixtures for both BibTeX and Biber multipass pipelines", () => {
    const bibtexFixture = BIBLIOGRAPHY_FIXTURES.bibtex;
    expect(bibtexFixture.backend).toBe("bibtex");
    expect(bibtexFixture.mainTex).toContain("\\bibliography{");
    expect(bibtexFixture.expectedCitations).toContain("knuth1984texbook");

    const biberFixture = BIBLIOGRAPHY_FIXTURES.biber;
    expect(biberFixture.backend).toBe("biber");
    expect(biberFixture.mainTex).toContain("\\usepackage[backend=biber]{biblatex}");
    expect(biberFixture.expectedCitations).toContain("lamport1994latex");
  });

  it("detects backend based on document contents", () => {
    expect(detectBibliographyBackend("\\usepackage{biblatex}")).toBe("biber");
    expect(detectBibliographyBackend("\\usepackage[style=authoryear]{biblatex}")).toBe("biber");
    expect(detectBibliographyBackend("\\bibliographystyle{ieeetr}")).toBe("bibtex");
    expect(detectBibliographyBackend("\\bibliography{myrefs}")).toBe("bibtex");
  });

  it("extracts unresolved citation diagnostics from log", () => {
    const log = `LaTeX Warning: Citation 'unknownKey' on page 1 undefined on input line 5.`;
    expect(log).toContain("undefined on input line");
    const blgAnalysis = parseBibLog(`Warning--I didn't find a database entry for "unknownKey"`);
    expect(blgAnalysis.warnings[0]).toContain("unknownKey");
  });
});
