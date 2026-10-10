import { spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";
function redis(action: "stop" | "start") {
  const result = spawnSync(
    "docker",
    ["compose", "--env-file", ".env", "-f", "infra/docker-compose.yml", action, "redis"],
    { encoding: "utf8", timeout: 20000 },
  );
  if (result.status !== 0) throw new Error(`Redis fixture ${action} failed`);
}
test("a real dependency outage leaves live healthy and readiness recovers", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Service ready");
  try {
    redis("stop");
    expect((await page.request.get("http://127.0.0.1:3000/api/v1/health/live")).status()).toBe(200);
    expect((await page.request.get("http://127.0.0.1:3000/api/v1/health/ready")).status()).toBe(
      503,
    );
    await expect(page.getByRole("status")).toContainText("Service unavailable", { timeout: 15000 });
  } finally {
    redis("start");
  }
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.getByRole("status")).toHaveText("Service ready", { timeout: 15000 });
});
