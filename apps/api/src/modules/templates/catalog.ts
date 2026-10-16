import { createHash } from "node:crypto";
import type { TemplateView } from "@latex-collab/contracts";

type TemplateSource = {
  id: string;
  title: string;
  category: string;
  description: string;
  version: "1.0.0";
  mainPath: string;
  files: Array<{ path: string; mime: string; content: string }>;
};

const MINIMAL_ARTICLE_MAIN = `\\documentclass{article}
\\title{Untitled}
\\author{}
\\begin{document}
\\maketitle

\\section{Introduction}
Write here.

\\end{document}
`;

const THESIS_MAIN = `\\documentclass{report}
\\title{Thesis}
\\author{}
\\begin{document}
\\maketitle
\\tableofcontents

\\include{chapters/intro}

\\bibliographystyle{plain}
\\bibliography{refs}
\\end{document}
`;

const THESIS_INTRO = `\\chapter{Introduction}
Background and goals.

\\cite{key}
`;

const THESIS_BIB = `@book{key,
  title = {Reference work},
  author = {Author},
  year = {2024},
  publisher = {Press}
}
`;

const SOURCES: TemplateSource[] = [
  {
    id: "minimal-article",
    title: "Minimal article",
    category: "article",
    description: "A minimal single-file article to start writing immediately.",
    version: "1.0.0",
    mainPath: "main.tex",
    files: [{ path: "main.tex", mime: "application/x-tex", content: MINIMAL_ARTICLE_MAIN }],
  },
  {
    id: "thesis-outline",
    title: "Thesis outline",
    category: "thesis",
    description: "A report with one chapter include and a bibliography file.",
    version: "1.0.0",
    mainPath: "main.tex",
    files: [
      { path: "main.tex", mime: "application/x-tex", content: THESIS_MAIN },
      { path: "chapters/intro.tex", mime: "application/x-tex", content: THESIS_INTRO },
      { path: "refs.bib", mime: "application/x-bibtex", content: THESIS_BIB },
    ],
  },
];

function fileHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * The two original internal templates. Sources are versioned in code;
 * content hashes are computed at load so any source change alters the
 * manifest hash. No template carries project members or external
 * authorization: instantiation always creates a member-free project owned
 * solely by the requesting actor.
 */
export type InternalTemplate = TemplateView & {
  filesWithContent: Array<{ path: string; mime: string; content: string }>;
};

function buildTemplate(source: TemplateSource): InternalTemplate {
  const files = source.files.map((file) => ({
    path: file.path,
    sha256: fileHash(file.content),
    sizeBytes: Buffer.byteLength(file.content, "utf8"),
    mime: file.mime,
  }));
  const manifestHash = createHash("sha256")
    .update(JSON.stringify(files.map((file) => [file.path, file.sha256, file.sizeBytes])), "utf8")
    .digest("hex");
  return {
    id: source.id,
    title: source.title,
    category: source.category,
    description: source.description,
    version: source.version,
    manifestHash,
    mainPath: source.mainPath,
    files,
    filesWithContent: source.files,
  };
}

const CATALOG: InternalTemplate[] = SOURCES.map(buildTemplate);

export function listTemplates(category?: string): InternalTemplate[] {
  if (!category) return [...CATALOG];
  return CATALOG.filter((template) => template.category === category);
}

export function getTemplate(templateId: string): InternalTemplate | null {
  return CATALOG.find((template) => template.id === templateId) ?? null;
}
