import { loadEnvFile } from "node:process";
import { spawnSync } from "node:child_process";
loadEnvFile(".env");
const r = spawnSync(process.execPath, ["--import", "tsx", "apps/api/src/init-storage.ts"], {
  stdio: "inherit",
  env: process.env,
});
process.exitCode = r.status ?? 1;
