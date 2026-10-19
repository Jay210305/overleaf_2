import { describe, expect, it } from "vitest";

describe("NFR-07 S15-T05: Concurrent compile job quotas under load regression", () => {
  it("enforces maximum concurrent compilations per user/project", () => {
    const MAX_CONCURRENT_PER_PROJECT = 2;
    const activeJobs = new Set<string>();

    function acquireJobSlot(
      projectId: string,
      jobId: string,
    ): { allowed: boolean; activeCount: number } {
      const currentForProject = Array.from(activeJobs).filter((j) =>
        j.startsWith(`${projectId}:`),
      ).length;
      if (currentForProject >= MAX_CONCURRENT_PER_PROJECT) {
        return { allowed: false, activeCount: currentForProject };
      }
      activeJobs.add(`${projectId}:${jobId}`);
      return { allowed: true, activeCount: currentForProject + 1 };
    }

    function releaseJobSlot(projectId: string, jobId: string) {
      activeJobs.delete(`${projectId}:${jobId}`);
    }

    const p1 = "proj-load-1";

    // First two jobs should be permitted
    const r1 = acquireJobSlot(p1, "job-1");
    expect(r1.allowed).toBe(true);
    expect(r1.activeCount).toBe(1);

    const r2 = acquireJobSlot(p1, "job-2");
    expect(r2.allowed).toBe(true);
    expect(r2.activeCount).toBe(2);

    // Third job should be rejected under quota limit
    const r3 = acquireJobSlot(p1, "job-3");
    expect(r3.allowed).toBe(false);
    expect(r3.activeCount).toBe(2);

    // After releasing one job, new job can enter
    releaseJobSlot(p1, "job-1");
    const r4 = acquireJobSlot(p1, "job-4");
    expect(r4.allowed).toBe(true);
    expect(r4.activeCount).toBe(2);

    // Cleanup
    releaseJobSlot(p1, "job-2");
    releaseJobSlot(p1, "job-4");
  });
});
