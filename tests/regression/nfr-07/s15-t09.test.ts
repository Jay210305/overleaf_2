import { describe, expect, it } from "vitest";
import { getAdminQuotas } from "../../../apps/api/src/modules/admin/routes.js";

describe("NFR-07 S15-T09: Admin concurrency quota bounds regression", () => {
  it("enforces finite bounded compile concurrency quotas", () => {
    const quotas = getAdminQuotas();
    expect(quotas.maxConcurrentCompilationsPerProject).toBeLessThanOrEqual(5);
    expect(quotas.maxDailyCompilationsPerUser).toBeLessThanOrEqual(500);
  });
});
