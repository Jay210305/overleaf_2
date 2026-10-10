import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:3000/api/v1"),
    "import.meta.env.VITE_APP_NAME": JSON.stringify("LaTeX Workspace"),
  },
  resolve: {
    alias: [
      {
        find: "@latex-collab/config/server",
        replacement: fileURLToPath(new URL("./packages/config/src/server.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/config",
        replacement: fileURLToPath(new URL("./packages/config/src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    maxWorkers: 2,
    testTimeout: 30000,
    exclude: ["tests/e2e/**", "tests/services/**", "**/node_modules/**", "**/dist/**"],
    coverage: {
      enabled: true,
      provider: "v8",
      include: [
        "apps/api/src/server.ts",
        "apps/api/src/plugins/errors.ts",
        "packages/config/src/*.ts",
      ],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
