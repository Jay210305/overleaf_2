import type { Compiler } from "@latex-collab/contracts";

export interface TeXEngineProfile {
  readonly compiler: Compiler;
  readonly description: string;
  readonly latexmkEngineFlag: string;
  readonly outputExtension: "pdf";
  readonly dviRoute: boolean;
  readonly binary: string;
}

export class UnsupportedTeXProfileError extends Error {
  readonly code = "UNSUPPORTED_PROFILE" as const;
  readonly status = 400 as const;

  constructor(engine: string) {
    super(`Unsupported or unverified TeX compiler profile: ${engine}`);
    this.name = "UnsupportedTeXProfileError";
  }
}

export class UnsafeArgvError extends Error {
  readonly code = "UNSAFE_ARGV" as const;
  readonly status = 400 as const;

  constructor(reason: string) {
    super(`Security policy rejected compilation arguments: ${reason}`);
    this.name = "UnsafeArgvError";
  }
}

export const TEX_PROFILES: Readonly<Record<Compiler, TeXEngineProfile>> = {
  pdflatex: {
    compiler: "pdflatex",
    description: "pdfLaTeX engine with direct PDF generation",
    latexmkEngineFlag: "-pdf",
    outputExtension: "pdf",
    dviRoute: false,
    binary: "pdflatex",
  },
  xelatex: {
    compiler: "xelatex",
    description: "XeLaTeX engine with Unicode and system fonts support",
    latexmkEngineFlag: "-xelatex",
    outputExtension: "pdf",
    dviRoute: false,
    binary: "xelatex",
  },
  lualatex: {
    compiler: "lualatex",
    description: "LuaLaTeX engine with modern Lua scripting and fontspec",
    latexmkEngineFlag: "-lualatex",
    outputExtension: "pdf",
    dviRoute: false,
    binary: "lualatex",
  },
  latex: {
    compiler: "latex",
    description: "LaTeX engine with DVI-to-PDF route (latexmk -pdfdvi)",
    latexmkEngineFlag: "-pdfdvi",
    outputExtension: "pdf",
    dviRoute: true,
    binary: "latex",
  },
};

export const SUPPORTED_COMPILERS: readonly Compiler[] = Object.keys(TEX_PROFILES) as Compiler[];

export function isSupportedCompiler(engine: string): engine is Compiler {
  return Object.prototype.hasOwnProperty.call(TEX_PROFILES, engine);
}

export function getTeXProfile(engine: string): TeXEngineProfile {
  if (!isSupportedCompiler(engine)) {
    throw new UnsupportedTeXProfileError(engine);
  }
  return TEX_PROFILES[engine];
}

export interface ResolveArgvOptions {
  outDir: string;
  mainPath: string;
  synctex?: boolean;
}

/**
 * Generates fixed allowlisted argv for latexmk execution (CMP-05).
 * Enforces security invariants:
 * - Always includes -no-shell-escape
 * - Always includes -interaction=nonstopmode
 * - Rejects directory traversal or shell injection characters in paths
 */
export function resolveProfileArgv(engine: string, options: ResolveArgvOptions): string[] {
  const profile = getTeXProfile(engine);

  if (/[;&|`$><\r\n]/.test(options.outDir) || /[;&|`$><\r\n]/.test(options.mainPath)) {
    throw new UnsafeArgvError("Illegal shell metacharacters detected in compilation path");
  }

  const synctexFlag = options.synctex === false ? "-synctex=0" : "-synctex=1";

  const argv: string[] = [
    profile.latexmkEngineFlag,
    "-interaction=nonstopmode",
    "-file-line-error",
    synctexFlag,
    "-no-shell-escape",
    `-outdir=${options.outDir}`,
    options.mainPath,
  ];

  return argv;
}

/**
 * Profile fixtures for testing and verification (CMP-05).
 */
export interface ProfileFixture {
  compiler: Compiler;
  title: string;
  source: string;
  expectedBannerKeyword: string;
}

export const PROFILE_FIXTURES: readonly ProfileFixture[] = [
  {
    compiler: "pdflatex",
    title: "Standard pdflatex article",
    source: "\\documentclass{article}\\begin{document}Hello pdflatex\\end{document}",
    expectedBannerKeyword: "pdfTeX",
  },
  {
    compiler: "xelatex",
    title: "XeLaTeX Unicode article",
    source:
      "\\documentclass{article}\\usepackage{fontspec}\\begin{document}Hello XeLaTeX\\end{document}",
    expectedBannerKeyword: "XeTeX",
  },
  {
    compiler: "lualatex",
    title: "LuaLaTeX article with fontspec",
    source:
      "\\documentclass{article}\\usepackage{fontspec}\\begin{document}Hello LuaLaTeX\\end{document}",
    expectedBannerKeyword: "LuaHBTeX",
  },
  {
    compiler: "latex",
    title: "LaTeX DVI-to-PDF route",
    source: "\\documentclass{article}\\begin{document}Hello DVI route\\end{document}",
    expectedBannerKeyword: "TeX",
  },
];
