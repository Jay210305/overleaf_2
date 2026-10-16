import React, { useState, useMemo } from "react";

export interface LatexHelpEntry {
  id: string;
  pattern: RegExp;
  title: string;
  explanation: string;
  suggestedFix: string;
  category: "syntax" | "environment" | "math" | "files" | "formatting";
}

export const STATIC_ERROR_CATALOG: readonly LatexHelpEntry[] = [
  {
    id: "undefined-control-sequence",
    pattern: /undefined control sequence/i,
    title: "Undefined Control Sequence",
    explanation: "LaTeX encountered a command that is not recognized. This is usually caused by a spelling mistake in a command name or a missing \\usepackage in your preamble.",
    suggestedFix: "Check the spelling of the command or add the required package (e.g. \\usepackage{amsmath}) to your preamble.",
    category: "syntax",
  },
  {
    id: "missing-dollar-inserted",
    pattern: /missing \$ inserted/i,
    title: "Missing $ Inserted",
    explanation: "A math-mode character (like _, ^, or a math symbol) was used outside of math mode, or an opening/closing dollar sign was missed.",
    suggestedFix: "Enclose math characters in single dollar signs $...$ or escape underscores as \\_.",
    category: "math",
  },
  {
    id: "mismatched-environment",
    pattern: /\\begin\{([^}]+)\} ended by \\end\{([^}]+)\}/i,
    title: "Mismatched Environment",
    explanation: "An environment was opened with one name and closed with another name, or environments are improperly nested.",
    suggestedFix: "Ensure every \\begin{env} has a matching \\end{env} in proper nested order.",
    category: "environment",
  },
  {
    id: "environment-undefined",
    pattern: /environment ([^ ]+) undefined/i,
    title: "Environment Undefined",
    explanation: "The requested environment does not exist or requires an unimported package.",
    suggestedFix: "Verify the environment name or import the package providing it (e.g. \\usepackage{tabularx}).",
    category: "environment",
  },
  {
    id: "file-not-found",
    pattern: /file `([^']+)' not found/i,
    title: "File Not Found",
    explanation: "An \\input{...}, \\include{...}, or \\includegraphics{...} command referenced a file that does not exist in the project tree.",
    suggestedFix: "Verify that the referenced file exists in your project with the correct relative path and extension.",
    category: "files",
  },
  {
    id: "overfull-hbox",
    pattern: /overfull \\hbox/i,
    title: "Overfull \\hbox (Line Overflow)",
    explanation: "Text or a formula extends beyond the right page margin because LaTeX could not find a suitable hyphenation or line break.",
    suggestedFix: "Reword the sentence, provide explicit hyphenation hints \\-, or place long formulas on separate lines.",
    category: "formatting",
  },
  {
    id: "underfull-hbox",
    pattern: /underfull \\hbox/i,
    title: "Underfull \\hbox",
    explanation: "LaTeX had to stretch spacing excessively to fill a line, often due to manual line breaks (\\\\) used instead of paragraph breaks.",
    suggestedFix: "Avoid manual line breaks \\\\ in standard paragraphs. Use empty lines for paragraph separation.",
    category: "formatting",
  },
  {
    id: "emergency-stop",
    pattern: /emergency stop/i,
    title: "Emergency Stop",
    explanation: "LaTeX halted execution because a fatal error occurred, such as a missing end-of-file, unclosed group, or missing mandatory file.",
    suggestedFix: "Scroll up to the first reported error in the compilation log to identify the root cause before the emergency stop.",
    category: "syntax",
  },
  {
    id: "missing-begin-document",
    pattern: /missing \\begin\{document\}/i,
    title: "Missing \\begin{document}",
    explanation: "Text was placed before \\begin{document}, or the command itself was omitted from the root TeX file.",
    suggestedFix: "Ensure all printable content appears after \\begin{document} and that only preamble macros precede it.",
    category: "syntax",
  },
];

/**
 * Searches the static offline error catalog for an error message.
 * Operates purely locally with 0 external network requests (EDT-14).
 */
export function lookupErrorHelp(errorMessage: string): LatexHelpEntry | null {
  for (const entry of STATIC_ERROR_CATALOG) {
    if (entry.pattern.test(errorMessage)) {
      return entry;
    }
  }
  return null;
}

/**
 * Filter error catalog by text query.
 */
export function searchHelpCatalog(query: string): LatexHelpEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...STATIC_ERROR_CATALOG];
  return STATIC_ERROR_CATALOG.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.explanation.toLowerCase().includes(q) ||
      e.suggestedFix.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
  );
}

export interface LatexHelpPanelProps {
  currentErrorMessage?: string | undefined;
  onClose?: () => void;
}

/**
 * Offline LaTeX Static Help & Guidance Component (EDT-14).
 * Always serves static advice first; does not make any external network calls.
 */
export const LatexHelpPanel: React.FC<LatexHelpPanelProps> = ({
  currentErrorMessage,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [aiConsentGiven, setAiConsentGiven] = useState(false);

  const matchedEntry = useMemo(() => {
    return currentErrorMessage ? lookupErrorHelp(currentErrorMessage) : null;
  }, [currentErrorMessage]);

  const searchResults = useMemo(() => {
    return searchHelpCatalog(searchQuery);
  }, [searchQuery]);

  return (
    <div
      role="region"
      aria-label="LaTeX Help and Error Assistance"
      className="p-4 border border-gray-300 rounded-md bg-white text-gray-900 shadow-sm space-y-4"
    >
      <div className="flex justify-between items-center border-b pb-2">
        <div>
          <h3 className="font-semibold text-lg">LaTeX Static Help</h3>
          <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-mono">
            Offline • Zero external network traffic
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-sm"
            aria-label="Close help"
          >
            ✕
          </button>
        )}
      </div>

      {matchedEntry && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm space-y-1">
          <div className="font-bold text-red-900 flex items-center gap-1">
            <span>Diagnosed:</span>
            <span>{matchedEntry.title}</span>
          </div>
          <p className="text-red-800">{matchedEntry.explanation}</p>
          <div className="text-red-950 font-medium">
            Fix: <span className="font-normal">{matchedEntry.suggestedFix}</span>
          </div>
        </div>
      )}

      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search static error and command help..."
          className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          aria-label="Search help topics"
        />
      </div>

      <div className="max-h-60 overflow-y-auto space-y-2 text-sm">
        {searchResults.map((entry) => (
          <div key={entry.id} className="p-2 border rounded hover:bg-gray-50">
            <div className="flex justify-between items-baseline">
              <span className="font-medium text-gray-800">{entry.title}</span>
              <span className="text-xs text-gray-500 uppercase">{entry.category}</span>
            </div>
            <p className="text-gray-600 text-xs mt-1">{entry.explanation}</p>
            <p className="text-gray-800 text-xs mt-1 font-mono bg-gray-100 p-1 rounded">
              {entry.suggestedFix}
            </p>
          </div>
        ))}
      </div>

      {/* AI Assistance Section (Strictly requires explicit opt-in, EDT-14) */}
      <div className="pt-2 border-t text-xs text-gray-600 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={aiConsentGiven}
            onChange={(e) => setAiConsentGiven(e.target.checked)}
            className="rounded text-blue-600"
          />
          <span>Enable experimental AI explanations (Requires explicit user consent)</span>
        </label>
        {aiConsentGiven ? (
          <p className="text-blue-700 italic">
            AI assistance enabled. Note: AI is non-blocking and static help is always prioritized.
          </p>
        ) : (
          <p className="text-gray-500">
            AI features remain dormant. 100% offline static dictionary and grammar rules applied.
          </p>
        )}
      </div>
    </div>
  );
};
