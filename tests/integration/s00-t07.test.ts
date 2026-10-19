import { describe, it, expect } from "vitest";
import { parseServerConfig } from "@latex-collab/config/server";
import { parsePublicConfig } from "@latex-collab/config";
const input = {
  APP_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://user:private@localhost/db",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "test-bucket",
  S3_ACCESS_KEY_ID: "test-key",
  S3_SECRET_ACCESS_KEY: "test-only-abcdefghijkl",
  MAILPIT_URL: "http://localhost:8025",
};
describe("S00 config trust boundary", () => {
  it("retains the server-only Resend key and redacts invalid configuration", () => {
    expect(parseServerConfig({ ...input, RESEND_API_KEY: "re_test_only" }).RESEND_API_KEY).toBe(
      "re_test_only",
    );
    expect(() => parseServerConfig({ ...input, RESEND_API_KEY: " " })).toThrow(
      "Invalid configuration fields: RESEND_API_KEY",
    );
  });
  it("accepts bounded local settings and closed trust flags", () => {
    expect(parseServerConfig(input)).toMatchObject({
      PORT: 3000,
      PUBLIC_SIGNUP_ENABLED: "false",
      UNTRUSTED_COMPILE_ENABLED: "false",
    });
  });
  it.each(["DATABASE_URL", "REDIS_URL", "S3_SECRET_ACCESS_KEY"])(
    "rejects missing %s without exposing inputs",
    (key) => {
      const env = { ...input, [key]: undefined };
      expect(() => parseServerConfig(env)).toThrow(`Invalid configuration fields: ${key}`);
      try {
        parseServerConfig(env);
      } catch (error) {
        expect(String(error)).not.toContain("private");
      }
    },
  );
  it.each(["PUBLIC_SIGNUP_ENABLED", "UNTRUSTED_COMPILE_ENABLED"])("fails closed for %s", (key) => {
    expect(() => parseServerConfig({ ...input, [key]: "true" })).toThrow();
  });
  it("rejects invalid origins, protocols and port", () => {
    expect(() => parseServerConfig({ ...input, APP_ORIGIN: "http://host/path" })).toThrow();
    expect(() => parseServerConfig({ ...input, DATABASE_URL: "https://host/db" })).toThrow();
    expect(() => parseServerConfig({ ...input, PORT: "0" })).toThrow();
  });
  it("exposes only public URLs and app name", () => {
    expect(
      parsePublicConfig({ VITE_API_URL: "http://localhost:3000/api/v1", DATABASE_URL: "secret" }),
    ).toEqual({ VITE_API_URL: "http://localhost:3000/api/v1", VITE_APP_NAME: "LaTeX Workspace" });
    expect(() =>
      parsePublicConfig({ VITE_API_URL: "http://localhost:3000", VITE_DATABASE_URL: "secret" }),
    ).toThrow();
    expect(() => parsePublicConfig({ VITE_API_URL: "file:///secret" })).toThrow();
  });
  it("derives SMTP_URL and EMAIL_FROM from individual SMTP settings", () => {
    const config = parseServerConfig({
      ...input,
      SMTP_USER: "test-user@example.test",
      SMTP_PASS: "test-password-123",
    });
    expect(config.SMTP_URL).toBe(
      "smtp://test-user%40example.test:test-password-123@smtp.gmail.com:587",
    );
    expect(config.EMAIL_FROM).toBe("test-user@example.test");
  });
  it("derives smtps protocol when port 465 is specified", () => {
    const config = parseServerConfig({
      ...input,
      SMTP_USER: "test-user@example.test",
      SMTP_PASS: "test-password-123",
      SMTP_PORT: 465,
    });
    expect(config.SMTP_URL).toBe(
      "smtps://test-user%40example.test:test-password-123@smtp.gmail.com:465",
    );
  });
  it("infers EMAIL_FROM from SMTP_URL username if not explicitly set", () => {
    const config = parseServerConfig({
      ...input,
      SMTP_URL: "smtp://test-user%40example.test:test-password-123@smtp.gmail.com:587",
    });
    expect(config.EMAIL_FROM).toBe("test-user@example.test");
  });
});
