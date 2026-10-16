import { describe, it, expect } from "vitest";
import { parseBibLog, resolveBibliographyArgv } from "../../../apps/tex-executor/src/bibliography.js";
import { extractBibKeys, findDuplicateBibKeys } from "@latex-collab/editor";

describe("Regression CMP-06 (S10-T10): Multi-pass bibliography compilation and citation handling", () => {
  it("parses BibTeX warning logs correctly", () => {
    const bibLog = `This is BibTeX, Version 0.99d
Database file #1: refs.bib
Warning--I didn't find a database entry for "missingKey"
`;
    const parsed = parseBibLog(bibLog);
    expect(parsed.warnings.some((w) => w.includes("missingKey"))).toBe(true);
  });

  it("extracts and validates duplicate keys across entries", () => {
    const bib = `
@article{key1, title={Title 1}}
@book{key2, title={Title 2}}
@inproceedings{key1, title={Title 3}}
`;
    const keys = extractBibKeys(bib);
    expect(keys).toEqual(["key1", "key2", "key1"]);

    const duplicates = findDuplicateBibKeys(bib);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.key).toBe("key1");
    expect(duplicates[0]?.count).toBe(2);
  });

  it("resolves bibliography executable argv safely", () => {
    const biber = resolveBibliographyArgv("biber", { outDir: "build", baseName: "thesis" });
    expect(biber).toEqual(["--output-directory=build", "thesis"]);

    const bibtex = resolveBibliographyArgv("bibtex", { outDir: "build", baseName: "thesis" });
    expect(bibtex).toEqual(["build/thesis"]);
  });
});
