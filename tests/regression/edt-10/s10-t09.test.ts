import { describe, expect, it } from "vitest";
import { formatSymbolInsertion, searchSymbols } from "../../../packages/editor/src/symbols.js";

describe("EDT-10 Regression: Mathematical symbols search and categorized insertion", () => {
  it("filters symbols by category", () => {
    const operators = searchSymbols("", "operators");
    expect(operators.length).toBeGreaterThanOrEqual(8);
    for (const op of operators) {
      expect(op.category).toBe("operators");
    }
  });

  it("formats symbol commands according to math mode context", () => {
    const sym = searchSymbols("infty")[0]!;
    expect(formatSymbolInsertion(sym, true)).toBe("\\infty");
    expect(formatSymbolInsertion(sym, false)).toBe("$\\infty$");
  });
});
