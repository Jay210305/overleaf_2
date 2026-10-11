import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 30000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    {
      name: "edge",
      use: {
        ...devices["Desktop Edge"],
        ...(process.env.EDGE_EXECUTABLE_PATH
          ? { launchOptions: { executablePath: process.env.EDGE_EXECUTABLE_PATH } }
          : { channel: "msedge" }),
      },
    },
  ],
});
