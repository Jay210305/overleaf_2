import { describe, expect, it } from "vitest";
import { safeLoggerOptions } from "../../../apps/api/src/plugins/logging.js";
import { sanitizeTelemetryPayload } from "../../../apps/api/src/plugins/telemetry.js";

describe("NFR-10 S15-T07: Zero credentials and manuscript content in logs regression", () => {
  it("enforces redaction rules covering passwords, tokens, cookies, and manuscript content", () => {
    const opts = safeLoggerOptions("info");

    const requiredRedactions = ["password", "token", "source", "content", "cookie", "authorization"];
    for (const key of requiredRedactions) {
      expect(opts.redact).toContain(key);
    }

    const payload = {
      password: "leak-test-password",
      token: "secret-bearer-token",
      content: "\\begin{document} Private thesis data \\end{document}",
    };

    const sanitized = sanitizeTelemetryPayload(payload) as Record<string, string>;
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.content).toBe("[REDACTED]");
  });
});
