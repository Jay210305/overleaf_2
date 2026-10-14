import { describe, expect, it } from "vitest";
import { parseLatexLog } from "../../../packages/latex/src/parse-log.js";

describe("EDT-07 Diagnostics navigation from warnings and compiler logs (S06-T07)", () => {
  it("accurately identifies file and line numbers for warning navigation in editor", () => {
    const warningLog = `
(./intro.tex
LaTeX Warning: Reference \`eq:euler' on page 4 undefined on input line 29.
Package hyperref Warning: Difference between bookmark and anchor on input line 61.
)
`;
    const result = parseLatexLog(warningLog);
    expect(result.diagnostics).toHaveLength(2);

    expect(result.diagnostics[0]?.severity).toBe("warning");
    expect(result.diagnostics[0]?.filePath).toBe("intro.tex");
    expect(result.diagnostics[0]?.line).toBe(29);
    expect(result.diagnostics[0]?.message).toContain("eq:euler");

    expect(result.diagnostics[1]?.severity).toBe("warning");
    expect(result.diagnostics[1]?.filePath).toBe("intro.tex");
    expect(result.diagnostics[1]?.line).toBe(61);
    expect(result.diagnostics[1]?.message).toContain("hyperref");
  });
});
