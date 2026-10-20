import { defineConfig, devices } from "@playwright/test";

// Isolated presentation checks; no database, credentials or TeX executor required.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "editor-layout.spec.ts",
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5178" },
  webServer: {
    command: "pnpm --filter @latex-collab/web dev --port 5178",
    url: "http://127.0.0.1:5178",
    timeout: 30000,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" } },
  ],
});
