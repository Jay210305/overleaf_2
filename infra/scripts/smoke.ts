import { loadEnvFile } from "node:process";
import { healthSchema } from "@latex-collab/contracts";
loadEnvFile(".env");
const response = await fetch(`${process.env.VITE_API_URL}/health/ready`, {
  signal: AbortSignal.timeout(5000),
});
if (!response.ok || healthSchema.parse(await response.json()).status !== "ready")
  throw new Error("API is not ready");
const page = await fetch(process.env.APP_ORIGIN!, { signal: AbortSignal.timeout(5000) });
if (!page.ok || !(await page.text()).includes('<div id="root">'))
  throw new Error("Browser shell is unavailable");
console.log("Browser entry and real API readiness smoke passed.");
