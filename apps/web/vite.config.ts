import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { parsePublicConfig } from "@latex-collab/config";
import { loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  parsePublicConfig({
    ...loadEnv(mode, "../..", "VITE_"),
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("VITE_"))),
  });
  return {
    plugins: [react()],
    envDir: "../..",
    server: { port: 5173, strictPort: true },
    preview: { port: 5173, strictPort: true },
    build: { sourcemap: false },
  };
});
