export interface BibEntry {
  type: string;
  key: string;
  title?: string | undefined;
  author?: string | undefined;
  year?: string | undefined;
  doi?: string | undefined;
  journal?: string | undefined;
  booktitle?: string | undefined;
  publisher?: string | undefined;
  fields: Record<string, string>;
  rawSource: string;
  startLine: number;
  endLine: number;
}

export interface DuplicateBibKey {
  key: string;
  count: number;
  lines: number[];
}

export interface BibParseError {
  line: number;
  message: string;
}

export interface BibParseResult {
  entries: BibEntry[];
  duplicateKeys: DuplicateBibKey[];
  errors: BibParseError[];
}

export interface BibSearchFilter {
  query?: string | undefined;
  key?: string | undefined;
  title?: string | undefined;
  author?: string | undefined;
  year?: string | undefined;
  doi?: string | undefined;
}


/**
 * Parses BibTeX source without modifying or reformatting the source text (INT-08).
 * Preserves exact text in rawSource.
 */
export function parseBibTeX(source: string): BibParseResult {
  const entries: BibEntry[] = [];
  const errors: BibParseError[] = [];
  const lineNumbersByKey = new Map<string, number[]>();

  const lines = source.split(/\r?\n/);
  let currentEntry: {
    type: string;
    key: string;
    startLine: number;
    lines: string[];
    braceDepth: number;
  } | null = null;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    const lineNum = lineIdx + 1;

    let searchIndex = 0;
    if (!currentEntry) {
      const match = line.match(/@([a-zA-Z]+)\s*([\{\(])\s*([^,\s]+)?/);
      if (match && match.index !== undefined) {
        const type = match[1]!.toLowerCase();
        if (!["comment", "string", "preamble"].includes(type)) {
          const key = match[3]?.trim() ?? "";
          currentEntry = {
            type,
            key,
            startLine: lineNum,
            lines: [line],
            braceDepth: 1, // The opening brace after @type
          };
          searchIndex = match.index + match[0].length;
        }
      }
    } else {
      currentEntry.lines.push(line);
      searchIndex = 0;
    }

    if (currentEntry) {
      for (let c = searchIndex; c < line.length; c++) {
        const char = line[c];
        if (char === "{" || char === "(") {
          currentEntry.braceDepth++;
        } else if (char === "}" || char === ")") {
          currentEntry.braceDepth--;
          if (currentEntry.braceDepth <= 0) {
            const rawSource = currentEntry.lines.join("\n");
            const entry = finishEntry(currentEntry, rawSource, currentEntry.startLine, lineNum);
            if (entry.key) {
              entries.push(entry);
              const list = lineNumbersByKey.get(entry.key) ?? [];
              list.push(currentEntry.startLine);
              lineNumbersByKey.set(entry.key, list);
            } else {
              errors.push({ line: currentEntry.startLine, message: "Entry missing citation key" });
            }
            currentEntry = null;
            break;
          }
        }
      }
    }
  }

  // Handle unclosed entry at EOF
  if (currentEntry && currentEntry.lines.length > 0) {
    const rawSource = currentEntry.lines.join("\n");
    const entry = finishEntry(currentEntry, rawSource, currentEntry.startLine, lines.length);
    if (entry.key) {
      entries.push(entry);
      const list = lineNumbersByKey.get(entry.key) ?? [];
      list.push(currentEntry.startLine);
      lineNumbersByKey.set(entry.key, list);
    }
  }

  const duplicateKeys: DuplicateBibKey[] = [];
  for (const [key, linesList] of lineNumbersByKey.entries()) {
    if (linesList.length > 1) {
      duplicateKeys.push({
        key,
        count: linesList.length,
        lines: linesList,
      });
    }
  }

  return {
    entries,
    duplicateKeys,
    errors,
  };
}

function finishEntry(
  partial: { type: string; key?: string },
  rawSource: string,
  startLine: number,
  endLine: number,
): BibEntry {
  const fields: Record<string, string> = {};

  let key = partial.key ?? "";
  if (!key) {
    const keyMatch = rawSource.match(/@\w+\s*[\{\(]\s*([^,\s]+)/);
    if (keyMatch && keyMatch[1]) {
      key = keyMatch[1].trim();
    }
  }

  const fieldRegex = /([a-zA-Z0-9_\-]+)\s*=\s*(?:\{([^}]*)\}|"([^"]*)"|([a-zA-Z0-9]+))/g;
  let match: RegExpExecArray | null;

  while ((match = fieldRegex.exec(rawSource)) !== null) {
    const name = match[1]!.toLowerCase();
    const val = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    fields[name] = val;
  }

  return {
    type: partial.type ?? "article",
    key,
    title: fields.title,
    author: fields.author,
    year: fields.year,
    doi: fields.doi,
    journal: fields.journal,
    booktitle: fields.booktitle,
    publisher: fields.publisher,
    fields,
    rawSource,
    startLine,
    endLine,
  };
}

/**
 * Searches parsed BibTeX entries locally across key, title, author, year, and DOI (INT-02).
 */
export function searchBibEntries(
  entries: BibEntry[],
  filter: BibSearchFilter | string,
): BibEntry[] {
  if (typeof filter === "string") {
    const term = filter.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((e) => {
      return (
        e.key.toLowerCase().includes(term) ||
        (e.title && e.title.toLowerCase().includes(term)) ||
        (e.author && e.author.toLowerCase().includes(term)) ||
        (e.year && e.year.toLowerCase().includes(term)) ||
        (e.doi && e.doi.toLowerCase().includes(term)) ||
        (e.journal && e.journal.toLowerCase().includes(term))
      );
    });
  }

  return entries.filter((e) => {
    if (filter.query) {
      const q = filter.query.trim().toLowerCase();
      const matchesQuery =
        e.key.toLowerCase().includes(q) ||
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.author && e.author.toLowerCase().includes(q)) ||
        (e.year && e.year.toLowerCase().includes(q)) ||
        (e.doi && e.doi.toLowerCase().includes(q));
      if (!matchesQuery) return false;
    }
    if (filter.key && !e.key.toLowerCase().includes(filter.key.toLowerCase())) {
      return false;
    }
    if (filter.title && (!e.title || !e.title.toLowerCase().includes(filter.title.toLowerCase()))) {
      return false;
    }
    if (filter.author && (!e.author || !e.author.toLowerCase().includes(filter.author.toLowerCase()))) {
      return false;
    }
    if (filter.year && (!e.year || !e.year.toLowerCase().includes(filter.year.toLowerCase()))) {
      return false;
    }
    if (filter.doi && (!e.doi || !e.doi.toLowerCase().includes(filter.doi.toLowerCase()))) {
      return false;
    }
    return true;
  });
}

/**
 * Explicit normalization helper (INT-08).
 * Note: Only invoked on explicit user request; opening a .bib file never applies this.
 */
export function normalizeBibTeX(
  source: string,
  options: { sortByKey?: boolean } = {},
): string {
  const result = parseBibTeX(source);
  const sortedEntries = [...result.entries];
  if (options.sortByKey) {
    sortedEntries.sort((a, b) => a.key.localeCompare(b.key));
  }

  const blocks = sortedEntries.map((e) => {
    const fieldLines = Object.entries(e.fields)
      .map(([k, v]) => `  ${k} = {${v}},`)
      .join("\n");
    return `@${e.type}{${e.key},\n${fieldLines}\n}`;
  });

  return blocks.join("\n\n") + "\n";
}
