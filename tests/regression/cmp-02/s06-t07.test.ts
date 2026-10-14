import { describe, expect, it } from "vitest";
import { parseLatexLog } from "../../../packages/latex/src/parse-log.js";

describe("CMP-02 Redacted stdout/stderr and file/line error parsing (S06-T07)", () => {
  it("exposes clean file/line diagnostics without revealing container or host mount paths", () => {
    const rawCompilerLog = `
(/work/input/main.tex
/work/input/chapter1.tex:15: LaTeX Error: Something went wrong.
/work/input/chapter2.tex:88: Package amsmath Error: Erroneous structure.
)
`;
    const result = parseLatexLog(rawCompilerLog, { workDir: "/work/input" });
    expect(result.diagnostics).toHaveLength(2);

    expect(result.diagnostics[0]?.filePath).toBe("chapter1.tex");
    expect(result.diagnostics[0]?.line).toBe(15);
    expect(result.diagnostics[0]?.message).toBe("LaTeX Error: Something went wrong.");

    expect(result.diagnostics[1]?.filePath).toBe("chapter2.tex");
    expect(result.diagnostics[1]?.line).toBe(88);
    expect(result.diagnostics[1]?.message).toBe("Package amsmath Error: Erroneous structure.");

    // Clean log should not contain /work/input/
    expect(result.cleanLog).not.toContain("/work/input/");
  });
});
