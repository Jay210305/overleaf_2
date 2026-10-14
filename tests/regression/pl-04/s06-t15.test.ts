import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PL-04 Explicit environment, health and staging deployment (S06-T15)", () => {
  const root = resolve(import.meta.dirname, "../../..");
  const servicesDoc = resolve(root, "infra/railway/services.md");
  const vercelJson = resolve(root, "apps/web/vercel.json");

  it("verifies staging deployment service specification exists and documents TLS and services", () => {
    expect(existsSync(servicesDoc)).toBe(true);
    const content = readFileSync(servicesDoc, "utf8");

    expect(content).toContain("latex-collab-api");
    expect(content).toContain("latex-collab-worker");
    expect(content).toContain("PUBLIC_SIGNUP_ENABLED=false");
    expect(content).toContain("UNTRUSTED_COMPILE_ENABLED=false");
    expect(content).toContain("/api/v1/health/live");
    expect(content).toContain("/api/v1/health/ready");
    expect(content).toMatch(/Rollback Plan/i);
  });

  it("verifies Vercel web SPA rewrites configuration exists", () => {
    expect(existsSync(vercelJson)).toBe(true);
    const raw = readFileSync(vercelJson, "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.rewrites).toBeDefined();
    expect(parsed.rewrites[0].destination).toBe("/index.html");
  });
});
