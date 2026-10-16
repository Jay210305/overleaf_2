export interface FigureSnippetOptions {
  imagePath?: string;
  caption?: string;
  label?: string;
  width?: string;
}

export interface TableSnippetOptions {
  caption?: string;
  label?: string;
  columns?: number;
  rows?: number;
}

export interface EquationSnippetOptions {
  math?: string;
  label?: string;
}

export interface SectionSnippetOptions {
  title: string;
  level?: "section" | "subsection" | "subsubsection";
  label?: string;
}

export interface ListSnippetOptions {
  type?: "itemize" | "enumerate";
  items?: string[];
}

export interface LinkSnippetOptions {
  url: string;
  text?: string;
}

/**
 * Generates a valid LaTeX figure environment snippet (EDT-09).
 */
export function generateFigureSnippet(options: FigureSnippetOptions = {}): string {
  const imagePath = options.imagePath ?? "example-image.png";
  const caption = options.caption ?? "Figure caption";
  const label = options.label ? `\n  \\label{fig:${options.label}}` : "";
  const width = options.width ?? "0.8\\textwidth";

  return `\\begin{figure}[htbp]
  \\centering
  \\includegraphics[width=${width}]{${imagePath}}
  \\caption{${caption}}${label}
\\end{figure}`;
}

/**
 * Generates a valid LaTeX table environment snippet (EDT-09).
 */
export function generateTableSnippet(options: TableSnippetOptions = {}): string {
  const colsCount = Math.max(1, Math.min(10, options.columns ?? 3));
  const rowsCount = Math.max(1, Math.min(20, options.rows ?? 2));
  const caption = options.caption ?? "Table caption";
  const label = options.label ? `\n  \\label{tab:${options.label}}` : "";

  const colSpec = "| " + Array(colsCount).fill("c").join(" | ") + " |";
  const headerCells = Array.from({ length: colsCount }, (_, i) => `Header ${i + 1}`).join(" & ");
  const rowLines: string[] = [];

  for (let r = 0; r < rowsCount; r++) {
    const rowCells = Array.from({ length: colsCount }, (_, c) => `Item ${r + 1},${c + 1}`).join(
      " & ",
    );
    rowLines.push(`    ${rowCells} \\\\\n    \\hline`);
  }

  return `\\begin{table}[htbp]
  \\centering
  \\caption{${caption}}${label}
  \\begin{tabular}{${colSpec}}
    \\hline
    ${headerCells} \\\\
    \\hline
${rowLines.join("\n")}
  \\end{tabular}
\\end{table}`;
}

/**
 * Generates a valid LaTeX equation environment snippet (EDT-09).
 */
export function generateEquationSnippet(options: EquationSnippetOptions = {}): string {
  const math = options.math ?? "E = mc^2";
  const label = options.label ? `\n  \\label{eq:${options.label}}` : "";

  return `\\begin{equation}${label}
  ${math}
\\end{equation}`;
}

/**
 * Generates a valid LaTeX section snippet (EDT-09).
 */
export function generateSectionSnippet(options: SectionSnippetOptions): string {
  const level = options.level ?? "section";
  const label = options.label ? `\n\\label{${level.slice(0, 3)}:${options.label}}` : "";
  return `\\${level}{${options.title}}${label}`;
}

/**
 * Generates a valid LaTeX list environment snippet (itemize or enumerate) (EDT-09).
 */
export function generateListSnippet(options: ListSnippetOptions = {}): string {
  const type = options.type ?? "itemize";
  const items =
    options.items && options.items.length > 0 ? options.items : ["First item", "Second item"];
  const itemLines = items.map((it) => `  \\item ${it}`).join("\n");

  return `\\begin{${type}}
${itemLines}
\\end{${type}}`;
}

/**
 * Generates a valid LaTeX link snippet using hyperref (EDT-09).
 */
export function generateLinkSnippet(options: LinkSnippetOptions): string {
  if (options.text) {
    return `\\href{${options.url}}{${options.text}}`;
  }
  return `\\url{${options.url}}`;
}

/**
 * Generates reference and citation snippets (EDT-09).
 */
export function generateRefSnippet(label: string): string {
  if (!label || /[\s}]/.test(label)) {
    throw new Error(`Invalid label: "${label}"`);
  }
  return `\\ref{${label}}`;
}

export function generateCiteSnippet(key: string): string {
  if (!key || /[\s}]/.test(key)) {
    throw new Error(`Invalid citation key: "${key}"`);
  }
  return `\\cite{${key}}`;
}

export function generateLabelSnippet(label: string): string {
  if (!label || /[\s}]/.test(label)) {
    throw new Error(`Invalid label: "${label}"`);
  }
  return `\\label{${label}}`;
}

/**
 * Replaces the selected range [from, to] with the snippet and returns new text and cursor position.
 * Strictly guarantees that only the selected region changes.
 */
export function insertSnippet(
  source: string,
  from: number,
  to: number,
  snippet: string,
): { newText: string; newCursor: number } {
  if (from < 0 || to < from || to > source.length) {
    throw new Error(
      `Invalid selection range: [${from}, ${to}] for text of length ${source.length}`,
    );
  }

  const before = source.slice(0, from);
  const after = source.slice(to);
  const newText = `${before}${snippet}${after}`;
  const newCursor = from + snippet.length;

  return { newText, newCursor };
}
