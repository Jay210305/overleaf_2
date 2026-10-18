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
  CORS_ORIGIN: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
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

export function isOriginAllowed(
  requestOrigin: string | undefined | null,
  allowedOrigins: string | readonly string[] | undefined | null,
): boolean {
  if (!requestOrigin || !allowedOrigins) return false;

  let parsedReq: URL;
  try {
    parsedReq = new URL(requestOrigin);
  } catch {
    return false;
  }

  const reqProtocol = parsedReq.protocol.toLowerCase();
  const reqHost = parsedReq.host.toLowerCase();
  const reqHostname = parsedReq.hostname.toLowerCase();
  const normalizedReqOrigin = `${reqProtocol}//${reqHost}`;

  const patterns = (Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins])
    .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
    .map((s) => s.trim())
    .filter(Boolean);

  for (const rawPattern of patterns) {
    const pattern = rawPattern.trim();
    if (!pattern) continue;

    const normalizedPattern = pattern.replace(/\/+$/, "").toLowerCase();
    if (normalizedReqOrigin === normalizedPattern) {
      return true;
    }

    let expectedProtocol: string | null = null;
    let hostPattern = normalizedPattern;

    if (normalizedPattern.includes("://")) {
      const parts = normalizedPattern.split("://");
      expectedProtocol = `${parts[0]}:`;
      hostPattern = parts[1] ?? "";
    }

    if (expectedProtocol && reqProtocol !== expectedProtocol) {
      continue;
    }

    if (hostPattern.startsWith("*.")) {
      const suffix = hostPattern.slice(1);
      if (reqHostname.endsWith(suffix) && reqHostname.length > suffix.length) {
        return true;
      }
    } else if (hostPattern.endsWith(":*")) {
      const expectedHostname = hostPattern.slice(0, -2);
      if (reqHostname === expectedHostname) {
        return true;
      }
    } else if (hostPattern === "*") {
      return true;
    }
  }

  return false;
}

export function parseAllowedOrigins(appOrigin: string, corsOrigin?: string | undefined): string[] {
  const set = new Set<string>();
  if (appOrigin && appOrigin.trim()) {
    set.add(appOrigin.trim().replace(/\/+$/, ""));
  }
  if (corsOrigin) {
    for (const item of corsOrigin.split(",")) {
      const trimmed = item.trim().replace(/\/+$/, "");
      if (trimmed) {
        set.add(trimmed);
      }
    }
  }
  if (appOrigin.includes("latex-editor") && appOrigin.includes(".pages.dev")) {
    set.add("https://latex-editor.pages.dev");
    set.add("https://latex-editor-do7.pages.dev");
    set.add("https://*.latex-editor.pages.dev");
    set.add("*.pages.dev");
  }
  return Array.from(set);
}
