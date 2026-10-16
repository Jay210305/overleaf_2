import { describe, expect, it } from "vitest";
import {
  BIBLIOGRAPHY_FIXTURES,
  detectBibliographyBackend,
  parseBibLog,
  resolveBibliographyArgv,
} from "../../apps/tex-executor/src/bibliography.js";
import {
  extractBibKeys,
  extractBibSummaries,
  findDuplicateBibKeys,
  getCitationQueryAtCursor,
  insertCitation,
} from "../../packages/editor/src/citations.js";

describe("S10-T02 Integration: Bibliography multipass and citation completion", () => {
  it("detects backend correctly from document source", () => {
    expect(detectBibliographyBackend(BIBLIOGRAPHY_FIXTURES.bibtex.mainTex)).toBe("bibtex");
    expect(detectBibliographyBackend(BIBLIOGRAPHY_FIXTURES.biber.mainTex)).toBe("biber");
    expect(detectBibliographyBackend("\\documentclass{article}\\begin{document}No bib\\end{document}")).toBe("none");
  });

  it("resolves allowlisted argv for bibtex and biber backends", () => {
    const bibtexArgv = resolveBibliographyArgv("bibtex", { outDir: "/tmp/out", baseName: "main" });
    expect(bibtexArgv).toEqual(["/tmp/out/main"]);

    const biberArgv = resolveBibliographyArgv("biber", { outDir: "/tmp/out", baseName: "main" });
    expect(biberArgv).toEqual(["--output-directory=/tmp/out", "main"]);

    expect(() =>
      resolveBibliographyArgv("bibtex", { outDir: "/tmp/out; rm -rf /", baseName: "main" }),
    ).toThrow(/Illegal metacharacters/);
  });

  it("parses BibTeX and Biber .blg log output and extracts warnings/errors", () => {
    const bibtexLog = `This is BibTeX, Version 0.99d
Database file #1: references.bib
Warning--empty journal in knuth1984
(There was 1 warning)`;

    const bibtexAnalysis = parseBibLog(bibtexLog);
    expect(bibtexAnalysis.backend).toBe("bibtex");
    expect(bibtexAnalysis.warnings).toContain("empty journal in knuth1984");
    expect(bibtexAnalysis.errors).toHaveLength(0);
    expect(bibtexAnalysis.resolvedEntries).toBe(1);

    const biberLog = `[0] Config.pm:307> INFO - This is Biber 2.19
[1] Biber.pm:440> INFO - Found 2 citekeys in bib section 0
[2] Biber.pm:130> WARN - I didn't find a database entry for 'missing2020'`;

    const biberAnalysis = parseBibLog(biberLog);
    expect(biberAnalysis.backend).toBe("biber");
    expect(biberAnalysis.resolvedEntries).toBe(2);
    expect(biberAnalysis.warnings).toContain("I didn't find a database entry for 'missing2020'");
  });

  it("extracts citation keys and summaries without altering source", () => {
    const bibSource = `@article{einstein1905,
  author = {Albert Einstein},
  title = {Zur Elektrodynamik bewegter K{\\"o}rper},
  year = {1905}
}

@book{knuth1984,
  author = {Donald Knuth},
  title = {The TeXbook},
  year = {1984}
}`;

    const keys = extractBibKeys(bibSource);
    expect(keys).toEqual(["einstein1905", "knuth1984"]);

    const summaries = extractBibSummaries(bibSource);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.key).toBe("einstein1905");
    expect(summaries[0]?.author).toBe("Albert Einstein");
    expect(summaries[1]?.year).toBe("1984");
  });

  it("detects duplicate keys in .bib files", () => {
    const bibWithDups = `@article{key1, title = {First}}
@article{key2, title = {Second}}
@article{key1, title = {Duplicate key1}}`;

    const dups = findDuplicateBibKeys(bibWithDups);
    expect(dups).toHaveLength(1);
    expect(dups[0]?.key).toBe("key1");
    expect(dups[0]?.count).toBe(2);
    expect(dups[0]?.lines).toEqual([1, 3]);
  });

  it("detects citation context and inserts citation key correctly", () => {
    const doc1 = "As seen in \\cite{eins";
    const ctx1 = getCitationQueryAtCursor(doc1, doc1.length);
    expect(ctx1).not.toBeNull();
    expect(ctx1?.query).toBe("eins");

    const inserted1 = insertCitation(doc1, doc1.length, "einstein1905");
    expect(inserted1.newText).toBe("As seen in \\cite{einstein1905}");

    // Multi-key citation context
    const doc2 = "As seen in \\cite{knuth1984, eins";
    const ctx2 = getCitationQueryAtCursor(doc2, doc2.length);
    expect(ctx2?.query).toBe("eins");

    const inserted2 = insertCitation(doc2, doc2.length, "einstein1905");
    expect(inserted2.newText).toBe("As seen in \\cite{knuth1984, einstein1905}");

    // Standalone insertion when not inside cite command
    const doc3 = "Reference here ";
    const inserted3 = insertCitation(doc3, doc3.length, "knuth1984");
    expect(inserted3.newText).toBe("Reference here \\cite{knuth1984}");
  });

  it("rejects invalid citation keys", () => {
    expect(() => insertCitation("text", 4, "bad key with spaces")).toThrow(/Invalid citation key/);
    expect(() => insertCitation("text", 4, "key,comma")).toThrow(/Invalid citation key/);
  });

  it("detects duplicate keys in multiline entries where key is on a subsequent line", () => {
    const bib = `@article{
  multikey,
  title = {First}
}

@article{
  multikey,
  title = {Second}
}`;

    const dups = findDuplicateBibKeys(bib);
    expect(dups).toHaveLength(1);
    expect(dups[0]?.key).toBe("multikey");
    expect(dups[0]?.count).toBe(2);
    expect(dups[0]?.lines).toEqual([1, 6]);
  });

  it("extracts summaries with nested braces preserved", () => {
    const bib = `@book{companion,
  title = {The {LaTeX} Companion},
  author = {{Mittelbach}, Frank},
  year = 2004
}`;

    const summaries = extractBibSummaries(bib);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.title).toBe("The {LaTeX} Companion");
    expect(summaries[0]?.author).toBe("{Mittelbach}, Frank");
    expect(summaries[0]?.year).toBe("2004");
  });
});

