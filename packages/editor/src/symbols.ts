export interface LatexSymbol {
  command: string;
  name: string;
  category: SymbolCategory;
  unicodeChar?: string | undefined;
  mathModeOnly: boolean;
}

export type SymbolCategory =
  "greek" | "operators" | "relations" | "arrows" | "delimiters" | "calculus_logic";

export const LATEX_SYMBOLS: readonly LatexSymbol[] = [
  // Greek
  { command: "\\alpha", name: "alpha", category: "greek", unicodeChar: "α", mathModeOnly: true },
  { command: "\\beta", name: "beta", category: "greek", unicodeChar: "β", mathModeOnly: true },
  { command: "\\gamma", name: "gamma", category: "greek", unicodeChar: "γ", mathModeOnly: true },
  { command: "\\delta", name: "delta", category: "greek", unicodeChar: "δ", mathModeOnly: true },
  {
    command: "\\epsilon",
    name: "epsilon",
    category: "greek",
    unicodeChar: "ε",
    mathModeOnly: true,
  },
  { command: "\\theta", name: "theta", category: "greek", unicodeChar: "θ", mathModeOnly: true },
  { command: "\\lambda", name: "lambda", category: "greek", unicodeChar: "λ", mathModeOnly: true },
  { command: "\\pi", name: "pi", category: "greek", unicodeChar: "π", mathModeOnly: true },
  { command: "\\sigma", name: "sigma", category: "greek", unicodeChar: "σ", mathModeOnly: true },
  { command: "\\omega", name: "omega", category: "greek", unicodeChar: "ω", mathModeOnly: true },
  { command: "\\Gamma", name: "Gamma", category: "greek", unicodeChar: "Γ", mathModeOnly: true },
  { command: "\\Delta", name: "Delta", category: "greek", unicodeChar: "Δ", mathModeOnly: true },
  { command: "\\Theta", name: "Theta", category: "greek", unicodeChar: "Θ", mathModeOnly: true },
  { command: "\\Lambda", name: "Lambda", category: "greek", unicodeChar: "Λ", mathModeOnly: true },
  { command: "\\Omega", name: "Omega", category: "greek", unicodeChar: "Ω", mathModeOnly: true },

  // Operators
  {
    command: "\\times",
    name: "times",
    category: "operators",
    unicodeChar: "×",
    mathModeOnly: true,
  },
  { command: "\\div", name: "div", category: "operators", unicodeChar: "÷", mathModeOnly: true },
  {
    command: "\\pm",
    name: "plus-minus",
    category: "operators",
    unicodeChar: "±",
    mathModeOnly: true,
  },
  {
    command: "\\mp",
    name: "minus-plus",
    category: "operators",
    unicodeChar: "∓",
    mathModeOnly: true,
  },
  { command: "\\cdot", name: "dot", category: "operators", unicodeChar: "·", mathModeOnly: true },
  {
    command: "\\cap",
    name: "intersection",
    category: "operators",
    unicodeChar: "∩",
    mathModeOnly: true,
  },
  { command: "\\cup", name: "union", category: "operators", unicodeChar: "∪", mathModeOnly: true },
  {
    command: "\\oplus",
    name: "oplus",
    category: "operators",
    unicodeChar: "⊕",
    mathModeOnly: true,
  },
  {
    command: "\\otimes",
    name: "otimes",
    category: "operators",
    unicodeChar: "⊗",
    mathModeOnly: true,
  },

  // Relations
  {
    command: "\\leq",
    name: "less equal",
    category: "relations",
    unicodeChar: "≤",
    mathModeOnly: true,
  },
  {
    command: "\\geq",
    name: "greater equal",
    category: "relations",
    unicodeChar: "≥",
    mathModeOnly: true,
  },
  {
    command: "\\equiv",
    name: "equivalent",
    category: "relations",
    unicodeChar: "≡",
    mathModeOnly: true,
  },
  {
    command: "\\approx",
    name: "approximate",
    category: "relations",
    unicodeChar: "≈",
    mathModeOnly: true,
  },
  {
    command: "\\neq",
    name: "not equal",
    category: "relations",
    unicodeChar: "≠",
    mathModeOnly: true,
  },
  {
    command: "\\subset",
    name: "subset",
    category: "relations",
    unicodeChar: "⊂",
    mathModeOnly: true,
  },
  {
    command: "\\subseteq",
    name: "subset equal",
    category: "relations",
    unicodeChar: "⊆",
    mathModeOnly: true,
  },
  {
    command: "\\in",
    name: "element in",
    category: "relations",
    unicodeChar: "∈",
    mathModeOnly: true,
  },
  {
    command: "\\notin",
    name: "not in",
    category: "relations",
    unicodeChar: "∉",
    mathModeOnly: true,
  },
  {
    command: "\\perp",
    name: "perpendicular",
    category: "relations",
    unicodeChar: "⊥",
    mathModeOnly: true,
  },

  // Arrows
  {
    command: "\\leftarrow",
    name: "left arrow",
    category: "arrows",
    unicodeChar: "←",
    mathModeOnly: true,
  },
  {
    command: "\\rightarrow",
    name: "right arrow",
    category: "arrows",
    unicodeChar: "→",
    mathModeOnly: true,
  },
  {
    command: "\\Leftarrow",
    name: "implies left",
    category: "arrows",
    unicodeChar: "⇐",
    mathModeOnly: true,
  },
  {
    command: "\\Rightarrow",
    name: "implies right",
    category: "arrows",
    unicodeChar: "⇒",
    mathModeOnly: true,
  },
  {
    command: "\\leftrightarrow",
    name: "left-right arrow",
    category: "arrows",
    unicodeChar: "↔",
    mathModeOnly: true,
  },
  { command: "\\to", name: "to", category: "arrows", unicodeChar: "→", mathModeOnly: true },
  {
    command: "\\mapsto",
    name: "maps to",
    category: "arrows",
    unicodeChar: "↦",
    mathModeOnly: true,
  },

  // Calculus & Logic
  {
    command: "\\infty",
    name: "infinity",
    category: "calculus_logic",
    unicodeChar: "∞",
    mathModeOnly: true,
  },
  {
    command: "\\partial",
    name: "partial",
    category: "calculus_logic",
    unicodeChar: "∂",
    mathModeOnly: true,
  },
  {
    command: "\\nabla",
    name: "nabla",
    category: "calculus_logic",
    unicodeChar: "∇",
    mathModeOnly: true,
  },
  {
    command: "\\forall",
    name: "for all",
    category: "calculus_logic",
    unicodeChar: "∀",
    mathModeOnly: true,
  },
  {
    command: "\\exists",
    name: "exists",
    category: "calculus_logic",
    unicodeChar: "∃",
    mathModeOnly: true,
  },
  {
    command: "\\sum",
    name: "sum",
    category: "calculus_logic",
    unicodeChar: "∑",
    mathModeOnly: true,
  },
  {
    command: "\\prod",
    name: "product",
    category: "calculus_logic",
    unicodeChar: "∏",
    mathModeOnly: true,
  },
  {
    command: "\\int",
    name: "integral",
    category: "calculus_logic",
    unicodeChar: "∫",
    mathModeOnly: true,
  },
  {
    command: "\\sqrt",
    name: "square root",
    category: "calculus_logic",
    unicodeChar: "√",
    mathModeOnly: true,
  },
];

/**
 * Searches symbols by query string and optional category filter (EDT-10).
 */
export function searchSymbols(query: string, category?: SymbolCategory): LatexSymbol[] {
  const q = query.trim().toLowerCase();
  return LATEX_SYMBOLS.filter((sym) => {
    if (category && sym.category !== category) {
      return false;
    }
    if (!q) return true;
    return (
      sym.command.toLowerCase().includes(q) ||
      sym.name.toLowerCase().includes(q) ||
      (sym.unicodeChar && sym.unicodeChar.toLowerCase().includes(q))
    );
  });
}

/**
 * Formats symbol insertion, automatically wrapping in $...$ if needed outside math mode (EDT-10).
 */
export function formatSymbolInsertion(symbol: LatexSymbol, inMathMode: boolean): string {
  if (symbol.mathModeOnly && !inMathMode) {
    return `$${symbol.command}$`;
  }
  return symbol.command;
}
