import { createHash } from "node:crypto";

export function computeTextHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface VisualSourceRange {
  start: number;
  end: number;
}

export type VisualSpan =
  | { kind: "text"; text: string; range: VisualSourceRange; raw: string }
  | { kind: "bold"; content: string; range: VisualSourceRange; innerRange: VisualSourceRange; raw: string }
  | { kind: "italic"; content: string; macro: "textit" | "emph"; range: VisualSourceRange; innerRange: VisualSourceRange; raw: string }
  | { kind: "mathInline"; formula: string; range: VisualSourceRange; innerRange: VisualSourceRange; raw: string }
  | { kind: "citation"; keys: string[]; range: VisualSourceRange; innerRange: VisualSourceRange; raw: string }
  | { kind: "reference"; key: string; command: "ref" | "eqref"; range: VisualSourceRange; innerRange: VisualSourceRange; raw: string }
  | { kind: "rawInline"; raw: string; range: VisualSourceRange };

export interface VisualListItem {
  index: number;
  marker: string;
  markerRange: VisualSourceRange;
  content: string;
  contentRange: VisualSourceRange;
  range: VisualSourceRange;
  raw: string;
  hash: string;
}

export interface VisualTableCell {
  rowIndex: number;
  colIndex: number;
  content: string;
  range: VisualSourceRange;
  hash: string;
}

export interface VisualTableRow {
  rowIndex: number;
  cells: VisualTableCell[];
  range: VisualSourceRange;
  raw: string;
}

export type VisualHeadingLevel = "section" | "subsection" | "subsubsection";

export interface HeadingNode {
  id: string;
  kind: "heading";
  level: VisualHeadingLevel;
  title: string;
  titleRange: VisualSourceRange;
  command: string;
  range: VisualSourceRange;
  raw: string;
  hash: string;
}

export interface ParagraphNode {
  id: string;
  kind: "paragraph";
  spans: VisualSpan[];
  text: string;
  range: VisualSourceRange;
  raw: string;
  hash: string;
}

export interface ListNode {
  id: string;
  kind: "list";
  listKind: "itemize" | "enumerate";
  items: VisualListItem[];
  range: VisualSourceRange;
  raw: string;
  hash: string;
}

export interface MathDisplayNode {
  id: string;
  kind: "mathDisplay";
  displayKind: "brackets" | "dollar" | "equation";
  formula: string;
  formulaRange: VisualSourceRange;
  range: VisualSourceRange;
  raw: string;
  hash: string;
}

export interface FigureNode {
  id: string;
  kind: "figure";
  imagePath: string;
  imagePathRange: VisualSourceRange;
  caption: string | null;
  captionRange: VisualSourceRange | null;
  label: string | null;
  labelRange: VisualSourceRange | null;
  range: VisualSourceRange;
  raw: string;
  hash: string;
}

export interface TableNode {
  id: string;
  kind: "table";
  environment: "tabular" | "table";
  alignment: string;
  alignmentRange: VisualSourceRange;
  rows: VisualTableRow[];
  range: VisualSourceRange;
  raw: string;
  hash: string;
}

export type FallbackReason =
  | "preamble"
  | "unknownMacro"
  | "complexEnvironment"
  | "verbatim"
  | "tikz"
  | "parseError";

export interface LiteralFallbackNode {
  id: string;
  kind: "literalFallback";
  reason: FallbackReason;
  description: string;
  range: VisualSourceRange;
  raw: string;
  hash: string;
}

export type VisualBlockNode =
  | HeadingNode
  | ParagraphNode
  | ListNode
  | MathDisplayNode
  | FigureNode
  | TableNode
  | LiteralFallbackNode;

export interface VisualAstError {
  message: string;
  offset: number;
}

export interface VisualAstDocument {
  rawSource: string;
  nodes: VisualBlockNode[];
  hasErrors: boolean;
  errors: VisualAstError[];
}

export class VisualAstParseError extends Error {
  constructor(message: string, public readonly offset: number) {
    super(message);
    this.name = "VisualAstParseError";
  }
}

/**
 * Parses inline formatting within a text segment.
 */
export function parseInlineSpans(text: string, baseOffset: number): VisualSpan[] {
  const spans: VisualSpan[] = [];
  let idx = 0;
  const len = text.length;

  while (idx < len) {
    // 1. Math: $ ... $
    if (text[idx] === "$" && (idx === 0 || text[idx - 1] !== "\\")) {
      const closingIdx = text.indexOf("$", idx + 1);
      if (closingIdx !== -1 && text[closingIdx - 1] !== "\\") {
        const raw = text.slice(idx, closingIdx + 1);
        const formula = text.slice(idx + 1, closingIdx);
        spans.push({
          kind: "mathInline",
          raw,
          formula,
          range: { start: baseOffset + idx, end: baseOffset + closingIdx + 1 },
          innerRange: { start: baseOffset + idx + 1, end: baseOffset + closingIdx },
        });
        idx = closingIdx + 1;
        continue;
      }
    }

    // 2. Math: \( ... \)
    if (text.startsWith("\\(", idx)) {
      const closingIdx = text.indexOf("\\)", idx + 2);
      if (closingIdx !== -1) {
        const raw = text.slice(idx, closingIdx + 2);
        const formula = text.slice(idx + 2, closingIdx);
        spans.push({
          kind: "mathInline",
          raw,
          formula,
          range: { start: baseOffset + idx, end: baseOffset + closingIdx + 2 },
          innerRange: { start: baseOffset + idx + 2, end: baseOffset + closingIdx },
        });
        idx = closingIdx + 2;
        continue;
      }
    }

    // 3. Bold: \textbf{...}
    if (text.startsWith("\\textbf{", idx)) {
      const openBrace = idx + 7;
      const closeBrace = findMatchingBrace(text, openBrace);
      if (closeBrace !== -1) {
        const raw = text.slice(idx, closeBrace + 1);
        const content = text.slice(openBrace + 1, closeBrace);
        spans.push({
          kind: "bold",
          content,
          raw,
          range: { start: baseOffset + idx, end: baseOffset + closeBrace + 1 },
          innerRange: { start: baseOffset + openBrace + 1, end: baseOffset + closeBrace },
        });
        idx = closeBrace + 1;
        continue;
      }
    }

    // 4. Italic: \textit{...} or \emph{...}
    const isTextIt = text.startsWith("\\textit{", idx);
    const isEmph = text.startsWith("\\emph{", idx);
    if (isTextIt || isEmph) {
      const prefixLen = isTextIt ? 7 : 5;
      const openBrace = idx + prefixLen;
      const closeBrace = findMatchingBrace(text, openBrace);
      if (closeBrace !== -1) {
        const raw = text.slice(idx, closeBrace + 1);
        const content = text.slice(openBrace + 1, closeBrace);
        spans.push({
          kind: "italic",
          content,
          macro: isTextIt ? "textit" : "emph",
          raw,
          range: { start: baseOffset + idx, end: baseOffset + closeBrace + 1 },
          innerRange: { start: baseOffset + openBrace + 1, end: baseOffset + closeBrace },
        });
        idx = closeBrace + 1;
        continue;
      }
    }

    // 5. Citation: \cite{...}, \citep{...}, \citet{...}
    const citeMatch = /^\\(?:cite|citep|citet)\{([^}]+)\}/.exec(text.slice(idx));
    if (citeMatch && citeMatch[1]) {
      const fullLen = citeMatch[0].length;
      const keys = citeMatch[1].split(",").map((k) => k.trim());
      const openBrace = text.indexOf("{", idx);
      const closeBrace = idx + fullLen - 1;
      spans.push({
        kind: "citation",
        keys,
        raw: citeMatch[0],
        range: { start: baseOffset + idx, end: baseOffset + idx + fullLen },
        innerRange: { start: baseOffset + openBrace + 1, end: baseOffset + closeBrace },
      });
      idx += fullLen;
      continue;
    }

    // 6. Reference: \ref{...}, \eqref{...}
    const refMatch = /^\\(ref|eqref)\{([^}]+)\}/.exec(text.slice(idx));
    if (refMatch && refMatch[1] && refMatch[2]) {
      const fullLen = refMatch[0].length;
      const cmd = refMatch[1] as "ref" | "eqref";
      const key = refMatch[2].trim();
      const openBrace = text.indexOf("{", idx);
      const closeBrace = idx + fullLen - 1;
      spans.push({
        kind: "reference",
        key,
        command: cmd,
        raw: refMatch[0],
        range: { start: baseOffset + idx, end: baseOffset + idx + fullLen },
        innerRange: { start: baseOffset + openBrace + 1, end: baseOffset + closeBrace },
      });
      idx += fullLen;
      continue;
    }

    // Regular character accumulation
    const nextSpecial = findNextSpecial(text, idx);
    const plainChunk = text.slice(idx, nextSpecial);
    spans.push({
      kind: "text",
      text: plainChunk,
      raw: plainChunk,
      range: { start: baseOffset + idx, end: baseOffset + nextSpecial },
    });
    idx = nextSpecial;
  }

  return spans;
}

function findMatchingBrace(text: string, openIndex: number): number {
  if (text[openIndex] !== "{") return -1;
  let depth = 1;
  for (let i = openIndex + 1; i < text.length; i++) {
    if (text[i] === "{" && text[i - 1] !== "\\") {
      depth++;
    } else if (text[i] === "}" && text[i - 1] !== "\\") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findNextSpecial(text: string, fromIndex: number): number {
  const specials = ["$", "\\(", "\\textbf{", "\\textit{", "\\emph{", "\\cite", "\\ref{", "\\eqref{"];
  let minIdx = text.length;

  for (const s of specials) {
    const idx = text.indexOf(s, fromIndex);
    if (idx !== -1 && idx < minIdx) {
      minIdx = idx;
    }
  }

  return minIdx === fromIndex ? fromIndex + 1 : minIdx;
}

function consumeTrailingWhitespace(source: string, offset: number): number {
  let cur = offset;
  while (cur < source.length && (source[cur] === " " || source[cur] === "\t")) {
    cur++;
  }
  if (cur < source.length && source[cur] === "\r") cur++;
  if (cur < source.length && source[cur] === "\n") cur++;
  while (cur < source.length && (source[cur] === " " || source[cur] === "\t")) {
    cur++;
  }
  if (cur < source.length && source[cur] === "\r") cur++;
  if (cur < source.length && source[cur] === "\n") cur++;
  return cur;
}

/**
 * Main parser: transforms arbitrary LaTeX source into a conservative VisualAstDocument.
 * Non-destructive: every character in source is accounted for across contiguous nodes.
 */
export function parseVisualAst(source: string): VisualAstDocument {
  const nodes: VisualBlockNode[] = [];
  const errors: VisualAstError[] = [];
  let nodeIdCounter = 0;

  function nextId(): string {
    return `node-${++nodeIdCounter}`;
  }

  let offset = 0;
  const len = source.length;

  // 1. Check for preamble (\documentclass up to \begin{document})
  const beginDocMatch = /\\begin\{document\}/.exec(source);
  if (beginDocMatch && beginDocMatch.index > 0) {
    const preambleEnd = beginDocMatch.index;
    const preambleRaw = source.slice(0, preambleEnd);
    nodes.push({
      id: nextId(),
      kind: "literalFallback",
      reason: "preamble",
      description: "LaTeX Preamble (document class, packages, and definitions)",
      range: { start: 0, end: preambleEnd },
      raw: preambleRaw,
      hash: computeTextHash(preambleRaw),
    });
    offset = preambleEnd;
  }

  while (offset < len) {
    const remaining = source.slice(offset);

    // End of document tag
    if (remaining.startsWith("\\end{document}")) {
      const raw = remaining;
      nodes.push({
        id: nextId(),
        kind: "literalFallback",
        reason: "preamble",
        description: "LaTeX Document Epilogue",
        range: { start: offset, end: len },
        raw,
        hash: computeTextHash(raw),
      });
      offset = len;
      break;
    }

    // Begin document tag itself (if sitting at offset)
    if (remaining.startsWith("\\begin{document}")) {
      const match = /^\\begin\{document\}(?:\r?\n)*/.exec(remaining)!;
      const raw = match[0];
      nodes.push({
        id: nextId(),
        kind: "literalFallback",
        reason: "preamble",
        description: "Document Begin Marker",
        range: { start: offset, end: offset + raw.length },
        raw,
        hash: computeTextHash(raw),
      });
      offset += raw.length;
      continue;
    }

    // Verbatim environment
    if (remaining.startsWith("\\begin{verbatim}")) {
      const closeIdx = remaining.indexOf("\\end{verbatim}");
      const endOffset = closeIdx !== -1 ? offset + closeIdx + "\\end{verbatim}".length : len;
      const finalEnd = consumeTrailingWhitespace(source, endOffset);
      const raw = source.slice(offset, finalEnd);
      nodes.push({
        id: nextId(),
        kind: "literalFallback",
        reason: "verbatim",
        description: "Verbatim raw text environment",
        range: { start: offset, end: finalEnd },
        raw,
        hash: computeTextHash(raw),
      });
      offset = finalEnd;
      continue;
    }

    // TikZ environment
    if (remaining.startsWith("\\begin{tikzpicture}")) {
      const closeIdx = remaining.indexOf("\\end{tikzpicture}");
      const endOffset = closeIdx !== -1 ? offset + closeIdx + "\\end{tikzpicture}".length : len;
      const finalEnd = consumeTrailingWhitespace(source, endOffset);
      const raw = source.slice(offset, finalEnd);
      nodes.push({
        id: nextId(),
        kind: "literalFallback",
        reason: "tikz",
        description: "TikZ vector graphics environment",
        range: { start: offset, end: finalEnd },
        raw,
        hash: computeTextHash(raw),
      });
      offset = finalEnd;
      continue;
    }

    // Display Math: \[ ... \]
    if (remaining.startsWith("\\[")) {
      const closeIdx = remaining.indexOf("\\]");
      if (closeIdx !== -1) {
        const finalEnd = consumeTrailingWhitespace(source, offset + closeIdx + 2);
        const raw = source.slice(offset, finalEnd);
        const inner = remaining.slice(2, closeIdx);
        const formula = inner.trim();
        const innerRel = inner.indexOf(formula);
        const formulaStart = formula.length > 0 && innerRel !== -1 ? offset + 2 + innerRel : offset + 2;
        const formulaEnd = formulaStart + formula.length;
        nodes.push({
          id: nextId(),
          kind: "mathDisplay",
          displayKind: "brackets",
          formula,
          formulaRange: { start: formulaStart, end: formulaEnd },
          range: { start: offset, end: finalEnd },
          raw,
          hash: computeTextHash(raw),
        });
        offset = finalEnd;
        continue;
      }
    }

    // Display Math: $$ ... $$
    if (remaining.startsWith("$$")) {
      const closeIdx = remaining.indexOf("$$", 2);
      if (closeIdx !== -1) {
        const finalEnd = consumeTrailingWhitespace(source, offset + closeIdx + 2);
        const raw = source.slice(offset, finalEnd);
        const inner = remaining.slice(2, closeIdx);
        const formula = inner.trim();
        const innerRel = inner.indexOf(formula);
        const formulaStart = formula.length > 0 && innerRel !== -1 ? offset + 2 + innerRel : offset + 2;
        const formulaEnd = formulaStart + formula.length;
        nodes.push({
          id: nextId(),
          kind: "mathDisplay",
          displayKind: "dollar",
          formula,
          formulaRange: { start: formulaStart, end: formulaEnd },
          range: { start: offset, end: finalEnd },
          raw,
          hash: computeTextHash(raw),
        });
        offset = finalEnd;
        continue;
      }
    }

    // Display Math: \begin{equation} ... \end{equation}
    if (remaining.startsWith("\\begin{equation}") || remaining.startsWith("\\begin{equation*}")) {
      const isStar = remaining.startsWith("\\begin{equation*}");
      const openEnvLen = isStar ? 17 : 16;
      const closeTag = isStar ? "\\end{equation*}" : "\\end{equation}";
      const closeIdx = remaining.indexOf(closeTag);
      if (closeIdx !== -1) {
        const finalEnd = consumeTrailingWhitespace(source, offset + closeIdx + closeTag.length);
        const raw = source.slice(offset, finalEnd);
        const inner = remaining.slice(openEnvLen, closeIdx);
        const formula = inner.trim();
        const innerRel = inner.indexOf(formula);
        const formulaStart = formula.length > 0 && innerRel !== -1 ? offset + openEnvLen + innerRel : offset + openEnvLen;
        const formulaEnd = formulaStart + formula.length;
        nodes.push({
          id: nextId(),
          kind: "mathDisplay",
          displayKind: "equation",
          formula,
          formulaRange: { start: formulaStart, end: formulaEnd },
          range: { start: offset, end: finalEnd },
          raw,
          hash: computeTextHash(raw),
        });
        offset = finalEnd;
        continue;
      }
    }

    // Headings: \section, \subsection, \subsubsection
    const headingMatch = /^\\(section|subsection|subsubsection)\*?\{/.exec(remaining);
    if (headingMatch && headingMatch[1]) {
      const level = headingMatch[1] as VisualHeadingLevel;
      const openBraceIdx = remaining.indexOf("{");
      const closeBraceIdx = findMatchingBrace(remaining, openBraceIdx);
      if (closeBraceIdx !== -1) {
        const finalEnd = consumeTrailingWhitespace(source, offset + closeBraceIdx + 1);
        const raw = source.slice(offset, finalEnd);
        const title = remaining.slice(openBraceIdx + 1, closeBraceIdx);
        nodes.push({
          id: nextId(),
          kind: "heading",
          level,
          title,
          titleRange: { start: offset + openBraceIdx + 1, end: offset + closeBraceIdx },
          command: headingMatch[0],
          range: { start: offset, end: finalEnd },
          raw,
          hash: computeTextHash(raw),
        });
        offset = finalEnd;
        continue;
      }
    }

    // Lists: \begin{itemize} ... \end{itemize} or \begin{enumerate} ... \end{enumerate}
    if (remaining.startsWith("\\begin{itemize}") || remaining.startsWith("\\begin{enumerate}")) {
      const isEnumerate = remaining.startsWith("\\begin{enumerate}");
      const envName = isEnumerate ? "enumerate" : "itemize";
      const closeTag = `\\end{${envName}}`;
      const closeIdx = remaining.indexOf(closeTag);
      if (closeIdx !== -1) {
        const fullLen = closeIdx + closeTag.length;
        const finalEnd = consumeTrailingWhitespace(source, offset + fullLen);
        const raw = source.slice(offset, finalEnd);
        const items = parseListItems(source.slice(offset, offset + fullLen), offset, isEnumerate ? "enumerate" : "itemize");
        nodes.push({
          id: nextId(),
          kind: "list",
          listKind: isEnumerate ? "enumerate" : "itemize",
          items,
          range: { start: offset, end: finalEnd },
          raw,
          hash: computeTextHash(raw),
        });
        offset = finalEnd;
        continue;
      }
    }

    // Figures: \begin{figure} ... \end{figure}
    if (remaining.startsWith("\\begin{figure}") || remaining.startsWith("\\begin{figure*}")) {
      const isStar = remaining.startsWith("\\begin{figure*}");
      const closeTag = isStar ? "\\end{figure*}" : "\\end{figure}";
      const closeIdx = remaining.indexOf(closeTag);
      if (closeIdx !== -1) {
        const fullLen = closeIdx + closeTag.length;
        const finalEnd = consumeTrailingWhitespace(source, offset + fullLen);
        const raw = source.slice(offset, finalEnd);
        const parsedFig = parseFigureEnvironment(source.slice(offset, offset + fullLen), offset);
        nodes.push({
          id: nextId(),
          kind: "figure",
          imagePath: parsedFig.imagePath,
          imagePathRange: parsedFig.imagePathRange,
          caption: parsedFig.caption,
          captionRange: parsedFig.captionRange,
          label: parsedFig.label,
          labelRange: parsedFig.labelRange,
          range: { start: offset, end: finalEnd },
          raw,
          hash: computeTextHash(raw),
        });
        offset = finalEnd;
        continue;
      }
    }

    // Tables: \begin{table} ... \begin{tabular} ... or direct \begin{tabular}
    if (remaining.startsWith("\\begin{table}") || remaining.startsWith("\\begin{tabular}")) {
      const isTableEnv = remaining.startsWith("\\begin{table}");
      const closeTag = isTableEnv ? "\\end{table}" : "\\end{tabular}";
      const closeIdx = remaining.indexOf(closeTag);
      if (closeIdx !== -1) {
        const fullLen = closeIdx + closeTag.length;
        const finalEnd = consumeTrailingWhitespace(source, offset + fullLen);
        const raw = source.slice(offset, finalEnd);
        const parsedTable = parseTableEnvironment(source.slice(offset, offset + fullLen), offset);
        if (parsedTable) {
          nodes.push({
            id: nextId(),
            kind: "table",
            environment: isTableEnv ? "table" : "tabular",
            alignment: parsedTable.alignment,
            alignmentRange: parsedTable.alignmentRange,
            rows: parsedTable.rows,
            range: { start: offset, end: finalEnd },
            raw,
            hash: computeTextHash(raw),
          });
          offset = finalEnd;
          continue;
        }
      }
    }

    // Macro definitions or custom macro calls at block level -> literal fallback
    const macroCallMatch = /^\\([a-zA-Z@]+)(?:\[[^\]]*\])?(?:\{[^{}]*\})*/.exec(remaining);
    if (macroCallMatch && macroCallMatch[1]) {
      const cmd = macroCallMatch[1];
      const inlineCommands = new Set([
        "textbf", "textit", "emph", "cite", "citep", "citet",
        "ref", "eqref", "url", "href", "item",
      ]);

      if (!inlineCommands.has(cmd)) {
        const lineEnd = remaining.indexOf("\n");
        const blockLen = lineEnd !== -1 ? lineEnd + 1 : remaining.length;
        const finalEnd = consumeTrailingWhitespace(source, offset + blockLen);
        const raw = source.slice(offset, finalEnd);
        nodes.push({
          id: nextId(),
          kind: "literalFallback",
          reason: "unknownMacro",
          description: `Macro command \\${cmd}`,
          range: { start: offset, end: finalEnd },
          raw,
          hash: computeTextHash(raw),
        });
        offset = finalEnd;
        continue;
      }
    }

    // Other unsupported \begin{...} environment
    const unsuppEnvMatch = /^\\begin\{([^}]+)\}/.exec(remaining);
    if (unsuppEnvMatch && unsuppEnvMatch[1]) {
      const envName = unsuppEnvMatch[1];
      const closeTag = `\\end{${envName}}`;
      const closeIdx = remaining.indexOf(closeTag);
      const endOffset = closeIdx !== -1 ? offset + closeIdx + closeTag.length : offset + remaining.indexOf("\n");
      const safeEnd = endOffset > offset ? endOffset : len;
      const finalEnd = consumeTrailingWhitespace(source, safeEnd);
      const raw = source.slice(offset, finalEnd);
      nodes.push({
        id: nextId(),
        kind: "literalFallback",
        reason: "complexEnvironment",
        description: `Unsupported environment \\begin{${envName}}`,
        range: { start: offset, end: finalEnd },
        raw,
        hash: computeTextHash(raw),
      });
      offset = finalEnd;
      continue;
    }

    // Paragraph: find next block boundary
    const nextBlockBoundary = findNextBlockBoundary(source, offset);
    const paragraphRaw = source.slice(offset, nextBlockBoundary);
    if (paragraphRaw.length > 0) {
      const spans = parseInlineSpans(paragraphRaw, offset);
      nodes.push({
        id: nextId(),
        kind: "paragraph",
        spans,
        text: paragraphRaw,
        range: { start: offset, end: nextBlockBoundary },
        raw: paragraphRaw,
        hash: computeTextHash(paragraphRaw),
      });
      offset = nextBlockBoundary;
    } else {
      const singleChar = source.slice(offset, offset + 1);
      nodes.push({
        id: nextId(),
        kind: "literalFallback",
        reason: "parseError",
        description: `Unparsed character '${singleChar}'`,
        range: { start: offset, end: offset + 1 },
        raw: singleChar,
        hash: computeTextHash(singleChar),
      });
      errors.push({ message: `Unparsed token at offset ${offset}`, offset });
      offset += 1;
    }
  }

  return {
    rawSource: source,
    nodes,
    hasErrors: errors.length > 0,
    errors,
  };
}

function parseListItems(raw: string, baseOffset: number, _kind: "itemize" | "enumerate"): VisualListItem[] {
  const items: VisualListItem[] = [];
  const itemRegex = /\\item(?:\s*\[([^\]]*)\])?/g;
  let match: RegExpExecArray | null;
  const matches: Array<{ index: number; marker: string; length: number }> = [];

  while ((match = itemRegex.exec(raw)) !== null) {
    matches.push({
      index: match.index,
      marker: match[1] ?? "\\item",
      length: match[0].length,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    if (!cur) continue;
    const nextMatch = matches[i + 1];
    const nextIdx = nextMatch ? nextMatch.index : raw.lastIndexOf("\\end{");
    const itemRaw = raw.slice(cur.index, nextIdx);
    const content = raw.slice(cur.index + cur.length, nextIdx).trim();
    items.push({
      index: i,
      marker: cur.marker,
      markerRange: { start: baseOffset + cur.index, end: baseOffset + cur.index + cur.length },
      content,
      contentRange: { start: baseOffset + cur.index + cur.length, end: baseOffset + nextIdx },
      range: { start: baseOffset + cur.index, end: baseOffset + nextIdx },
      raw: itemRaw,
      hash: computeTextHash(itemRaw),
    });
  }

  return items;
}

function parseFigureEnvironment(raw: string, baseOffset: number): {
  imagePath: string;
  imagePathRange: VisualSourceRange;
  caption: string | null;
  captionRange: VisualSourceRange | null;
  label: string | null;
  labelRange: VisualSourceRange | null;
} {
  let imagePath = "";
  let imagePathRange: VisualSourceRange = { start: baseOffset, end: baseOffset };
  const imgMatch = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/.exec(raw);
  if (imgMatch && imgMatch[1]) {
    imagePath = imgMatch[1].trim();
    const openBrace = raw.indexOf("{", imgMatch.index);
    const closeBrace = raw.indexOf("}", openBrace);
    imagePathRange = { start: baseOffset + openBrace + 1, end: baseOffset + closeBrace };
  }

  let caption: string | null = null;
  let captionRange: VisualSourceRange | null = null;
  const capMatch = /\\caption\{/.exec(raw);
  if (capMatch) {
    const openBrace = capMatch.index + 8;
    const closeBrace = findMatchingBrace(raw, openBrace);
    if (closeBrace !== -1) {
      caption = raw.slice(openBrace + 1, closeBrace);
      captionRange = { start: baseOffset + openBrace + 1, end: baseOffset + closeBrace };
    }
  }

  let label: string | null = null;
  let labelRange: VisualSourceRange | null = null;
  const labMatch = /\\label\{([^}]+)\}/.exec(raw);
  if (labMatch && labMatch[1]) {
    label = labMatch[1].trim();
    const openBrace = raw.indexOf("{", labMatch.index);
    const closeBrace = raw.indexOf("}", openBrace);
    labelRange = { start: baseOffset + openBrace + 1, end: baseOffset + closeBrace };
  }

  return { imagePath, imagePathRange, caption, captionRange, label, labelRange };
}

function parseTableEnvironment(raw: string, baseOffset: number): {
  alignment: string;
  alignmentRange: VisualSourceRange;
  rows: VisualTableRow[];
} | null {
  const tabIdx = raw.indexOf("\\begin{tabular}");
  if (tabIdx === -1) return null;

  const afterTab = raw.slice(tabIdx + 15);
  const alignMatch = /^\s*\{([^}]+)\}/.exec(afterTab);
  if (!alignMatch || !alignMatch[1]) return null;

  const alignment = alignMatch[1].trim();
  const alignOpen = tabIdx + 15 + raw.slice(tabIdx + 15).indexOf("{");
  const alignClose = tabIdx + 15 + alignMatch[0].length - 1;
  const alignmentRange: VisualSourceRange = {
    start: baseOffset + alignOpen + 1,
    end: baseOffset + alignClose,
  };

  const bodyStart = tabIdx + 15 + alignMatch[0].length;
  const endTabIdx = raw.indexOf("\\end{tabular}", bodyStart);
  if (endTabIdx === -1) return null;

  const tableBody = raw.slice(bodyStart, endTabIdx);
  const rows: VisualTableRow[] = [];

  const rowChunks = tableBody.split(/\\\\/);
  let curOffset = baseOffset + bodyStart;

  for (let r = 0; r < rowChunks.length; r++) {
    const rowRaw = rowChunks[r];
    if (rowRaw === undefined) continue;
    if (r === rowChunks.length - 1 && rowRaw.trim() === "") {
      break;
    }

    const rowStart = curOffset;
    const rowEnd = curOffset + rowRaw.length + (r < rowChunks.length - 1 ? 2 : 0);
    const cells: VisualTableCell[] = [];

    const cellChunks = rowRaw.split(/(?<!\\)&/);
    let cellOffset = curOffset;

    for (let c = 0; c < cellChunks.length; c++) {
      const cellText = cellChunks[c];
      if (cellText === undefined) continue;
      const cleanContent = cellText.replace(/\\hline/g, "").trim();
      let cellStart = cellOffset;
      let cellEnd = cellOffset + cellText.length;
      if (cleanContent.length > 0) {
        const contentRelIndex = cellText.indexOf(cleanContent);
        if (contentRelIndex !== -1) {
          cellStart = cellOffset + contentRelIndex;
          cellEnd = cellStart + cleanContent.length;
        }
      } else {
        cellStart = cellOffset;
        cellEnd = cellOffset;
      }

      cells.push({
        rowIndex: r,
        colIndex: c,
        content: cleanContent,
        range: { start: cellStart, end: cellEnd },
        hash: computeTextHash(cleanContent),
      });

      cellOffset += cellText.length + 1;
    }

    rows.push({
      rowIndex: r,
      cells,
      range: { start: rowStart, end: rowEnd },
      raw: rowRaw + (r < rowChunks.length - 1 ? "\\\\" : ""),
    });

    curOffset = rowEnd;
  }

  return { alignment, alignmentRange, rows };
}

function findNextBlockBoundary(source: string, fromOffset: number): number {
  const boundaryRegex = /(?:\r?\n){2,}|\r?\n\s*(?=\\(?:section|subsection|subsubsection|begin|end\{document\}|\[|\$\$|documentclass|[a-zA-Z@]+(?![a-zA-Z@])))/g;
  boundaryRegex.lastIndex = fromOffset;
  const match = boundaryRegex.exec(source);
  if (match) {
    return match.index + match[0].length;
  }
  return source.length;
}

/**
 * Serializes the VisualAstDocument back into a LaTeX source string.
 * When nodes are untouched, this produces 100% byte-for-byte identical output to rawSource!
 */
export function serializeVisualAst(doc: VisualAstDocument): string {
  return doc.nodes.map((node) => node.raw).join("");
}

/**
 * Finds the AST block node covering a given 0-indexed character offset.
 */
export function findNodeAtOffset(doc: VisualAstDocument, offset: number): VisualBlockNode | null {
  for (const node of doc.nodes) {
    if (offset >= node.range.start && offset < node.range.end) {
      return node;
    }
  }
  return null;
}

/**
 * Finds a node by its unique identifier.
 */
export function findNodeById(doc: VisualAstDocument, id: string): VisualBlockNode | null {
  for (const node of doc.nodes) {
    if (node.id === id) return node;
  }
  return null;
}
