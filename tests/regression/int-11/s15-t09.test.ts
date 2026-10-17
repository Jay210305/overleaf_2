import { describe, expect, it } from "vitest";
import { getAdminQuotas, getAdminFlags } from "../../../apps/api/src/modules/admin/routes.js";

describe("INT-11 S15-T09: Explicit admin permissions and system quotas regression", () => {
  it("provides structured quotas and feature flags under admin governance", () => {
    const quotas = getAdminQuotas();
    expect(quotas.maxConcurrentCompilationsPerProject).toBeGreaterThan(0);
    expect(quotas.maxProjectSizeBytes).toBeGreaterThan(0);
    expect(quotas.maxDailyCompilationsPerUser).toBeGreaterThan(0);

    const flags = getAdminFlags();
    expect(flags.gitBridgeEnabled).toBe(true);
    expect(flags.templatesGalleryEnabled).toBe(true);
  });
});
