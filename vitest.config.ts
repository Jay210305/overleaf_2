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
      {
        find: "@latex-collab/contracts/storage",
        replacement: fileURLToPath(new URL("./packages/contracts/src/storage.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/contracts",
        replacement: fileURLToPath(new URL("./packages/contracts/src/index.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/db/schema/core",
        replacement: fileURLToPath(new URL("./packages/db/src/schema/core.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/db/schema/collaboration",
        replacement: fileURLToPath(
          new URL("./packages/db/src/schema/collaboration.ts", import.meta.url),
        ),
      },
      {
        find: "@latex-collab/db/schema/integrations",
        replacement: fileURLToPath(
          new URL("./packages/db/src/schema/integrations.ts", import.meta.url),
        ),
      },
      {
        find: "@latex-collab/db/client",
        replacement: fileURLToPath(new URL("./packages/db/src/client.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/db/repositories/projects",
        replacement: fileURLToPath(
          new URL("./packages/db/src/repositories/projects.ts", import.meta.url),
        ),
      },
      {
        find: "@latex-collab/db/seeds/development",
        replacement: fileURLToPath(new URL("./packages/db/seeds/development.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/db",
        replacement: fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/storage/s3",
        replacement: fileURLToPath(new URL("./packages/storage/src/s3.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/storage",
        replacement: fileURLToPath(new URL("./packages/storage/src/index.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/test-utils/factories",
        replacement: fileURLToPath(
          new URL("./packages/test-utils/src/factories.ts", import.meta.url),
        ),
      },
      {
        find: "@latex-collab/test-utils",
        replacement: fileURLToPath(new URL("./packages/test-utils/src/index.ts", import.meta.url)),
      },
      {
        find: "@latex-collab/editor/latex-extension",
        replacement: fileURLToPath(
          new URL("./packages/editor/src/latex-extension.ts", import.meta.url),
        ),
      },
      {
        find: "@latex-collab/editor/keymap",
        replacement: fileURLToPath(
          new URL("./packages/editor/src/keymap.ts", import.meta.url),
        ),
      },
      {
        find: "@latex-collab/editor",
        replacement: fileURLToPath(new URL("./packages/editor/src/index.ts", import.meta.url)),
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
