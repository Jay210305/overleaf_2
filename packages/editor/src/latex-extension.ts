import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { EditorState, type Extension, RangeSetBuilder } from "@codemirror/state";
import { foldGutter, foldService, indentUnit, bracketMatching } from "@codemirror/language";
import { history } from "@codemirror/commands";

export type EditorMode = "latex" | "bibtex" | "style" | "plain";
export type EditorTheme = "light" | "dark" | "system";

/**
 * Determine editor mode based on file name extension.
 */
export function getModeForFilename(filename: string): EditorMode {
  const lower = filename.toLowerCase().trim();
  if (lower.endsWith(".tex")) return "latex";
  if (lower.endsWith(".bib")) return "bibtex";
  if (
    lower.endsWith(".sty") ||
    lower.endsWith(".cls") ||
    lower.endsWith(".dtx") ||
    lower.endsWith(".ins")
  ) {
    return "style";
  }
  return "plain";
}

// Token decoration types
const commentDeco = Decoration.mark({
  class: "cm-latex-comment",
  attributes: { style: "color: #6b7280; font-style: italic;" },
});
const commandDeco = Decoration.mark({
  class: "cm-latex-command",
  attributes: { style: "color: #2563eb; font-weight: 600;" },
});
const envDeco = Decoration.mark({
  class: "cm-latex-environment",
  attributes: { style: "color: #7c3aed; font-weight: 600;" },
});
const mathDeco = Decoration.mark({
  class: "cm-latex-math",
  attributes: { style: "color: #059669; font-weight: 500;" },
});
const bibEntryDeco = Decoration.mark({
  class: "cm-bibtex-entry",
  attributes: { style: "color: #b45309; font-weight: 700;" },
});
const bibFieldDeco = Decoration.mark({
  class: "cm-bibtex-field",
  attributes: { style: "color: #0284c7; font-weight: 500;" },
});

/**
 * Parse lines and build token decorations according to the active mode.
 */
function buildDecorations(view: EditorView, mode: EditorMode): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  if (mode === "plain") {
    return builder.finish();
  }

  const doc = view.state.doc;
  const lineCount = doc.lines;

  for (let i = 1; i <= lineCount; i++) {
    const line = doc.line(i);
    const text = line.text;
    const lineStart = line.from;

    if (mode === "latex" || mode === "style") {
      // Find comment start (%) not escaped by backslash
      let commentIdx = -1;
      for (let j = 0; j < text.length; j++) {
        if (text[j] === "%" && (j === 0 || text[j - 1] !== "\\")) {
          commentIdx = j;
          break;
        }
      }

      const activeText = commentIdx >= 0 ? text.slice(0, commentIdx) : text;

      // Environment matches: \begin{name} or \end{name}
      const envRegex = /\\(begin|end)\{([^}]+)\}/g;
      let m: RegExpExecArray | null;
      while ((m = envRegex.exec(activeText)) !== null) {
        builder.add(lineStart + m.index, lineStart + m.index + m[0].length, envDeco);
      }

      // Math matches: $...$ or $$...$$
      const mathRegex = /\$\$[^$]+\$\$|\$[^$\n]+\$/g;
      while ((m = mathRegex.exec(activeText)) !== null) {
        builder.add(lineStart + m.index, lineStart + m.index + m[0].length, mathDeco);
      }

      // LaTeX commands: \commandname
      const cmdRegex = /\\[a-zA-Z@]+(?:\*?)/g;
      while ((m = cmdRegex.exec(activeText)) !== null) {
        // Skip if inside begin/end already added
        if (m[0] !== "\\begin" && m[0] !== "\\end") {
          builder.add(lineStart + m.index, lineStart + m.index + m[0].length, commandDeco);
        }
      }

      // Comment
      if (commentIdx >= 0) {
        builder.add(lineStart + commentIdx, lineStart + text.length, commentDeco);
      }
    } else if (mode === "bibtex") {
      // BibTeX comments or @entry
      const trimmed = text.trim();
      if (trimmed.startsWith("%")) {
        builder.add(lineStart, lineStart + text.length, commentDeco);
      } else {
        const entryRegex = /@[a-zA-Z]+(?:\s*\{)?/g;
        let m: RegExpExecArray | null;
        while ((m = entryRegex.exec(text)) !== null) {
          builder.add(lineStart + m.index, lineStart + m.index + m[0].length, bibEntryDeco);
        }

        const fieldRegex = /^\s*([a-zA-Z_-]+)\s*=/g;
        while ((m = fieldRegex.exec(text)) !== null) {
          const fieldName = m[1] ?? "";
          const startIdx = text.indexOf(fieldName, m.index);
          if (startIdx >= 0) {
            builder.add(
              lineStart + startIdx,
              lineStart + startIdx + fieldName.length,
              bibFieldDeco,
            );
          }
        }
      }
    }
  }

  return builder.finish();
}

/**
 * LaTeX and BibTeX syntax highlighting ViewPlugin.
 */
export function createSyntaxHighlightPlugin(mode: EditorMode): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, mode);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, mode);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

/**
 * Code folding service for LaTeX environments (\begin{env} ... \end{env}).
 */
export const latexFoldService = foldService.of((state, lineStart, _lineEnd) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text;
  const match = /\\begin\{([^}]+)\}/.exec(text);
  if (!match) return null;

  const envName = match[1];
  const endPattern = `\\end{${envName}}`;
  const totalLines = state.doc.lines;

  for (let l = line.number + 1; l <= totalLines; l++) {
    const curLine = state.doc.line(l);
    if (curLine.text.includes(endPattern)) {
      return {
        from: line.to,
        to: curLine.to,
      };
    }
  }
  return null;
});

/**
 * Light Theme for CodeMirror.
 */
export const lightTheme = EditorView.theme(
  {
    "&": {
      color: "#1f2937",
      backgroundColor: "#ffffff",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "14px",
    },
    ".cm-content": {
      caretColor: "#2563eb",
      lineHeight: "1.6",
    },
    ".cm-cursor": {
      borderLeftColor: "#2563eb",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#bfdbfe",
    },
    ".cm-gutters": {
      backgroundColor: "#f9fafb",
      color: "#9ca3af",
      borderRight: "1px solid #e5e7eb",
    },
    ".cm-activeLine": {
      backgroundColor: "#f8fafc",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#e2e8f0",
      color: "#1e293b",
    },
  },
  { dark: false },
);

/**
 * Dark Theme for CodeMirror.
 */
export const darkTheme = EditorView.theme(
  {
    "&": {
      color: "#f3f4f6",
      backgroundColor: "#111827",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: "14px",
    },
    ".cm-content": {
      caretColor: "#60a5fa",
      lineHeight: "1.6",
    },
    ".cm-cursor": {
      borderLeftColor: "#60a5fa",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#1e3a8a",
    },
    ".cm-gutters": {
      backgroundColor: "#0f172a",
      color: "#64748b",
      borderRight: "1px solid #1e293b",
    },
    ".cm-activeLine": {
      backgroundColor: "#1e293b",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#334155",
      color: "#f8fafc",
    },
  },
  { dark: true },
);

export interface EditorExtensionOptions {
  mode?: EditorMode;
  theme?: EditorTheme;
  readOnly?: boolean;
  tabWidth?: number;
  lineNumbersEnabled?: boolean;
  foldingEnabled?: boolean;
  historyEnabled?: boolean;
}

/**
 * Creates the complete extension list for CodeMirror LaTeX / BibTeX / Style / Plain text editor.
 */
export function createLatexEditorExtensions(options: EditorExtensionOptions = {}): Extension[] {
  const mode = options.mode ?? "latex";
  const theme = options.theme ?? "light";
  const extensions: Extension[] = [];

  // Line numbers
  if (options.lineNumbersEnabled !== false) {
    extensions.push(lineNumbers());
  }

  // Active line
  extensions.push(highlightActiveLine());
  extensions.push(highlightActiveLineGutter());

  // Indentation
  extensions.push(indentUnit.of("  "));

  // Bracket matching
  extensions.push(bracketMatching());

  // Folding
  if (options.foldingEnabled !== false) {
    extensions.push(foldGutter());
    extensions.push(latexFoldService);
  }

  // Syntax highlighting
  extensions.push(createSyntaxHighlightPlugin(mode));

  // History / Undo / Redo
  if (options.historyEnabled !== false) {
    extensions.push(history());
  }

  // Theme
  if (theme === "dark") {
    extensions.push(darkTheme);
  } else {
    extensions.push(lightTheme);
  }

  // Read-only configuration
  if (options.readOnly) {
    extensions.push(EditorState.readOnly.of(true));
    extensions.push(EditorView.editable.of(false));
  }

  return extensions;
}
