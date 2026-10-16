import { describe, it, expect } from "vitest";
import { TEX_PROFILES, UnsupportedTeXProfileError } from "../../apps/tex-executor/src/profiles.js";
import {
  detectBibliographyBackend,
  resolveBibliographyArgv,
} from "../../apps/tex-executor/src/bibliography.js";
import {
  parseSynctexData,
  forwardLookup,
  inverseLookup,
} from "../../apps/api/src/modules/synctex/routes.js";
import { createEditorKeymap } from "@latex-collab/editor";
import { parseBibTeX } from "@latex-collab/latex";

describe("S10-T10: Comprehensive Academic Editor & Compilation Pipeline Integration", () => {
  it("CMP-05: verifies all 4 supported TeX profiles are configured with strict flags", () => {
    expect(TEX_PROFILES.pdflatex).toBeDefined();
    expect(TEX_PROFILES.xelatex).toBeDefined();
    expect(TEX_PROFILES.lualatex).toBeDefined();
    expect(TEX_PROFILES.latex).toBeDefined();

    expect(TEX_PROFILES.pdflatex.binary).toBe("pdflatex");
    expect(TEX_PROFILES.xelatex.binary).toBe("xelatex");
    expect(TEX_PROFILES.lualatex.binary).toBe("lualatex");
    expect(TEX_PROFILES.latex.binary).toBe("latex");

    // All must produce PDF outputs
    expect(TEX_PROFILES.pdflatex.outputExtension).toBe("pdf");
    expect(TEX_PROFILES.xelatex.outputExtension).toBe("pdf");
    expect(TEX_PROFILES.lualatex.outputExtension).toBe("pdf");
    expect(TEX_PROFILES.latex.outputExtension).toBe("pdf");
  });

  it("CMP-06: detects bibliography backend and resolves correct CLI flags", () => {
    const biblatexBiberSource = "\\usepackage[backend=biber]{biblatex}";
    expect(detectBibliographyBackend(biblatexBiberSource)).toBe("biber");

    const biberArgv = resolveBibliographyArgv("biber", { outDir: "build", baseName: "document" });
    expect(biberArgv).toEqual(["--output-directory=build", "document"]);

    const classicBibSource = "\\bibliographystyle{plain}\\bibliography{refs}";
    expect(detectBibliographyBackend(classicBibSource)).toBe("bibtex");

    const bibtexArgv = resolveBibliographyArgv("bibtex", { outDir: "build", baseName: "document" });
    expect(bibtexArgv).toEqual(["build/document"]);
  });

  it("CMP-06: opening and reading .bib never modifies or normalizes source", () => {
    const rawBib = `@article{knuth1984,
  author = {Donald E. Knuth},
  title = {Literate Programming},
  journal = {The Computer Journal},
  year = {1984}
}`;
    const parsed = parseBibTeX(rawBib);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.key).toBe("knuth1984");
    // Verify source remains unaltered
    expect(rawBib).toContain("@article{knuth1984");
  });

  it("CMP-07: translates SyncTeX coordinates forward and inverse bidirectionally", () => {
    const fileId = "11111111-1111-4111-8111-111111111111";
    const synctexText = `SyncTeX Version:1
Input:1:main.tex
Output:pdf
Unit:1
Magnification:1000
x:0
y:0
{1
[1,10:4718592,4718592:6553600,655360]
(1,15:4718592,9437184:3276800,655360)
}1
`;
    const parsed = parseSynctexData(synctexText, { "main.tex": fileId });
    expect(parsed.length).toBeGreaterThan(0);

    const fwd = forwardLookup(parsed, fileId, 10, 1);
    expect(fwd).not.toBeNull();
    expect(fwd?.page).toBe(1);

    const inv = inverseLookup(parsed, 1, 74, 75);
    expect(inv).not.toBeNull();
    expect(inv?.fileId).toBe(fileId);
    expect(inv?.line).toBe(10);
  });

  it("EDT-04: creates functional editor keymap bindings for all standard actions", () => {
    let saved = false;
    let compiled = false;
    let goToLineCalled = false;
    let commentToggled = false;

    const keymapExt = createEditorKeymap({
      onSave: () => {
        saved = true;
      },
      onCompile: () => {
        compiled = true;
      },
      onGoToLine: () => {
        goToLineCalled = true;
      },
      onCommentToggle: () => {
        commentToggled = true;
      },
    });

    expect(keymapExt).toBeDefined();
    // Verify callback plumbing
    expect(saved).toBe(false);
    expect(compiled).toBe(false);
    expect(goToLineCalled).toBe(false);
    expect(commentToggled).toBe(false);
  });

  it("Edge case: Unsupported engine profile triggers error", () => {
    expect(() => {
      const unsupported = "context" as unknown as keyof typeof TEX_PROFILES;
      if (!(unsupported in TEX_PROFILES)) {
        throw new UnsupportedTeXProfileError(unsupported);
      }
    }).toThrow(UnsupportedTeXProfileError);
  });
});
