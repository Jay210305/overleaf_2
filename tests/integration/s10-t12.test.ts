import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutoCompileController } from "../../apps/web/src/features/compilation/auto-compile.js";
import { InMemoryJobCoalescer } from "../../apps/jobs/src/compilation/coalesce.js";

describe("S10-T12: Debounced Automatic Compilation and Queue Coalescing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("debounces rapid keystrokes into a single compilation call", () => {
    const triggerCompile = vi.fn();
    const controller = new AutoCompileController({ debounceMs: 1000 }, triggerCompile);

    // Rapid keystrokes
    controller.notifyEdit(1);
    vi.advanceTimersByTime(200);
    controller.notifyEdit(2);
    vi.advanceTimersByTime(200);
    controller.notifyEdit(3);

    expect(triggerCompile).not.toHaveBeenCalled();

    // Advance beyond debounce window
    vi.advanceTimersByTime(1100);
    expect(triggerCompile).toHaveBeenCalledTimes(1);
    expect(triggerCompile).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }));
  });

  it("does not interrupt actively compiling jobs when new edits arrive", () => {
    let completeCompile: () => void = () => {};
    const triggerCompile = vi.fn().mockImplementation(() => {
      return new Promise<void>((resolve) => {
        completeCompile = resolve;
      });
    });

    const controller = new AutoCompileController({ debounceMs: 1000 }, triggerCompile);

    // Initial edit triggers compilation
    controller.notifyEdit(1);
    vi.advanceTimersByTime(1000);
    expect(triggerCompile).toHaveBeenCalledTimes(1);
    expect(controller.isCompiling()).toBe(true);

    // Keystrokes arrive WHILE compile is in flight
    controller.notifyEdit(2);
    vi.advanceTimersByTime(1000);
    // Active job is NOT killed or called again yet
    expect(triggerCompile).toHaveBeenCalledTimes(1);
    expect(controller.hasPendingSuccessor()).toBe(true);

    // More keystrokes arrive: still at most ONE successor flagged
    controller.notifyEdit(3);
    vi.advanceTimersByTime(1000);
    expect(triggerCompile).toHaveBeenCalledTimes(1);

    // Active compile finishes
    completeCompile();
    controller.onCompileFinished();

    // Successor is immediately triggered with latest revision
    expect(triggerCompile).toHaveBeenCalledTimes(2);
    expect(triggerCompile).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 3 }));
  });

  it("server coalescer holds at most one queued successor behind running job (CMP-08)", () => {
    const coalescer = new InMemoryJobCoalescer();
    const projectId = "proj-123";

    // 1. Initial job enqueued
    const res1 = coalescer.enqueueOrCoalesce({
      projectId,
      revision: 10,
      engine: "pdflatex",
      requestedBy: "user-1",
    });
    expect(res1.action).toBe("created");
    expect(coalescer.getActiveJobs(projectId)).toHaveLength(1);

    // Worker picks up job and starts running
    coalescer.updateJobStatus(res1.jobId, "running");

    // 2. Keystroke arrives while running: queued successor created
    const res2 = coalescer.enqueueOrCoalesce({
      projectId,
      revision: 11,
      engine: "pdflatex",
      requestedBy: "user-1",
    });
    expect(res2.action).toBe("created");
    expect(res2.activeJobId).toBe(res1.jobId);
    expect(coalescer.getActiveJobs(projectId)).toHaveLength(2); // 1 running, 1 queued

    // 3. More keystrokes arrive while running: successor is updated (coalesced), NOT duplicated!
    const res3 = coalescer.enqueueOrCoalesce({
      projectId,
      revision: 12,
      engine: "pdflatex",
      requestedBy: "user-1",
    });
    expect(res3.action).toBe("coalesced_successor");
    expect(res3.jobId).toBe(res2.jobId);
    expect(coalescer.getActiveJobs(projectId)).toHaveLength(2); // Still exactly 1 running, 1 queued

    // Check target revision of queued successor
    const queued = coalescer.getJob(res2.jobId);
    expect(queued?.revision).toBe(12);

    // Verify running job was never cancelled
    const running = coalescer.getJob(res1.jobId);
    expect(running?.status).toBe("running");
  });
});
