import { describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  TrustedWorkerExecutor,
  compilationJobName,
  selectRootDocument,
} from "../../apps/jobs/src/compilation/trusted-worker-executor.js";
import type { ExecuteInput, RevisionManifest } from "@latex-collab/contracts";

describe("Compiler fixtures execution and validation", () => {
  const multiFileManifest: RevisionManifest = {
    version: 1,
    projectId: "00000000-0000-0000-0000-000000000002",
    revisionId: "00000000-0000-0000-0000-000000000009",
    revisionNo: 4,
    mainFileId: "root-node",
    compiler: "pdflatex",
    texliveImageDigest: "texlive:latest",
    items: [
      {
        nodeId: "root-node",
        path: "tesis.tex",
        kind: "TEXT",
        object: { key: "root-key", sha256: "hash-root", sizeBytes: 10, mime: "application/x-tex" },
      },
      {
        nodeId: "chapter-node",
        path: "chapters/capitulo_1.tex",
        kind: "TEXT",
        object: {
          key: "chapter-key",
          sha256: "hash-chapter",
          sizeBytes: 10,
          mime: "application/x-tex",
        },
      },
    ],
  };

  it("compiles the configured root document and keeps included files next to it", async () => {
    let capturedArgs: string[] = [];
    let chapterContents = "";
    const executor = new TrustedWorkerExecutor({
      runner: async (_cmd, args, options) => {
        capturedArgs = args;
        chapterContents = await readFile(join(options.cwd, "chapters", "capitulo_1.tex"), "utf8");
        const outDir = args.find((a) => a.startsWith("-outdir="))?.slice(8) ?? "";
        // latexmk names outputs after the root document, not "main".
        await writeFile(join(outDir, "tesis.pdf"), "%PDF-1.5\n%%EOF");
        await writeFile(join(outDir, "tesis.log"), "Output written on tesis.pdf (3 pages).");
        return { exitCode: 0, stdout: "Latexmk: All targets are up to date", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "00000000-0000-0000-0000-000000000010",
      manifest: multiFileManifest,
      compiler: "pdflatex",
      imageDigest: "texlive:latest",
      policyVersion: "1.0.0",
      limits: { timeoutSeconds: 60, memoryMiB: 512, cpuCores: 1, maxOutputBytes: 25 * 1024 * 1024 },
    };

    const output = await executor.execute(input, new AbortController().signal);

    expect(capturedArgs.at(-1)).toBe("tesis.tex");
    expect(capturedArgs).toContain("-no-shell-escape");
    expect(chapterContents.length).toBeGreaterThan(0);
    expect(output.status).toBe("succeeded");
    expect(output.artifacts.some((a) => a.name === "output.pdf")).toBe(true);
    expect(output.artifacts.some((a) => a.name === "compile.log")).toBe(true);
  });

  it("resolves the root document when no main.tex exists", () => {
    expect(selectRootDocument(multiFileManifest)?.path).toBe("tesis.tex");
    expect(
      selectRootDocument({
        ...multiFileManifest,
        mainFileId: "",
        items: multiFileManifest.items.map((item) => ({ ...item, nodeId: `${item.nodeId}-x` })),
      })?.path,
    ).toBe("tesis.tex");
    expect(compilationJobName("tesis.tex")).toBe("tesis");
    expect(compilationJobName("chapters/main.tex")).toBe("main");
  });

  const genuinePdfHeader = "%PDF-1.5\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF";

  it("compiles standard article document into genuine PDF", async () => {
    const executor = new TrustedWorkerExecutor({
      runner: async (_cmd, args, options) => {
        const outDir =
          args.find((a) => a.startsWith("-outdir="))?.slice(8) ?? join(options.cwd, "../out");
        await writeFile(join(outDir, "main.pdf"), genuinePdfHeader);
        await writeFile(
          join(outDir, "main.log"),
          "Output written on main.pdf (1 page, 1234 bytes).",
        );
        return { exitCode: 0, stdout: "Latexmk: All targets are up to date", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "00000000-0000-0000-0000-000000000001",
      manifest: {
        version: 1,
        projectId: "00000000-0000-0000-0000-000000000002",
        revisionId: "00000000-0000-0000-0000-000000000003",
        revisionNo: 1,
        mainFileId: "main-node",
        compiler: "pdflatex",
        texliveImageDigest: "texlive:latest",
        items: [
          {
            nodeId: "main-node",
            path: "main.tex",
            kind: "TEXT",
            object: { key: "main-key", sha256: "hash1", sizeBytes: 10, mime: "text/x-tex" },
          },
        ],
      },
      compiler: "pdflatex",
      imageDigest: "texlive:latest",
      policyVersion: "1.0.0",
      limits: { timeoutSeconds: 60, memoryMiB: 512, cpuCores: 1, maxOutputBytes: 25 * 1024 * 1024 },
    };

    const output = await executor.execute(input, new AbortController().signal);
    expect(output.status).toBe("succeeded");
    expect(output.exitCode).toBe(0);
    const pdfArtifact = output.artifacts.find((a) => a.name === "output.pdf");
    expect(pdfArtifact).toBeDefined();
    expect(pdfArtifact?.bytes[0]).toBe(0x25); // %
    expect(pdfArtifact?.bytes[1]).toBe(0x50); // P
    expect(pdfArtifact?.bytes[2]).toBe(0x44); // D
    expect(pdfArtifact?.bytes[3]).toBe(0x46); // F
  });

  it("compiles article with cross-references and extracts warning diagnostics if unresolved", async () => {
    const executor = new TrustedWorkerExecutor({
      runner: async (_cmd, args, options) => {
        const outDir =
          args.find((a) => a.startsWith("-outdir="))?.slice(8) ?? join(options.cwd, "../out");
        await writeFile(join(outDir, "main.pdf"), genuinePdfHeader);
        await writeFile(
          join(outDir, "main.log"),
          "LaTeX Warning: Reference `sec:intro' on page 1 undefined on input line 15.\nOutput written on main.pdf.",
        );
        return { exitCode: 0, stdout: "Latexmk: Log file shows unresolved references", stderr: "" };
      },
    });

    const input: ExecuteInput = {
      jobId: "00000000-0000-0000-0000-000000000004",
      manifest: {
        version: 1,
        projectId: "00000000-0000-0000-0000-000000000002",
        revisionId: "00000000-0000-0000-0000-000000000005",
        revisionNo: 2,
        mainFileId: "main-node",
        compiler: "pdflatex",
        texliveImageDigest: "texlive:latest",
        items: [
          {
            nodeId: "main-node",
            path: "main.tex",
            kind: "TEXT",
            object: { key: "main-key-2", sha256: "hash2", sizeBytes: 10, mime: "text/x-tex" },
          },
        ],
      },
      compiler: "pdflatex",
      imageDigest: "texlive:latest",
      policyVersion: "1.0.0",
      limits: { timeoutSeconds: 60, memoryMiB: 512, cpuCores: 1, maxOutputBytes: 25 * 1024 * 1024 },
    };

    const output = await executor.execute(input, new AbortController().signal);
    expect(output.status).toBe("succeeded");
    expect(output.artifacts.some((a) => a.name === "output.pdf")).toBe(true);
    expect(output.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(output.diagnostics[0]?.severity).toBe("warning");
    expect(output.diagnostics[0]?.message).toContain("sec:intro");
  });

  it("fails on syntax error fixture, returns parsed diagnostics, and produces no PDF", async () => {
    const executor = new TrustedWorkerExecutor({
      runner: async (_cmd, args, options) => {
        const outDir =
          args.find((a) => a.startsWith("-outdir="))?.slice(8) ?? join(options.cwd, "../out");
        await writeFile(
          join(outDir, "main.log"),
          "main.tex:12: Undefined control sequence.\nl.12 \\badcommand\n!  ==> Fatal error occurred, no output PDF file produced!",
        );
        return { exitCode: 1, stdout: "", stderr: "Fatal error in LaTeX processing" };
      },
    });

    const input: ExecuteInput = {
      jobId: "00000000-0000-0000-0000-000000000006",
      manifest: {
        version: 1,
        projectId: "00000000-0000-0000-0000-000000000002",
        revisionId: "00000000-0000-0000-0000-000000000007",
        revisionNo: 3,
        mainFileId: "main-node",
        compiler: "pdflatex",
        texliveImageDigest: "texlive:latest",
        items: [
          {
            nodeId: "main-node",
            path: "main.tex",
            kind: "TEXT",
            object: { key: "main-key-3", sha256: "hash3", sizeBytes: 10, mime: "text/x-tex" },
          },
        ],
      },
      compiler: "pdflatex",
      imageDigest: "texlive:latest",
      policyVersion: "1.0.0",
      limits: { timeoutSeconds: 60, memoryMiB: 512, cpuCores: 1, maxOutputBytes: 25 * 1024 * 1024 },
    };

    const output = await executor.execute(input, new AbortController().signal);
    expect(output.status).toBe("failed");
    expect(output.exitCode).toBe(1);
    expect(output.artifacts.some((a) => a.name === "output.pdf")).toBe(false);
    expect(output.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(output.diagnostics[0]?.severity).toBe("error");
    expect(output.diagnostics[0]?.line).toBe(12);
  });
});
