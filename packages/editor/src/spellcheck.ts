export interface SpellingError {
  word: string;
  from: number;
  to: number;
  suggestions: string[];
}

// Built-in offline dictionary of common academic and general English vocabulary
export const DEFAULT_DICTIONARY: readonly string[] = [
  "the",
  "be",
  "to",
  "of",
  "and",
  "a",
  "in",
  "that",
  "have",
  "i",
  "it",
  "for",
  "not",
  "on",
  "with",
  "he",
  "as",
  "you",
  "do",
  "at",
  "this",
  "but",
  "his",
  "by",
  "from",
  "they",
  "we",
  "say",
  "her",
  "she",
  "or",
  "an",
  "will",
  "my",
  "one",
  "all",
  "would",
  "there",
  "their",
  "what",
  "so",
  "up",
  "out",
  "if",
  "about",
  "who",
  "get",
  "which",
  "go",
  "me",
  "when",
  "make",
  "can",
  "like",
  "time",
  "no",
  "just",
  "him",
  "know",
  "take",
  "people",
  "into",
  "year",
  "your",
  "good",
  "some",
  "could",
  "them",
  "see",
  "other",
  "than",
  "then",
  "now",
  "look",
  "only",
  "come",
  "its",
  "over",
  "think",
  "also",
  "back",
  "after",
  "use",
  "two",
  "how",
  "our",
  "work",
  "first",
  "well",
  "way",
  "even",
  "new",
  "want",
  "because",
  "any",
  "these",
  "give",
  "day",
  "most",
  "us",
  "is",
  "are",
  "was",
  "were",
  "been",
  "being",
  "has",
  "had",
  "does",
  "did",
  "here",
  "where",
  "why",
  "how",
  "all",
  "both",
  "each",
  "few",
  "more",
  "most",
  "text",
  "valid",
  "brand",
  "words",
  "word",
  "show",
  "shown",
  "such",
  "same",
  "true",
  "false",
  "case",
  "study",
  "studies",
  "set",
  "many",
  "much",
  "such",
  // Academic words
  "abstract",
  "algorithm",
  "analysis",
  "approach",
  "article",
  "author",
  "benchmark",
  "conclusion",
  "data",
  "definition",
  "equation",
  "experiment",
  "figure",
  "method",
  "model",
  "paper",
  "proof",
  "proposal",
  "reference",
  "result",
  "section",
  "system",
  "table",
  "theorem",
  "theory",
  "thesis",
  "university",
  "quantum",
  "physics",
  "computer",
  "science",
  "mechanics",
  "entanglement",
  "phenomenon",
  "classical",
  "function",
  "matrix",
  "vector",
  "distribution",
  "hypothesis",
  "introduction",
  "discussion",
  "document",
  "evaluation",
  "framework",
  "performance",
  "review",
  "summary",
  "ignore",
  "ignored",
  "zero",
  "number",
  "value",
  "state",
  "point",
  "type",
  "form",
  "equal",
];

const DICTIONARY_SET = new Set(DEFAULT_DICTIONARY);

/**
 * Calculates Levenshtein distance between two strings for typo suggestions.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }

  return dp[m]![n]!;
}

/**
 * Checks spelling in LaTeX prose while strictly ignoring TeX markup and commands (EDT-11).
 */
export function checkSpelling(
  source: string,
  customWords: readonly string[] = [],
): SpellingError[] {
  const errors: SpellingError[] = [];
  const activeDict = new Set([...DICTIONARY_SET, ...customWords.map((w) => w.toLowerCase())]);

  // Mask out regions that should not be spell checked (preserving character offsets)
  const maskRanges: Array<{ from: number; to: number }> = [];

  // 1. Comments
  const commentRegex = /(?:^|[^\\])(%.*)$/gm;
  let match: RegExpExecArray | null;
  while ((match = commentRegex.exec(source)) !== null) {
    const fullMatch = match[0]!;
    const commentPart = match[1]!;
    const from = match.index + (fullMatch.length - commentPart.length);
    maskRanges.push({ from, to: from + commentPart.length });
  }

  // 2. Math environments
  const mathDisplayRegex =
    /\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|displaymath|eqnarray\*?|alignat\*?)\}[\s\S]*?\\end\{\1\}/g;
  while ((match = mathDisplayRegex.exec(source)) !== null) {
    maskRanges.push({ from: match.index, to: match.index + match[0].length });
  }

  const bracketMathRegex = /\\\[[\s\S]*?\\\]/g;
  while ((match = bracketMathRegex.exec(source)) !== null) {
    maskRanges.push({ from: match.index, to: match.index + match[0].length });
  }

  const doubleDollarMathRegex = /\$\$[\s\S]*?\$\$/g;
  while ((match = doubleDollarMathRegex.exec(source)) !== null) {
    maskRanges.push({ from: match.index, to: match.index + match[0].length });
  }

  const inlineMathRegex = /(?:^|[^\\])\$([^\$]+)\$/g;
  while ((match = inlineMathRegex.exec(source)) !== null) {
    maskRanges.push({ from: match.index, to: match.index + match[0].length });
  }

  // 3. LaTeX commands and technical arguments (e.g. \cite{...}, \label{...}, \ref{...}, \input{...}, \begin{...}, \end{...})
  const nonProseCmdRegex =
    /\\(cite|citep|citet|autocite|ref|eqref|pageref|autoref|label|includegraphics|input|include|usepackage|documentclass|begin|end|bibliographystyle|bibliography)\*?(?:\[[^\]]*\])?\{[^}]*\}/g;
  while ((match = nonProseCmdRegex.exec(source)) !== null) {
    maskRanges.push({ from: match.index, to: match.index + match[0].length });
  }

  // 4. Standalone LaTeX commands: \section, \begin, \end, \textbf, etc.
  const cmdRegex = /\\[a-zA-Z]+\*?/g;
  while ((match = cmdRegex.exec(source)) !== null) {
    maskRanges.push({ from: match.index, to: match.index + match[0].length });
  }

  // Sort mask ranges
  maskRanges.sort((a, b) => a.from - b.from);

  function isMasked(pos: number): boolean {
    return maskRanges.some((r) => pos >= r.from && pos < r.to);
  }

  // Tokenize words in unmasked regions
  const wordRegex = /[a-zA-Z\u00C0-\u024F]+/g;
  while ((match = wordRegex.exec(source)) !== null) {
    const word = match[0]!;
    const pos = match.index;

    if (isMasked(pos)) {
      continue;
    }

    // Ignore single letters or uppercase acronyms
    if (word.length <= 1 || (word === word.toUpperCase() && word.length <= 5)) {
      continue;
    }

    const lower = word.toLowerCase();
    if (!activeDict.has(lower)) {
      // Find suggestions with Levenshtein distance <= 2, prioritized by lowest distance
      const candidates: Array<{ word: string; dist: number }> = [];
      for (const dictWord of activeDict) {
        if (Math.abs(dictWord.length - lower.length) <= 2) {
          const dist = levenshteinDistance(lower, dictWord);
          if (dist <= 2) {
            candidates.push({ word: dictWord, dist });
          }
        }
      }
      candidates.sort((a, b) => a.dist - b.dist);
      const suggestions = candidates.slice(0, 5).map((c) => c.word);

      errors.push({
        word,
        from: pos,
        to: pos + word.length,
        suggestions,
      });
    }
  }

  return errors;
}
