export interface BibEntrySummary {
  key: string;
  type: string;
  title?: string | undefined;
  author?: string | undefined;
  year?: string | undefined;
}


export interface DuplicateKeyReport {
  key: string;
  count: number;
  lines: number[];
}

/**
 * Extracts all citation keys from a .bib source without mutating or normalizing the text.
 */
export function extractBibKeys(bibSource: string): string[] {
  const keys: string[] = [];
  const entryRegex = /@([a-zA-Z]+)\s*[\{\(]\s*([^,\s]+)/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(bibSource)) !== null) {
    const type = match[1]?.toLowerCase();
    const key = match[2]?.trim();
    // Exclude special entries like @comment, @string, @preamble
    if (type && key && !["comment", "string", "preamble"].includes(type)) {
      keys.push(key);
    }
  }

  return keys;
}

/**
 * Identifies duplicate citation keys in .bib content.
 */
export function findDuplicateBibKeys(bibSource: string): DuplicateKeyReport[] {
  const lineNumbersByKey = new Map<string, number[]>();
  const lines = bibSource.split(/\r?\n/);
  const entryRegex = /@([a-zA-Z]+)\s*[\{\(]\s*([^,\s]+)/;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    const match = line.match(entryRegex);
    if (match) {
      const type = match[1]?.toLowerCase();
      const key = match[2]?.trim();
      if (type && key && !["comment", "string", "preamble"].includes(type)) {
        const existing = lineNumbersByKey.get(key) ?? [];
        existing.push(lineIdx + 1);
        lineNumbersByKey.set(key, existing);
      }
    }
  }

  const duplicates: DuplicateKeyReport[] = [];
  for (const [key, lineNumbers] of lineNumbersByKey.entries()) {
    if (lineNumbers.length > 1) {
      duplicates.push({
        key,
        count: lineNumbers.length,
        lines: lineNumbers,
      });
    }
  }

  return duplicates;
}

/**
 * Parses basic metadata from .bib entries for completion and search.
 */
export function extractBibSummaries(bibSource: string): BibEntrySummary[] {
  const entries: BibEntrySummary[] = [];
  const rawEntries = bibSource.split(/(?=@\w+\s*[\{\(])/);

  for (const raw of rawEntries) {
    const headerMatch = raw.match(/@([a-zA-Z]+)\s*[\{\(]\s*([^,\s]+)/);
    if (!headerMatch) continue;

    const type = headerMatch[1]?.toLowerCase() ?? "";
    const key = headerMatch[2]?.trim() ?? "";
    if (!type || !key || ["comment", "string", "preamble"].includes(type)) {
      continue;
    }

    const titleMatch = raw.match(/title\s*=\s*[\{\"]([^\"\}]+)[\}\"]/i);
    const authorMatch = raw.match(/author\s*=\s*[\{\"]([^\"\}]+)[\}\"]/i);
    const yearMatch = raw.match(/year\s*=\s*[\{\"]?(\d{4})[\}\"]?/i);

    entries.push({
      key,
      type,
      title: titleMatch?.[1]?.trim(),
      author: authorMatch?.[1]?.trim(),
      year: yearMatch?.[1]?.trim(),
    });
  }

  return entries;
}

export interface CitationQueryContext {
  command: string;
  query: string;
  from: number;
  to: number;
}

/**
 * Detects whether cursor is currently inside a \cite{...} command and returns query context.
 */
export function getCitationQueryAtCursor(
  text: string,
  cursorOffset: number,
): CitationQueryContext | null {
  if (cursorOffset < 0 || cursorOffset > text.length) {
    return null;
  }

  const precedingText = text.slice(0, cursorOffset);
  // Matches \cite, \citep, \citet, \autocite, etc.
  const match = precedingText.match(/\\(cite|citep|citet|autocite|parencite|textcite)\*?\{([^}]*)$/);
  if (!match) {
    return null;
  }

  const command = match[1]!;
  const keysSoFar = match[2]!;
  const lastCommaIndex = keysSoFar.lastIndexOf(",");
  const currentToken = lastCommaIndex >= 0 ? keysSoFar.slice(lastCommaIndex + 1).trimStart() : keysSoFar;

  const tokenStartOffset = cursorOffset - currentToken.length;

  return {
    command,
    query: currentToken,
    from: tokenStartOffset,
    to: cursorOffset,
  };
}

/**
 * Completes or inserts a citation key at the cursor position.
 */
export function insertCitation(
  currentText: string,
  cursorOffset: number,
  key: string,
): { newText: string; newCursor: number } {
  if (!key || /[\s,}]/.test(key)) {
    throw new Error(`Invalid citation key: "${key}"`);
  }

  const queryContext = getCitationQueryAtCursor(currentText, cursorOffset);

  if (queryContext) {
    // Replace the partial token with the full key
    const before = currentText.slice(0, queryContext.from);
    const after = currentText.slice(queryContext.to);
    // If closing brace isn't present immediately, add closing brace if not existing
    let suffix = "";
    if (!after.startsWith("}")) {
      suffix = "}";
    }
    const newText = `${before}${key}${suffix}${after}`;
    const newCursor = queryContext.from + key.length + suffix.length;
    return { newText, newCursor };
  }

  // Not inside a cite command: insert \cite{key}
  const before = currentText.slice(0, cursorOffset);
  const after = currentText.slice(cursorOffset);
  const snippet = `\\cite{${key}}`;
  const newText = `${before}${snippet}${after}`;
  const newCursor = cursorOffset + snippet.length;

  return { newText, newCursor };
}
