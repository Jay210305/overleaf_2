import { describe, expect, it } from "vitest";
import {
  parseLatexLog,
  redactHostPaths,
  redactSecrets,
} from "../../packages/latex/src/parse-log.js";
import { TrustedWorkerExecutor } from "../../apps/jobs/src/compilation/trusted-worker-executor.js";
import type { ExecuteInput } from "@latex-collab/contracts";

describe("S06-T07 Parse diagnostics and compile failures integration", () => {
  it("extracts file-line-error diagnostics with file and line numbers", () => {
    const log = `
This is pdfTeX, Version 3.141592653-2.6-1.40.26 (TeX Live 2024)
entering extended mode
./main.tex:14: Undefined control sequence.
<argument> \\badcommand
l.14 \\badcommand
`;
    const result = parseLatexLog(log);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toEqual({
      severity: "error",
      filePath: "main.tex",
      line: 14,
      message: "Undefined control sequence.",
    });
  });

  it("extracts classic TeX error blocks with line numbers from l.<number>", () => {
    const log = `
! LaTeX Error: Environment customenv undefined.

See the LaTeX manual or LaTeX Companion for explanation.
Type  H <return>  for immediate help.
 ...

l.42 \\begin{customenv}
                     
`;
    const result = parseLatexLog(log);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe("error");
    expect(result.diagnostics[0]?.line).toBe(42);
    expect(result.diagnostics[0]?.message).toBe("LaTeX Error: Environment customenv undefined.");
  });

  it("extracts LaTeX warnings with line numbers and undefined references", () => {
    const log = `
LaTeX Warning: Reference \`sec:results' on page 3 undefined on input line 55.
LaTeX Warning: Citation \`turing1936' on page 1 undefined on input line 12.
Package hyperref Warning: Token not allowed in a PDF string on input line 78.
Overfull \\hbox (15.2pt too wide) in paragraph at lines 100--105
`;
    const result = parseLatexLog(log);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(4);

    const refWarn = result.diagnostics.find((d) => d.message.includes("sec:results"));
    expect(refWarn).toBeDefined();
    expect(refWarn?.severity).toBe("warning");
    expect(refWarn?.line).toBe(55);

    const citeWarn = result.diagnostics.find((d) => d.message.includes("turing1936"));
    expect(citeWarn).toBeDefined();
    expect(citeWarn?.severity).toBe("warning");
    expect(citeWarn?.line).toBe(12);

    const hypWarn = result.diagnostics.find((d) => d.message.includes("hyperref"));
    expect(hypWarn).toBeDefined();
    expect(hypWarn?.severity).toBe("warning");
    expect(hypWarn?.line).toBe(78);

    const badBox = result.diagnostics.find((d) => d.message.includes("Overfull"));
    expect(badBox).toBeDefined();
    expect(badBox?.severity).toBe("warning");
    expect(badBox?.line).toBe(100);
  });

  it("redacts credentials, passwords, and tokens from logs (NFR-10)", () => {
    const secretLog = `
Compiler debug log:
connecting to postgres://user:super_secret_pw@db:5432/latex_db
redis url: redis://:redis_secret_auth@cache:6379/0
Authorization: Bearer secret_bearer_token_1234567890
Config: token="ghp_very_private_access_token_12345"
`;
    const cleaned = redactSecrets(secretLog);
    expect(cleaned).not.toContain("super_secret_pw");
    expect(cleaned).not.toContain("redis_secret_auth");
    expect(cleaned).not.toContain("secret_bearer_token_1234567890");
    expect(cleaned).not.toContain("ghp_very_private_access_token_12345");
    expect(cleaned).toContain("[REDACTED_SECRET]");
  });

  it("redacts host filesystem paths to relative project paths (CMP-02)", () => {
    const hostPathLog = `
/work/input/main.tex:20: LaTeX Error: Cannot find file.
/tmp/codex-executor-work-12345/sub/chapter.tex:33: Error in chapter.
/home/runner/workspace/figures/plot.tex:5: Bad dimension.
`;
    const cleaned = redactHostPaths(hostPathLog);
    expect(cleaned).not.toContain("/work/input/");
    expect(cleaned).not.toContain("/tmp/codex-executor-work-12345/");
    expect(cleaned).not.toContain("/home/runner/workspace/");

    const parsed = parseLatexLog(hostPathLog);
    expect(parsed.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(parsed.diagnostics[0]?.filePath).toBe("main.tex");
  });

  it("TrustedWorkerExecutor integrates parseLatexLog and populates diagnostics on failure", async () => {
    const executor = new TrustedWorkerExecutor({
      runner: async () => ({
        exitCode: 1,
        stdout: `
This is pdfTeX, Version 3.141592653-2.6-1.40.26 (TeX Live 2024)
/work/input/main.tex:19: Undefined control sequence.
l.19 \\unknownmacro
`,
        stderr: "latexmk: error exit",
      }),
    });

    const input: ExecuteInput = {
      jobId: "00000000-0000-0000-0000-000000000001",
      manifest: {
        version: 1,
        projectId: "00000000-0000-0000-0000-000000000002",
        revisionId: "00000000-0000-0000-0000-000000000003",
        revisionNo: 1,
        mainFileId: "node-1",
        compiler: "pdflatex",
        texliveImageDigest: "texlive:latest",
        items: [
          {
            nodeId: "node-1",
            path: "main.tex",
            kind: "TEXT",
            object: { key: "node-1-key", sha256: "hash-node", sizeBytes: 10, mime: "text/x-tex" },
          },
        ],
      },
      compiler: "pdflatex",
      imageDigest: "texlive:latest",
      policyVersion: "1.0.0",
      limits: {
        timeoutSeconds: 60,
        memoryMiB: 512,
        cpuCores: 1,
        maxOutputBytes: 25 * 1024 * 1024,
      },
    };

    const output = await executor.execute(input, new AbortController().signal);
    expect(output.status).toBe("failed");
    expect(output.exitCode).toBe(1);
    expect(output.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(output.diagnostics[0]?.filePath).toBe("main.tex");
    expect(output.diagnostics[0]?.line).toBe(19);
    expect(output.diagnostics[0]?.message).toBe("Undefined control sequence.");
  });
});
