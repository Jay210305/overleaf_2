export interface AutoCompileConfig {
  enabled: boolean;
  debounceMs: number;
  maxTimeoutMs: number;
  compiler: "pdflatex" | "xelatex" | "lualatex" | "latex";
  rootFile?: string | undefined;
}

export const DEFAULT_AUTO_COMPILE_CONFIG: AutoCompileConfig = {
  enabled: true,
  debounceMs: 1500,
  maxTimeoutMs: 60000,
  compiler: "pdflatex",
  rootFile: "main.tex",
};

export type CompileTriggerCallback = (params: {
  compiler: "pdflatex" | "xelatex" | "lualatex" | "latex";
  rootFile?: string | undefined;
  revision?: number | undefined;
}) => Promise<void> | void;

/**
 * Client-side debounce and successor coordinator for automatic compilation (CMP-08, EDT-12).
 * Guarantees:
 * 1. Keystrokes reset the debounce timer without killing active server compiles.
 * 2. When a compilation is already in flight, edits flag at most ONE queued successor.
 * 3. Enforces bounded server timeouts according to system policy (max 60s).
 */
export class AutoCompileController {
  private config: AutoCompileConfig;
  private onTriggerCompile: CompileTriggerCallback;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private isCompilingState = false;
  private hasPendingSuccessorState = false;
  private pendingRevision?: number | undefined;

  constructor(
    config: Partial<AutoCompileConfig> = {},
    onTriggerCompile: CompileTriggerCallback,
  ) {
    this.config = {
      ...DEFAULT_AUTO_COMPILE_CONFIG,
      ...config,
      // Clamp debounce between 500ms and 10000ms
      debounceMs: Math.max(500, Math.min(10000, config.debounceMs ?? DEFAULT_AUTO_COMPILE_CONFIG.debounceMs)),
      // Max timeout bounded by server policy (max 60s)
      maxTimeoutMs: Math.min(60000, config.maxTimeoutMs ?? DEFAULT_AUTO_COMPILE_CONFIG.maxTimeoutMs),
    };
    this.onTriggerCompile = onTriggerCompile;
  }

  public getConfig(): Readonly<AutoCompileConfig> {
    return this.config;
  }

  public updateConfig(updates: Partial<AutoCompileConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      debounceMs: updates.debounceMs !== undefined
        ? Math.max(500, Math.min(10000, updates.debounceMs))
        : this.config.debounceMs,
      maxTimeoutMs: updates.maxTimeoutMs !== undefined
        ? Math.min(60000, updates.maxTimeoutMs)
        : this.config.maxTimeoutMs,
    };
  }

  public isCompiling(): boolean {
    return this.isCompilingState;
  }

  public hasPendingSuccessor(): boolean {
    return this.hasPendingSuccessorState;
  }

  /**
   * Called on every editor change / keystroke.
   */
  public notifyEdit(revision?: number): void {
    if (!this.config.enabled) {
      return;
    }

    if (revision !== undefined) {
      this.pendingRevision = revision;
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.handleDebounceFired();
    }, this.config.debounceMs);
  }

  private handleDebounceFired(): void {
    if (this.isCompilingState) {
      // Job in flight: mark single successor pending without interrupting active compile
      this.hasPendingSuccessorState = true;
      return;
    }

    this.triggerExecution();
  }

  private triggerExecution(): void {
    this.isCompilingState = true;
    this.hasPendingSuccessorState = false;
    const rev = this.pendingRevision;

    try {
      const promise = this.onTriggerCompile({
        compiler: this.config.compiler,
        rootFile: this.config.rootFile,
        revision: rev,
      });

      if (promise && typeof promise.then === "function") {
        promise
          .then(() => this.onCompileFinished())
          .catch(() => this.onCompileFinished());
      }
    } catch {
      this.onCompileFinished();
    }
  }

  /**
   * Called when active compilation finishes.
   */
  public onCompileFinished(): void {
    this.isCompilingState = false;

    if (this.hasPendingSuccessorState && this.config.enabled) {
      this.hasPendingSuccessorState = false;
      // Immediately launch successor
      this.triggerExecution();
    }
  }

  /**
   * Manually trigger compile immediately (e.g. via Mod-Enter).
   */
  public triggerImmediate(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.isCompilingState) {
      this.hasPendingSuccessorState = true;
      return;
    }

    this.triggerExecution();
  }

  public cancel(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.hasPendingSuccessorState = false;
  }

  public dispose(): void {
    this.cancel();
  }
}
