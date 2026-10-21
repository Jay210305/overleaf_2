import { useMemo } from "react";

export interface OutlineEntry {
  id: string;
  level: number;
  title: string;
  line: number;
}

const sectionPattern = /\\(chapter|part|section|subsection|subsubsection|paragraph)(\*?)\s*\{/g;

const levelFor: Record<string, number> = {
  part: 1,
  chapter: 1,
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
};

/** Read the balanced `{...}` group that starts at `openIndex`. */
function readBracedGroup(source: string, openIndex: number): { text: string; end: number } | null {
  if (source[openIndex] !== "{") return null;
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { text: source.slice(openIndex + 1, index), end: index + 1 };
      }
    }
  }
  return null;
}

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index && position < source.length; position += 1) {
    if (source[position] === "\n") line += 1;
  }
  return line;
}

/** Strip inline LaTeX markup so the outline reads like the compiled headings. */
export function outlineTitle(raw: string): string {
  return raw
    .replace(/\\(label|ref|eqref|cite|footnote|index)\{[^{}]*\}/gi, " ")
    .replace(/\\[a-zA-Z@]+\*?/g, " ")
    .replace(/\\/g, " ")
    .replace(/[{}$&~^_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * Extract the document hierarchy from LaTeX source. Command comments such as
 * `% \section{Draft}` are ignored so only real headings appear in the outline.
 */
export function parseOutline(source: string): OutlineEntry[] {
  if (!source) return [];
  const entries: OutlineEntry[] = [];
  sectionPattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = sectionPattern.exec(source)) !== null) {
    const command = match[1] ?? "section";
    const lineStart = source.lastIndexOf("\n", match.index) + 1;
    const prefix = source.slice(lineStart, match.index);
    if (/(^|[^\\])%/.test(prefix)) continue;
    const open = match.index + match[0].length - 1;
    const group = readBracedGroup(source, open);
    if (!group) continue;
    const title = outlineTitle(group.text);
    if (title.length === 0) continue;
    const line = lineAt(source, match.index);
    entries.push({
      id: `${line}-${command}-${entries.length}`,
      level: levelFor[command] ?? 1,
      title,
      line,
    });
    sectionPattern.lastIndex = group.end;
  }
  return entries;
}

export interface DocumentOutlineProps {
  source: string;
  fileName?: string | undefined;
  onJumpToLine?: ((line: number) => void) | undefined;
  loading?: boolean | undefined;
}

/**
 * Live table of contents for the open document. Clicking a heading jumps the
 * editor caret to that line (Overleaf's "File outline" panel).
 */
export function DocumentOutline({
  source,
  fileName,
  onJumpToLine,
  loading = false,
}: DocumentOutlineProps) {
  const entries = useMemo(() => parseOutline(source), [source]);

  if (loading) {
    return (
      <p className="outline-empty" role="status">
        Loading document outline…
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="outline-empty" role="status">
        <p className="outline-empty-title">No headings yet</p>
        <p>
          Add <code>\section{"{Introduction}"}</code>, <code>\subsection</code> or{" "}
          <code>\chapter</code> to this file and it will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <nav className="outline-panel" aria-label={`Outline of ${fileName ?? "current document"}`}>
      <ol className="outline-list">
        {entries.map((entry) => (
          <li key={entry.id} className={`outline-item level-${entry.level}`}>
            <button
              type="button"
              className="outline-link"
              style={{ paddingLeft: `${8 + (entry.level - 1) * 14}px` }}
              onClick={() => onJumpToLine?.(entry.line)}
              title={`Line ${entry.line}`}
              data-testid={`outline-entry-${entry.line}`}
            >
              <span className="outline-text">{entry.title}</span>
              <span className="outline-line" aria-hidden="true">
                {entry.line}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
