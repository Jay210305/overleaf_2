import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
loadEnvFile(".env");
const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = ["api", "web"].map((app) =>
  spawn(executable, ["--filter", `@latex-collab/${app}`, "dev"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  }),
);
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
