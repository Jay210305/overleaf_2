import { describe, expect, it } from "vitest";
import {
  normalizeBibTeX,
  parseBibTeX,
  searchBibEntries,
} from "../../packages/latex/src/bib.js";

describe("S10-T03 Integration: Index BibTeX and search local references", () => {
  const sampleBib = `@article{einstein1905,
  author = {Albert Einstein},
  title = {On the Electrodynamics of Moving Bodies},
  journal = {Annalen der Physik},
  year = {1905},
  doi = {10.1002/andp.19053221004}
}

@book{knuth1984,
  author = {Donald E. Knuth},
  title = {The TeXbook},
  publisher = {Addison-Wesley},
  year = {1984}
}

@article{einstein1905,
  author = {Albert Einstein},
  title = {Duplicate entry for testing},
  year = {1905}
}`;

  it("parses BibTeX entries and reports duplicate keys with line numbers", () => {
    const result = parseBibTeX(sampleBib);
    expect(result.entries).toHaveLength(3);
    expect(result.duplicateKeys).toHaveLength(1);
    expect(result.duplicateKeys[0]?.key).toBe("einstein1905");
    expect(result.duplicateKeys[0]?.count).toBe(2);
    expect(result.duplicateKeys[0]?.lines).toEqual([1, 16]);
  });

  it("preserves exact raw source for each entry without alteration", () => {
    const result = parseBibTeX(sampleBib);
    const knuthEntry = result.entries.find((e) => e.key === "knuth1984");
    expect(knuthEntry).toBeDefined();
    expect(knuthEntry?.rawSource).toContain("publisher = {Addison-Wesley}");
    expect(knuthEntry?.title).toBe("The TeXbook");
    expect(knuthEntry?.author).toBe("Donald E. Knuth");
    expect(knuthEntry?.year).toBe("1984");
  });

  it("searches references locally across key, title, author, year, and DOI", () => {
    const { entries } = parseBibTeX(sampleBib);

    // Search by key
    const byKey = searchBibEntries(entries, "knuth");
    expect(byKey).toHaveLength(1);
    expect(byKey[0]?.key).toBe("knuth1984");

    // Search by title
    const byTitle = searchBibEntries(entries, "electrodynamics");
    expect(byTitle).toHaveLength(1);
    expect(byTitle[0]?.key).toBe("einstein1905");

    // Search by author
    const byAuthor = searchBibEntries(entries, "Albert Einstein");
    expect(byAuthor).toHaveLength(2);

    // Search by year
    const byYear = searchBibEntries(entries, "1984");
    expect(byYear).toHaveLength(1);
    expect(byYear[0]?.key).toBe("knuth1984");

    // Search by DOI
    const byDoi = searchBibEntries(entries, "10.1002/andp");
    expect(byDoi).toHaveLength(1);
    expect(byDoi[0]?.doi).toBe("10.1002/andp.19053221004");
  });

  it("structured filter search applies specific criteria", () => {
    const { entries } = parseBibTeX(sampleBib);

    const filtered = searchBibEntries(entries, {
      author: "Einstein",
      year: "1905",
      title: "Electrodynamics",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.key).toBe("einstein1905");

    const none = searchBibEntries(entries, {
      author: "Knuth",
      year: "1905", // mismatch
    });
    expect(none).toHaveLength(0);
  });

  it("normalizes BibTeX source only when explicitly requested (INT-08 invariant)", () => {
    const unnormalized = `@article{ bKey,  title = "B Entry" }
@book{ aKey, author = {Author A}, title = {A Entry} }`;

    const normalized = normalizeBibTeX(unnormalized, { sortByKey: true });
    expect(normalized).toContain("@book{aKey,");
    expect(normalized).toContain("@article{bKey,");
    // aKey comes before bKey after sortByKey
    expect(normalized.indexOf("aKey")).toBeLessThan(normalized.indexOf("bKey"));

    // Confirm that parseBibTeX itself never normalized
    const parsed = parseBibTeX(unnormalized);
    expect(parsed.entries[0]?.key).toBe("bKey"); // Original order preserved
  });

  it("accurately parses fields with nested braces, multiline keys, and multiple entries on a single line", () => {
    const bib = `@book{companion,
  title = {The {LaTeX} Companion},
  author = {{Mittelbach}, Frank and {Goossens}, Michel},
  year = 2004
} @article{
  multilineKey,
  author = {{World Health Organization}},
  title = {Global Report}
}`;

    const res = parseBibTeX(bib);
    expect(res.entries).toHaveLength(2);

    const companion = res.entries.find((e) => e.key === "companion");
    expect(companion).toBeDefined();
    expect(companion?.title).toBe("The {LaTeX} Companion");
    expect(companion?.author).toBe("{Mittelbach}, Frank and {Goossens}, Michel");
    expect(companion?.year).toBe("2004");

    const multi = res.entries.find((e) => e.key === "multilineKey");
    expect(multi).toBeDefined();
    expect(multi?.author).toBe("{World Health Organization}");
    expect(multi?.title).toBe("Global Report");
  });
});

