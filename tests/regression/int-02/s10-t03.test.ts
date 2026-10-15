import { describe, expect, it } from "vitest";
import { parseBibTeX, searchBibEntries } from "../../../packages/latex/src/bib.js";

describe("INT-02 Regression: Local reference search across key, title, author, DOI, year", () => {
  const bib = `@article{turing1936,
  author = {Alan M. Turing},
  title = {On Computable Numbers, with an Application to the Entscheidungsproblem},
  year = {1936},
  doi = {10.1112/plms/s2-42.1.230}
}
@article{shannon1948,
  author = {Claude E. Shannon},
  title = {A Mathematical Theory of Communication},
  year = {1948},
  journal = {Bell System Technical Journal}
}`;

  it("searches locally by key", () => {
    const { entries } = parseBibTeX(bib);
    expect(searchBibEntries(entries, "turing")).toHaveLength(1);
    expect(searchBibEntries(entries, "turing")[0]?.key).toBe("turing1936");
  });

  it("searches locally by title", () => {
    const { entries } = parseBibTeX(bib);
    expect(searchBibEntries(entries, "computable")).toHaveLength(1);
    expect(searchBibEntries(entries, "mathematical")).toHaveLength(1);
  });

  it("searches locally by author", () => {
    const { entries } = parseBibTeX(bib);
    expect(searchBibEntries(entries, "shannon")).toHaveLength(1);
  });

  it("searches locally by year", () => {
    const { entries } = parseBibTeX(bib);
    expect(searchBibEntries(entries, "1936")).toHaveLength(1);
  });

  it("searches locally by DOI", () => {
    const { entries } = parseBibTeX(bib);
    expect(searchBibEntries(entries, "10.1112/plms")).toHaveLength(1);
  });
});
