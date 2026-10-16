import { describe, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getTeXProfile,
  isSupportedCompiler,
  PROFILE_FIXTURES,
  resolveProfileArgv,
  SUPPORTED_COMPILERS,
  UnsupportedTeXProfileError,
  UnsafeArgvError,
} from "../../apps/tex-executor/src/profiles.js";
import { TrustedWorkerExecutor } from "../../apps/jobs/src/compilation/trusted-worker-executor.js";
import type { ExecuteInput } from "@latex-collab/contracts";

describe("S10-T01 Integration: Alternative TeX Profiles", () => {
  const genuinePdf = "%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF";

  it("registers and validates all four supported compilers", () => {
    expect(SUPPORTED_COMPILERS).toEqual(["pdflatex", "xelatex", "lualatex", "latex"]);

    for (const engine of SUPPORTED_COMPILERS) {
      expect(isSupportedCompiler(engine)).toBe(true);
      const profile = getTeXProfile(engine);
      expect(profile.compiler).toBe(engine);
      expect(profile.outputExtension).toBe("pdf");
    }

    expect(isSupportedCompiler("groff")).toBe(false);
    expect(isSupportedCompiler("context")).toBe(false);
    expect(() => getTeXProfile("unknown")).toThrow(UnsupportedTeXProfileError);
  });

  it("produces fixed allowlisted argv for each engine profile with security invariants", () => {
    // pdflatex
    const pdfLatexArgv = resolveProfileArgv("pdflatex", {
      outDir: "/tmp/out",
      mainPath: "/tmp/input/main.tex",
    });
    expect(pdfLatexArgv).toContain("-pdf");
    expect(pdfLatexArgv).toContain("-no-shell-escape");
    expect(pdfLatexArgv).toContain("-interaction=nonstopmode");
    expect(pdfLatexArgv).toContain("-file-line-error");
    expect(pdfLatexArgv).toContain("-synctex=1");
    expect(pdfLatexArgv).toContain("-outdir=/tmp/out");
    expect(pdfLatexArgv[pdfLatexArgv.length - 1]).toBe("/tmp/input/main.tex");

    // xelatex
    const xeLatexArgv = resolveProfileArgv("xelatex", {
      outDir: "/tmp/out",
      mainPath: "/tmp/input/main.tex",
    });
    expect(xeLatexArgv).toContain("-xelatex");
    expect(xeLatexArgv).toContain("-no-shell-escape");

    // lualatex
    const luaLatexArgv = resolveProfileArgv("lualatex", {
      outDir: "/tmp/out",
      mainPath: "/tmp/input/main.tex",
    });
    expect(luaLatexArgv).toContain("-lualatex");
    expect(luaLatexArgv).toContain("-no-shell-escape");

    // latex (dvi route)
    const dviArgv = resolveProfileArgv("latex", {
      outDir: "/tmp/out",
      mainPath: "/tmp/input/main.tex",
    });
    expect(dviArgv).toContain("-pdfdvi");
    expect(dviArgv).toContain("-no-shell-escape");
  });

  it("honors synctex disabled flag", () => {
    const argv = resolveProfileArgv("pdflatex", {
      outDir: "/tmp/out",
      mainPath: "/tmp/input/main.tex",
      synctex: false,
    });
    expect(argv).toContain("-synctex=0");
    expect(argv).not.toContain("-synctex=1");
  });

  it("rejects malicious shell metacharacters in paths (UnsafeArgvError)", () => {
    expect(() =>
      resolveProfileArgv("pdflatex", {
        outDir: "/tmp/out; rm -rf /",
        mainPath: "/tmp/input/main.tex",
      }),
    ).toThrow(UnsafeArgvError);

    expect(() =>
      resolveProfileArgv("xelatex", {
        outDir: "/tmp/out",
        mainPath: "/tmp/input/main.tex | cat /etc/passwd",
      }),
    ).toThrow(UnsafeArgvError);

    expect(() =>
      resolveProfileArgv("lualatex", {
        outDir: "/tmp/out",
        mainPath: "/tmp/input/`touch /tmp/pwned`.tex",
      }),
    ).toThrow(UnsafeArgvError);
  });

  it("compiles each profile fixture with TrustedWorkerExecutor", async () => {
    for (const fixture of PROFILE_FIXTURES) {
      let executedArgs: string[] = [];
      const executor = new TrustedWorkerExecutor({
        runner: async (_cmd, args, options) => {
          executedArgs = [...args];
          const outDir =
            args.find((a) => a.startsWith("-outdir="))?.slice(8) ?? join(options.cwd, "../out");
          await writeFile(join(outDir, "main.pdf"), genuinePdf);
          await writeFile(
            join(outDir, "main.log"),
            `This is ${fixture.expectedBannerKeyword}, Version 3.14159265\nOutput written on main.pdf (1 page, 1000 bytes).`,
          );
          return { exitCode: 0, stdout: "Latexmk: All targets are up to date", stderr: "" };
        },
      });

      const input: ExecuteInput = {
        jobId: `00000000-0000-0000-0000-${fixture.compiler.padStart(12, "0")}`,
        manifest: {
          version: 1,
          projectId: "00000000-0000-0000-0000-000000000002",
          revisionId: "00000000-0000-0000-0000-000000000003",
          revisionNo: 1,
          mainFileId: "main-node",
          compiler: fixture.compiler,
          texliveImageDigest: "texlive:latest",
          items: [
            {
              nodeId: "main-node",
              path: "main.tex",
              kind: "TEXT",
              object: {
                key: "main-key",
                sha256: "hash",
                sizeBytes: fixture.source.length,
                mime: "text/x-tex",
              },
            },
          ],
        },
        compiler: fixture.compiler,
        imageDigest: "texlive:latest",
        policyVersion: "1.0.0",
        limits: {
          timeoutSeconds: 60,
          memoryMiB: 512,
          cpuCores: 1,
          maxOutputBytes: 25 * 1024 * 1024,
        },
      };

      const result = await executor.execute(input, new AbortController().signal);
      expect(result.status).toBe("succeeded");
      expect(result.exitCode).toBe(0);
      expect(result.artifacts.some((a) => a.name === "output.pdf")).toBe(true);

      const profile = getTeXProfile(fixture.compiler);
      expect(executedArgs).toContain(profile.latexmkEngineFlag);
      expect(executedArgs).toContain("-no-shell-escape");
    }
  });
});
