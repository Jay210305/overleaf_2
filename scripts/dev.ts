import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
loadEnvFile(".env");
const require = createRequire(import.meta.url);
const vite = join(dirname(require.resolve("vite/package.json")), "bin/vite.js");
const publicKeys = new Set([
  "path",
  "home",
  "tmpdir",
  "temp",
  "tmp",
  "systemroot",
  "node_env",
  "no_color",
  "force_color",
  "term",
]);
const webEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => key.startsWith("VITE_") || publicKeys.has(key.toLowerCase()),
  ),
);
const children = [
  spawn(process.execPath, ["--import", "tsx", "apps/api/src/main.ts"], {
    stdio: "inherit",
    env: process.env,
  }),
  spawn(process.execPath, [vite, "--host", "127.0.0.1"], {
    cwd: "apps/web",
    stdio: "inherit",
    env: webEnv,
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
}
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => stop(code ?? 1));
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
