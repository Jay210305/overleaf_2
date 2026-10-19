import { describe, expect, it } from "vitest";
import {
  ContentPolicyError,
  classifyArchivePath,
  classifyUploadContent,
  verifyBinaryContent,
} from "@latex-collab/storage";

/**
 * Overleaf exports contain more than `.tex`: EPS figures, plain-text notes and
 * TikZ libraries are common. The archive policy must accept exactly those
 * additions while keeping signature verification for binaries.
 */
describe("upload content policy for Overleaf archives", () => {
  it.each([
    [".tex", "TEXT", "application/x-tex"],
    [".bib", "TEXT", "application/x-bibtex"],
    [".sty", "TEXT", "application/x-tex"],
    [".cls", "TEXT", "application/x-tex"],
    [".bst", "TEXT", "application/x-tex"],
    [".tikz", "TEXT", "application/x-tex"],
    [".txt", "TEXT", "text/plain"],
    [".eps", "BINARY", "application/postscript"],
    [".png", "BINARY", "image/png"],
  ])("accepts %s entries as %s", (extension, kind, mime) => {
    expect(classifyArchivePath(`figures/file${extension}`)).toEqual({ kind, mime });
  });

  it("keeps unsupported extensions and SVG out of the archive policy", () => {
    for (const path of ["notes.md", "figure.svg", "script.sh"]) {
      expect(() => classifyArchivePath(path)).toThrow(ContentPolicyError);
    }
    expect(() => classifyUploadContent("figure.svg", "image/svg+xml")).toThrow(ContentPolicyError);
  });

  it("accepts PostScript and DOS EPS signatures and rejects other binaries", () => {
    const postscript = new TextEncoder().encode("%!PS-Adobe-3.0 EPSF-3.0\n%%EOF");
    expect(() => verifyBinaryContent("logo.eps", postscript)).not.toThrow();
    const dosEps = new Uint8Array([0xc5, 0xd0, 0xd3, 0xc6, 0, 0, 0, 0]);
    expect(() => verifyBinaryContent("logo.eps", dosEps)).not.toThrow();
    expect(() =>
      verifyBinaryContent("logo.eps", new TextEncoder().encode("not postscript")),
    ).toThrow(ContentPolicyError);
  });
});
