export interface FoldRange {
  from: number;
  to: number;
  env: string;
}

export type CompletionKind =
  | "command"
  | "environment"
  | "label"
  | "citation"
  | "file"
  | "image"
  | "none";

export interface CompletionContext {
  kind: CompletionKind;
  query: string;
  from: number;
  to: number;
}

export interface CompletionItem {
  label: string;
  kind: CompletionKind;
  detail?: string;
  insertText: string;
}

export interface CompletionResult {
  from: number;
  to: number;
  items: CompletionItem[];
}

export const STANDARD_ENVIRONMENTS: readonly string[] = [
  "document",
  "figure",
  "table",
  "tabular",
  "equation",
  "align",
  "gather",
  "itemize",
  "enumerate",
  "description",
  "quote",
  "verbatim",
  "center",
  "minipage",
  "proof",
  "theorem",
  "lemma",
];

export const STANDARD_COMMANDS: readonly string[] = [
  "\\documentclass",
  "\\usepackage",
  "\\begin",
  "\\end",
  "\\section",
  "\\subsection",
  "\\subsubsection",
  "\\paragraph",
  "\\textbf",
  "\\textit",
  "\\emph",
  "\\underline",
  "\\centering",
  "\\caption",
  "\\label",
  "\\ref",
  "\\eqref",
  "\\cite",
  "\\includegraphics",
  "\\input",
  "\\include",
  "\\item",
  "\\newline",
  "\\newpage",
  "\\maketitle",
  "\\tableofcontents",
  "\\bibliographystyle",
  "\\bibliography",
];

/**
 * Automatically creates paired \begin{env} ... \end{env} with proper indentation (EDT-05).
 */
export function autoCloseEnvironment(
  envName: string,
  indent = "  ",
): string {
  if (!envName || /[\s}]/.test(envName)) {
    throw new Error(`Invalid environment name: "${envName}"`);
  }
  return `\\begin{${envName}}\n${indent}\n\\end{${envName}}`;
}

/**
 * Extracts all \label{...} targets defined in the LaTeX document.
 */
export function extractLabels(text: string): string[] {
  const labels: string[] = [];
  const labelRegex = /\\label\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = labelRegex.exec(text)) !== null) {
    const lbl = match[1]?.trim();
    if (lbl && !labels.includes(lbl)) {
      labels.push(lbl);
    }
  }

  return labels;
}

/**
 * Identifies environment folding ranges without corrupting or mutating the document (EDT-05).
 */
export function getEnvironmentFoldRanges(text: string): FoldRange[] {
  const ranges: FoldRange[] = [];
  const stack: Array<{ env: string; from: number }> = [];

  const regex = /\\(begin|end)\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const action = match[1]!;
    const env = match[2]!.trim();
    const pos = match.index;

    if (action === "begin") {
      stack.push({ env, from: pos });
    } else if (action === "end") {
      // Find matching start
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s]!.env === env) {
          const start = stack.splice(s, 1)[0]!;
          ranges.push({
            from: start.from,
            to: pos + match[0].length,
            env,
          });
          break;
        }
      }
    }
  }

  return ranges;
}

/**
 * Analyzes the text preceding the cursor to detect the completion context (EDT-06).
 */
export function getCompletionContext(
  text: string,
  cursorOffset: number,
): CompletionContext {
  if (cursorOffset < 0 || cursorOffset > text.length) {
    return { kind: "none", query: "", from: cursorOffset, to: cursorOffset };
  }

  const preceding = text.slice(0, cursorOffset);

  // 1. Environment in \begin{... or \end{...
  const envMatch = preceding.match(/\\(begin|end)\{([^}]*)$/);
  if (envMatch) {
    const query = envMatch[2]!;
    return {
      kind: "environment",
      query,
      from: cursorOffset - query.length,
      to: cursorOffset,
    };
  }

  // 2. Cross-reference in \ref{... or \eqref{...
  const refMatch = preceding.match(/\\(ref|eqref|pageref|autoref)\{([^}]*)$/);
  if (refMatch) {
    const query = refMatch[2]!;
    return {
      kind: "label",
      query,
      from: cursorOffset - query.length,
      to: cursorOffset,
    };
  }

  // 3. Citation in \cite{...
  const citeMatch = preceding.match(/\\(cite|citep|citet|autocite|parencite|textcite)\*?\{([^}]*)$/);
  if (citeMatch) {
    const keysSoFar = citeMatch[2]!;
    const lastCommaIndex = keysSoFar.lastIndexOf(",");
    const currentToken =
      lastCommaIndex >= 0 ? keysSoFar.slice(lastCommaIndex + 1).trimStart() : keysSoFar;
    return {
      kind: "citation",
      query: currentToken,
      from: cursorOffset - currentToken.length,
      to: cursorOffset,
    };
  }

  // 4. File path in \input{... or \include{...
  const fileMatch = preceding.match(/\\(input|include|subfile)\{([^}]*)$/);
  if (fileMatch) {
    const query = fileMatch[2]!;
    return {
      kind: "file",
      query,
      from: cursorOffset - query.length,
      to: cursorOffset,
    };
  }

  // 5. Image path in \includegraphics[...]{... or \includegraphics{...
  const imgMatch = preceding.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)$/);
  if (imgMatch) {
    const query = imgMatch[1]!;
    return {
      kind: "image",
      query,
      from: cursorOffset - query.length,
      to: cursorOffset,
    };
  }

  // 6. Command starting with \
  const cmdMatch = preceding.match(/\\([a-zA-Z]+)$/);
  if (cmdMatch) {
    const query = cmdMatch[0]!;
    return {
      kind: "command",
      query,
      from: cursorOffset - (query.length - 1), // cursor after backslash
      to: cursorOffset,
    };
  }

  return { kind: "none", query: "", from: cursorOffset, to: cursorOffset };
}

export interface CompleteOptions {
  availableFiles?: string[];
  availableLabels?: string[];
  availableCitations?: string[];
}

/**
 * Returns completion suggestions based on cursor context (EDT-06).
 */
export function completeAtCursor(
  text: string,
  cursorOffset: number,
  options: CompleteOptions = {},
): CompletionResult {
  const context = getCompletionContext(text, cursorOffset);
  const q = context.query.toLowerCase();

  switch (context.kind) {
    case "environment": {
      const items: CompletionItem[] = STANDARD_ENVIRONMENTS
        .filter((env) => env.toLowerCase().includes(q))
        .map((env) => ({
          label: env,
          kind: "environment",
          detail: `Environment: ${env}`,
          insertText: env,
        }));
      return { from: context.from, to: context.to, items };
    }

    case "label": {
      const docLabels = extractLabels(text);
      const allLabels = Array.from(new Set([...docLabels, ...(options.availableLabels ?? [])]));
      const items: CompletionItem[] = allLabels
        .filter((lbl) => lbl.toLowerCase().includes(q))
        .map((lbl) => ({
          label: lbl,
          kind: "label",
          detail: "Cross-reference target",
          insertText: lbl,
        }));
      return { from: context.from, to: context.to, items };
    }

    case "citation": {
      const allCites = options.availableCitations ?? [];
      const items: CompletionItem[] = allCites
        .filter((c) => c.toLowerCase().includes(q))
        .map((c) => ({
          label: c,
          kind: "citation",
          detail: "Bibliography citation key",
          insertText: c,
        }));
      return { from: context.from, to: context.to, items };
    }

    case "file": {
      const files = (options.availableFiles ?? []).filter((f) =>
        f.endsWith(".tex") || f.endsWith(".sty") || f.endsWith(".cls") || f.endsWith(".bib"),
      );
      const items: CompletionItem[] = files
        .filter((f) => f.toLowerCase().includes(q))
        .map((f) => ({
          label: f,
          kind: "file",
          detail: "Project source file",
          insertText: f,
        }));
      return { from: context.from, to: context.to, items };
    }

    case "image": {
      const imageFiles = (options.availableFiles ?? []).filter((f) =>
        /\.(png|jpe?g|pdf|eps|svg)$/i.test(f),
      );
      const items: CompletionItem[] = imageFiles
        .filter((f) => f.toLowerCase().includes(q))
        .map((f) => ({
          label: f,
          kind: "image",
          detail: "Image asset",
          insertText: f,
        }));
      return { from: context.from, to: context.to, items };
    }

    case "command": {
      const items: CompletionItem[] = STANDARD_COMMANDS
        .filter((cmd) => cmd.toLowerCase().includes(q))
        .map((cmd) => ({
          label: cmd,
          kind: "command",
          detail: "LaTeX macro",
          insertText: cmd.replace(/^\\/, ""), // text after backslash
        }));
      return { from: context.from, to: context.to, items };
    }

    default:
      return { from: cursorOffset, to: cursorOffset, items: [] };
  }
}
