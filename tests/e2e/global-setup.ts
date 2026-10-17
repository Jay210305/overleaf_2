import { loadEnvFile } from "node:process";
import { parseServerConfig } from "@latex-collab/config/server";
import { flushAuthRateLimits } from "./rate-limit-flush.js";

loadEnvFile(".env");

/**
 * Playwright global setup: keep the Redis-backed auth rate-limit window clear
 * while the local/CI browser journeys run. See rate-limit-flush.ts for why the
 * production limits are left unchanged.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const { REDIS_URL } = parseServerConfig(process.env);
  const flush = () => flushAuthRateLimits(REDIS_URL).catch(() => 0);
  await flush();
  const timer = setInterval(() => void flush(), 15_000);
  timer.unref();
  return async () => {
    clearInterval(timer);
  };
}
