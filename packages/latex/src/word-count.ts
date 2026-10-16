export interface WordCountResult {
  words: number;
  characters: number;
  charactersExcludingSpaces: number;
  lines: number;
  approximate: true;
  parserNotes: string[];
}

/**
 * Calculates approximate word and character counts for LaTeX source text (PRO-15).
 * Documented limitations:
 * 1. Preamble before \begin{document} is excluded if \begin{document} is present.
 * 2. LaTeX comments (%...) are excluded unless escaped (\%).
 * 3. Math environments (inline $...$ and display \[...\], \begin{equation}, etc.) are excluded.
 * 4. Structural commands and keys (\cite{...}, \ref{...}, \label{...}, \includegraphics{...}) are excluded.
 * 5. Formatting commands (\textbf{...}, \textit{...}, etc.) keep their enclosed arguments.
 */
export function countLatexWords(source: string): WordCountResult {
  if (!source || !source.trim()) {
    return {
      words: 0,
      characters: 0,
      charactersExcludingSpaces: 0,
      lines: source ? source.split(/\r?\n/).length : 0,
      approximate: true,
      parserNotes: ["Empty source"],
    };
  }

  const parserNotes: string[] = [
    "Comments and preamble excluded",
    "Math expressions and citation/reference keys excluded",
    "Styling commands preserved",
  ];

  let text = source;

  // 1. Remove comments (handle escaped \%)
  text = text.replace(/(^|[^\\])%.*$/gm, "$1");

  // 2. Strip preamble if \begin{document} exists
  const docStart = text.indexOf("\\begin{document}");
  if (docStart !== -1) {
    text = text.slice(docStart + "\\begin{document}".length);
  }

  // 3. Strip postamble if \end{document} exists
  const docEnd = text.indexOf("\\end{document}");
  if (docEnd !== -1) {
    text = text.slice(0, docEnd);
  }

  // 4. Strip display math environments
  text = text.replace(/\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|displaymath)\}[\s\S]*?\\end\{\1\}/g, " ");
  text = text.replace(/\\\[[\s\S]*?\\\]/g, " ");
  text = text.replace(/\$\$[\s\S]*?\$\$/g, " ");

  // 5. Strip inline math
  text = text.replace(/(^|[^\\])\$([^\$]+)\$/g, "$1 ");

  // 6. Strip commands whose arguments should not be counted as words
  // e.g. \cite{...}, \ref{...}, \label{...}, \includegraphics[...]{...}, \bibliographystyle{...}, \bibliography{...}
  text = text.replace(/\\(cite|citep|citet|autocite|ref|eqref|pageref|autoref|label|bibliographystyle|bibliography|input|include|usepackage|documentclass)\*?(?:\[[^\]]*\])?\{[^}]*\}/g, " ");
  text = text.replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, " ");

  // 7. Unwrap text formatting commands: \textbf{word} -> word, \section{title} -> title
  text = text.replace(/\\(textbf|textit|emph|underline|section|subsection|subsubsection|paragraph|caption)\*?\{([^}]*)\}/g, " $2 ");

  // 8. Strip standalone commands: \item, \newline, \newpage, \maketitle, \\, etc.
  text = text.replace(/\\[a-zA-Z]+\*?/g, " ");
  text = text.replace(/\\\\/g, " ");

  // 9. Clean up braces, brackets
  text = text.replace(/[{}\[\]]/g, " ");

  // 10. Count words
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z0-9\u00C0-\u024F]/.test(w));

  const cleanProse = words.join(" ");
  const rawLines = source.split(/\r?\n/).length;
  const chars = cleanProse.length;
  const charsNoSpaces = cleanProse.replace(/\s/g, "").length;

  return {
    words: words.length,
    characters: chars,
    charactersExcludingSpaces: charsNoSpaces,
    lines: rawLines,
    approximate: true,
    parserNotes,
  };
}
