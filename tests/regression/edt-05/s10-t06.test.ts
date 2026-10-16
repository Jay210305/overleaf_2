import { describe, expect, it } from "vitest";
import {
  autoCloseEnvironment,
  getEnvironmentFoldRanges,
} from "../../../packages/editor/src/completion.js";

describe("EDT-05 Regression: Environment pairing and non-corrupting folding ranges", () => {
  it("generates closed pair with exact indentation", () => {
    const pair = autoCloseEnvironment("itemize", "    ");
    expect(pair).toBe("\\begin{itemize}\n    \n\\end{itemize}");
  });

  it("extracts folding ranges for nested environments correctly", () => {
    const doc = `\\begin{document}
\\begin{align}
  x &= 1 \\\\
  y &= 2
\\end{align}
\\end{document}`;

    const ranges = getEnvironmentFoldRanges(doc);
    expect(ranges).toHaveLength(2);
    expect(ranges.map((r) => r.env).sort()).toEqual(["align", "document"]);
  });
});
