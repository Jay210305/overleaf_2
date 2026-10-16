import type { CompilationLimits, ExecuteInput, ExecuteOutput } from "@latex-collab/contracts";

export const DEFAULT_COMPILATION_LIMITS: Readonly<CompilationLimits> = {
  timeoutSeconds: 60,
  memoryMiB: 512,
  cpuCores: 1,
  maxOutputBytes: 25 * 1024 * 1024,
};

export class ExecutionTimeoutError extends Error {
  readonly code = "TIMEOUT" as const;
  readonly status = 504 as const;

  constructor(message = "Compilation timed out after 60 seconds") {
    super(message);
    this.name = "ExecutionTimeoutError";
  }
}

export class OutputLimitExceededError extends Error {
  readonly code = "OUTPUT_LIMIT_EXCEEDED" as const;
  readonly status = 413 as const;

  constructor(message = "Compilation output exceeded maximum allowed size (25 MiB)") {
    super(message);
    this.name = "OutputLimitExceededError";
  }
}

/**
 * Validates and clamps compilation limits against server policy (S06-T05, CMP-04, NFR-07).
 * API policy never honors client-supplied arbitrary timeouts or unbounded memory.
 */
export function resolveCompilationLimits(
  requested?: Partial<CompilationLimits> | undefined,
): CompilationLimits {
  return {
    timeoutSeconds: Math.min(
      Math.max(1, requested?.timeoutSeconds ?? DEFAULT_COMPILATION_LIMITS.timeoutSeconds),
      DEFAULT_COMPILATION_LIMITS.timeoutSeconds,
    ),
    memoryMiB: Math.min(
      Math.max(64, requested?.memoryMiB ?? DEFAULT_COMPILATION_LIMITS.memoryMiB),
      DEFAULT_COMPILATION_LIMITS.memoryMiB,
    ),
    cpuCores: Math.min(
      Math.max(1, requested?.cpuCores ?? DEFAULT_COMPILATION_LIMITS.cpuCores),
      DEFAULT_COMPILATION_LIMITS.cpuCores,
    ),
    maxOutputBytes: Math.min(
      Math.max(1024, requested?.maxOutputBytes ?? DEFAULT_COMPILATION_LIMITS.maxOutputBytes),
      DEFAULT_COMPILATION_LIMITS.maxOutputBytes,
    ),
  };
}

/**
 * Enforces execution boundaries and resource limits on a compilation run.
 */
export async function executeWithLimits(
  input: ExecuteInput,
  runFn: (signal: AbortSignal, limits: CompilationLimits) => Promise<ExecuteOutput>,
  parentSignal?: AbortSignal,
): Promise<ExecuteOutput> {
  const limits = resolveCompilationLimits(input.limits);
  const timeoutController = new AbortController();

  if (parentSignal?.aborted) {
    return {
      status: "cancelled",
      exitCode: null,
      diagnostics: [],
      artifacts: [],
    };
  }

  const timeoutTimer = setTimeout(() => {
    timeoutController.abort("TIMEOUT");
  }, limits.timeoutSeconds * 1000);
  timeoutTimer.unref?.();

  const handleParentAbort = () => timeoutController.abort("CANCELLED");
  parentSignal?.addEventListener("abort", handleParentAbort, { once: true });

  try {
    const output = await runFn(timeoutController.signal, limits);

    if (timeoutController.signal.aborted) {
      if (parentSignal?.aborted) {
        return {
          status: "cancelled",
          exitCode: null,
          diagnostics: [],
          artifacts: [],
        };
      }
      return {
        status: "timed_out",
        exitCode: 124,
        diagnostics: [
          {
            severity: "error",
            message: `Compilation exceeded execution timeout of ${limits.timeoutSeconds}s`,
          },
        ],
        artifacts: [],
      };
    }

    // Enforce total output artifact size cap (25 MiB)
    const totalBytes = output.artifacts.reduce((sum, a) => sum + a.bytes.length, 0);
    if (totalBytes > limits.maxOutputBytes) {
      throw new OutputLimitExceededError();
    }

    return output;
  } catch (err: unknown) {
    if (timeoutController.signal.aborted) {
      if (parentSignal?.aborted) {
        return {
          status: "cancelled",
          exitCode: null,
          diagnostics: [],
          artifacts: [],
        };
      }
      return {
        status: "timed_out",
        exitCode: 124,
        diagnostics: [
          {
            severity: "error",
            message: `Compilation exceeded execution timeout of ${limits.timeoutSeconds}s`,
          },
        ],
        artifacts: [],
      };
    }

    if (err instanceof OutputLimitExceededError) {
      return {
        status: "failed",
        exitCode: 1,
        diagnostics: [
          {
            severity: "error",
            message: err.message,
          },
        ],
        artifacts: [],
      };
    }

    throw err;
  } finally {
    clearTimeout(timeoutTimer);
    parentSignal?.removeEventListener("abort", handleParentAbort);
  }
}
