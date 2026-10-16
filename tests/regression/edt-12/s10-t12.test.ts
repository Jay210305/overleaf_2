import { describe, it, expect, vi } from "vitest";
import { AutoCompileController } from "../../../apps/web/src/features/compilation/auto-compile.js";

describe("Regression EDT-12: Engine selection, root file, and server policy bounded timeout", () => {
  it("enforces bounded timeout per server policy (cannot exceed 60000ms)", () => {
    const controller = new AutoCompileController(
      {
        maxTimeoutMs: 120000, // Client tries to request 120s
      },
      vi.fn(),
    );

    expect(controller.getConfig().maxTimeoutMs).toBe(60000); // Clamped to 60s
  });

  it("clamps debounce window to safe boundary limits (500ms to 10000ms)", () => {
    const tooFast = new AutoCompileController({ debounceMs: 50 }, vi.fn());
    expect(tooFast.getConfig().debounceMs).toBe(500);

    const tooSlow = new AutoCompileController({ debounceMs: 999999 }, vi.fn());
    expect(tooSlow.getConfig().debounceMs).toBe(10000);
  });

  it("supports engine and root file configuration updates", () => {
    const controller = new AutoCompileController(
      {
        compiler: "pdflatex",
        rootFile: "main.tex",
      },
      vi.fn(),
    );

    controller.updateConfig({
      compiler: "lualatex",
      rootFile: "thesis.tex",
    });

    expect(controller.getConfig().compiler).toBe("lualatex");
    expect(controller.getConfig().rootFile).toBe("thesis.tex");
  });

  it("does not compile if auto-compile is toggled off", () => {
    vi.useFakeTimers();
    const triggerCompile = vi.fn();
    const controller = new AutoCompileController({ enabled: false }, triggerCompile);

    controller.notifyEdit(1);
    vi.advanceTimersByTime(5000);

    expect(triggerCompile).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
