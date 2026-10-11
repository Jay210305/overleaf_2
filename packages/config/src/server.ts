import { z } from "zod";
const urlFor = (protocols: string[]) =>
  z.url().refine((value) => protocols.includes(new URL(value).protocol), "Invalid protocol");
const origin = urlFor(["http:", "https:"]).refine(
  (value) => new URL(value).origin === value,
  "Exact origin required",
);
export const serverConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: origin,
  DATABASE_URL: urlFor(["postgres:", "postgresql:"]),
  REDIS_URL: urlFor(["redis:", "rediss:"]),
  S3_ENDPOINT: urlFor(["http:", "https:"]),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(16),
  MAILPIT_URL: urlFor(["http:", "https:"]),
  SMTP_URL: urlFor(["smtp:", "smtps:"]).optional(),
  EMAIL_FROM: z.email().optional(),
  PUBLIC_SIGNUP_ENABLED: z.literal("false").default("false"),
  UNTRUSTED_COMPILE_ENABLED: z.literal("false").default("false"),
  COMPILER_EXECUTION_MODE: z.literal("trusted_worker").default("trusted_worker"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug", "silent"]).default("info"),
});
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export function parseServerConfig(env: Record<string, unknown>): ServerConfig {
  const result = serverConfigSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid configuration fields: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`,
    );
  return result.data;
}
