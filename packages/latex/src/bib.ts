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

  function getLineNumber(idx: number): number {
    let line = 1;
    for (let i = 0; i < idx; i++) {
      if (source[i] === "\n") line++;
    }
    return line;
  }

  const entryHeaderRegex = /@([a-zA-Z]+)\s*([\{\(])/g;
  let headerMatch: RegExpExecArray | null;

  while ((headerMatch = entryHeaderRegex.exec(source)) !== null) {
    const startIndex = headerMatch.index;
    const type = headerMatch[1]!.toLowerCase();
    const openDelim = headerMatch[2]!;
    const closeDelim = openDelim === "{" ? "}" : ")";

    if (["comment", "string", "preamble"].includes(type)) {
      continue;
    }

    const startLine = getLineNumber(startIndex);
    let depth = 1;
    let idx = entryHeaderRegex.lastIndex;

    // Skip whitespace to reach the citation key
    while (idx < source.length && /\s/.test(source[idx]!)) idx++;
    const keyStart = idx;
    while (
      idx < source.length &&
      source[idx] !== "," &&
      source[idx] !== closeDelim &&
      !/\s/.test(source[idx]!)
    ) {
      idx++;
    }
    const key = source.slice(keyStart, idx).trim();

    // Find end of entry by matching delimiters
    while (idx < source.length && depth > 0) {
      if (source[idx] === openDelim || (openDelim === "{" && source[idx] === "{")) depth++;
      else if (source[idx] === closeDelim || (closeDelim === "}" && source[idx] === "}")) depth--;
      idx++;
    }

    const endIndex = idx;
    const endLine = getLineNumber(Math.max(0, endIndex - 1));
    const rawSource = source.slice(startIndex, endIndex);

    entryHeaderRegex.lastIndex = endIndex;

    const entry = finishEntry(type, key, rawSource, startLine, endLine);
    if (entry.key) {
      entries.push(entry);
      const list = lineNumbersByKey.get(entry.key) ?? [];
      list.push(startLine);
      lineNumbersByKey.set(entry.key, list);
    } else {
      errors.push({ line: startLine, message: "Entry missing citation key" });
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
  type: string,
  key: string,
  rawSource: string,
  startLine: number,
  endLine: number,
): BibEntry {
  const fields: Record<string, string> = {};

  if (!key) {
    const keyMatch = rawSource.match(/@\w+\s*[\{\(]\s*([^,\s]+)/);
    if (keyMatch && keyMatch[1]) {
      key = keyMatch[1].trim();
    }
  }

  const fieldNameRegex = /([a-zA-Z0-9_\-]+)\s*=\s*/g;
  let match: RegExpExecArray | null;

  while ((match = fieldNameRegex.exec(rawSource)) !== null) {
    const name = match[1]!.toLowerCase();
    let idx = match.index + match[0].length;
    while (idx < rawSource.length && /\s/.test(rawSource[idx]!)) idx++;
    if (idx >= rawSource.length) break;

    let val = "";
    if (rawSource[idx] === "{") {
      let depth = 1;
      const start = idx + 1;
      idx++;
      while (idx < rawSource.length && depth > 0) {
        if (rawSource[idx] === "{") depth++;
        else if (rawSource[idx] === "}") depth--;
        idx++;
      }
      val = rawSource.slice(start, idx - 1);
    } else if (rawSource[idx] === '"') {
      const start = idx + 1;
      idx++;
      while (idx < rawSource.length && rawSource[idx] !== '"') {
        if (rawSource[idx] === "\\" && idx + 1 < rawSource.length) idx++;
        idx++;
      }
      val = rawSource.slice(start, idx);
      idx++;
    } else {
      const start = idx;
      while (
        idx < rawSource.length &&
        rawSource[idx] !== "," &&
        rawSource[idx] !== "}" &&
        rawSource[idx] !== ")" &&
        rawSource[idx] !== "\n"
      ) {
        idx++;
      }
      val = rawSource.slice(start, idx).trim();
    }
    fields[name] = val.trim();
    fieldNameRegex.lastIndex = idx;
  }

  return {
    type: type || "article",
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
