import type { Compiler } from "./index.js";
import type { RevisionManifest } from "./storage.js";

export type CompileStatus =
  "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancel_requested" | "cancelled";

export type Diagnostic = {
  severity: "error" | "warning" | "info";
  filePath?: string | undefined;
  line?: number | undefined;
  message: string;
};

export type CompilationLimits = {
  timeoutSeconds: number;
  memoryMiB: number;
  cpuCores: number;
  maxOutputBytes: number;
};

export type ExecuteInput = {
  jobId: string;
  manifest: RevisionManifest;
  compiler: Compiler;
  imageDigest: string;
  policyVersion: string;
  limits: CompilationLimits;
};

export type ExecuteOutputArtifact = {
  name: string;
  mime: string;
  bytes: Uint8Array;
  sha256: string;
};

export type ExecuteOutput = {
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  exitCode: number | null;
  diagnostics: Diagnostic[];
  artifacts: ExecuteOutputArtifact[];
};

export interface CompilerExecutor {
  execute(input: ExecuteInput, signal: AbortSignal): Promise<ExecuteOutput>;
}

export class IsolatedCompilerExecutor implements CompilerExecutor {
  async execute(): Promise<ExecuteOutput> {
    const error = new Error("Public untrusted execution is NOT_IMPLEMENTED (fails closed)");
    (error as Error & { code?: string }).code = "NOT_IMPLEMENTED";
    throw error;
  }
}

export class MockCompilerExecutor implements CompilerExecutor {
  constructor(
    private readonly handler?: (input: ExecuteInput) => Promise<ExecuteOutput> | ExecuteOutput,
  ) {}

  async execute(input: ExecuteInput, signal: AbortSignal): Promise<ExecuteOutput> {
    if (signal.aborted) {
      return {
        status: "cancelled",
        exitCode: null,
        diagnostics: [],
        artifacts: [],
      };
    }
    if (this.handler) {
      return this.handler(input);
    }
    return {
      status: "succeeded",
      exitCode: 0,
      diagnostics: [],
      artifacts: [
        {
          name: "output.pdf",
          mime: "application/pdf",
          bytes: new Uint8Array([37, 80, 68, 70]),
          sha256: "mock-sha256",
        },
      ],
    };
  }
}
