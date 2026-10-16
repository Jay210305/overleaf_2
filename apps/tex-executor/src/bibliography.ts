export type BibliographyBackend = "bibtex" | "biber" | "none";

export interface BibliographyOptions {
  backend: BibliographyBackend;
  outDir: string;
  baseName: string;
}

export interface BibLogAnalysis {
  backend: BibliographyBackend;
  errors: string[];
  warnings: string[];
  resolvedEntries: number;
}

/**
 * Detects whether the TeX document specifies BibTeX or Biber (via biblatex).
 * Defaults to 'bibtex' if \bibliography is present; 'biber' if \usepackage{biblatex} is detected.
 */
export function detectBibliographyBackend(sourceText: string): BibliographyBackend {
  // Check for biblatex package usage
  if (/\\usepackage(\[[^\]]*\])?\{biblatex\}/i.test(sourceText)) {
    return "biber";
  }
  // Check for traditional BibTeX commands
  if (
    /\\bibliography\{[^}]+\}/i.test(sourceText) ||
    /\\bibliographystyle\{[^}]+\}/i.test(sourceText)
  ) {
    return "bibtex";
  }
  return "none";
}

/**
 * Returns fixed allowlisted arguments for direct execution of bibtex or biber if needed.
 */
export function resolveBibliographyArgv(
  backend: "bibtex" | "biber",
  options: { outDir: string; baseName: string },
): string[] {
  if (/[;&|`$><\r\n]/.test(options.outDir) || /[;&|`$><\r\n]/.test(options.baseName)) {
    throw new Error("Illegal metacharacters in bibliography execution path");
  }

  if (backend === "biber") {
    return [`--output-directory=${options.outDir}`, options.baseName];
  }

  return [`${options.outDir}/${options.baseName}`];
}

/**
 * Parses .blg (bibliography log) file from either BibTeX or Biber.
 */
export function parseBibLog(blgContent: string): BibLogAnalysis {
  const isBiber = blgContent.includes("Biber") || blgContent.includes("biber");
  const backend: BibliographyBackend = isBiber ? "biber" : "bibtex";
  const errors: string[] = [];
  const warnings: string[] = [];
  let resolvedEntries = 0;

  const lines = blgContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (backend === "bibtex") {
      if (/^Warning--/i.test(trimmed)) {
        warnings.push(trimmed.replace(/^Warning--\s*/i, ""));
      } else if (/(error message|I found no|couldn't open database)/i.test(trimmed)) {
        errors.push(trimmed);
      } else if (/Database file #\d+:/i.test(trimmed)) {
        resolvedEntries += 1;
      }
    } else {
      // Biber format
      if (/>\s*WARN\s*-\s*/i.test(trimmed)) {
        warnings.push(trimmed.replace(/^.*?>\s*WARN\s*-\s*/i, ""));
      } else if (/>\s*ERROR\s*-\s*/i.test(trimmed)) {
        errors.push(trimmed.replace(/^.*?>\s*ERROR\s*-\s*/i, ""));
      } else if (/Found \d+ citekeys in bib section/i.test(trimmed)) {
        const match = trimmed.match(/Found (\d+) citekeys/i);
        if (match && match[1]) {
          resolvedEntries = parseInt(match[1], 10);
        }
      }
    }
  }

  return {
    backend,
    errors,
    warnings,
    resolvedEntries,
  };
}

/**
 * Multipass fixture definition for integration testing (CMP-06).
 */
export interface BibliographyFixture {
  backend: BibliographyBackend;
  mainTex: string;
  bibContent: string;
  expectedCitations: string[];
}

export const BIBLIOGRAPHY_FIXTURES: Record<"bibtex" | "biber", BibliographyFixture> = {
  bibtex: {
    backend: "bibtex",
    mainTex: `\\documentclass{article}
\\begin{document}
According to \\cite{knuth1984texbook}, TeX is a typesetting system.
\\bibliographystyle{plain}
\\bibliography{references}
\\end{document}`,
    bibContent: `@book{knuth1984texbook,
  author = {Donald E. Knuth},
  title = {The TeXbook},
  year = {1984},
  publisher = {Addison-Wesley}
}`,
    expectedCitations: ["knuth1984texbook"],
  },
  biber: {
    backend: "biber",
    mainTex: `\\documentclass{article}
\\usepackage[backend=biber]{biblatex}
\\addbibresource{references.bib}
\\begin{document}
According to \\cite{lamport1994latex}, LaTeX is built on TeX.
\\printbibliography
\\end{document}`,
    bibContent: `@book{lamport1994latex,
  author = {Leslie Lamport},
  title = {LaTeX: A Document Preparation System},
  year = {1994},
  publisher = {Addison-Wesley}
}`,
    expectedCitations: ["lamport1994latex"],
  },
};
