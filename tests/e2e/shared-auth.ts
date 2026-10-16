import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Shared authenticated-session artifacts for e2e specs (see auth.setup.ts). */
export const AUTH_STATE_PATH = resolve(import.meta.dirname, ".auth/state.json");
export const CSRF_PATH = resolve(import.meta.dirname, ".auth/csrf.json");
export const SHARED_EMAIL = "e2e-shared@example.test";
export const SHARED_PASSWORD = "correct-password-123";

export function readSharedCsrf(): { csrf: string; userId: string } {
  return JSON.parse(readFileSync(CSRF_PATH, "utf8")) as { csrf: string; userId: string };
}
