import { describe, it, expect } from "vitest";
import { InMemoryJobCoalescer } from "../../../apps/jobs/src/compilation/coalesce.js";

describe("Regression CMP-08: Job Coalescing without Interrupting Persisted Work", () => {
  it("does not blindly kill running jobs when new compilation requests arrive", () => {
    const coalescer = new InMemoryJobCoalescer();
    const projectId = "proj-cmp-08";

    // Start job 1
    const job1 = coalescer.enqueueOrCoalesce({
      projectId,
      revision: 1,
      engine: "xelatex",
      requestedBy: "user-cmp-08",
    });
    coalescer.updateJobStatus(job1.jobId, "running");

    // Multiple rapid requests simulate typing bursts
    for (let i = 2; i <= 20; i++) {
      coalescer.enqueueOrCoalesce({
        projectId,
        revision: i,
        engine: "xelatex",
        requestedBy: "user-cmp-08",
      });
    }

    // Active job must still be running
    const running = coalescer.getJob(job1.jobId);
    expect(running?.status).toBe("running");

    // Total active jobs must not exceed 2 (1 running + 1 queued successor)
    const active = coalescer.getActiveJobs(projectId);
    expect(active).toHaveLength(2);

    const queued = active.find((j) => j.status === "queued");
    expect(queued).toBeDefined();
    expect(queued?.revision).toBe(20);
  });
});
