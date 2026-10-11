import { z } from "zod";
const httpUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "HTTP(S) URL required");
export const publicConfigSchema = z.strictObject({
  VITE_API_URL: httpUrl,
  VITE_APP_NAME: z.string().min(1).default("LaTeX Workspace"),
});
export function parsePublicConfig(env: Record<string, unknown>) {
  const allowed = new Set(["VITE_API_URL", "VITE_APP_NAME", "VITE_USER_NODE_ENV"]);
  if (Object.keys(env).some((key) => key.startsWith("VITE_") && !allowed.has(key)))
    throw new Error("Unapproved browser environment variable");
  return publicConfigSchema.parse({
    VITE_API_URL: env.VITE_API_URL,
    VITE_APP_NAME: env.VITE_APP_NAME,
  });
}
