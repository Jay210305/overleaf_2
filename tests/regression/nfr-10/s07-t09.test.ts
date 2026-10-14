import { describe, expect, it } from "vitest";
import { CollabDurabilityMetrics } from "../../../apps/collab/src/metrics.js";

describe("NFR-10 Zero credentials, tokens, or manuscript content in logs (S07-T09)", () => {
  it("sanitizes logged messages to completely eliminate private LaTeX content and secrets", () => {
    const rawCollabLog = {
      event: "crdt_update_received",
      actorId: "usr-1234-5678",
      projectId: "proj-abcd-efgh",
      ticket: "wst_secret_ticket_value_98765",
      password: "SuperSecretPassword!",
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      text: "\\begin{equation} E = mc^2 \\end{equation}",
      content: "\\section{Classified Discovery}\nPatent pending...",
      updateBase64: "AQD+8u8D/vLvAwAA...",
      payload_bytes: "0102030405...",
      metadata: {
        safeField: "pdflatex",
        innerSecret: "secret-bearer-key",
      },
    };

    const sanitized = CollabDurabilityMetrics.sanitizeLogPayload(rawCollabLog);
    const jsonOutput = JSON.stringify(sanitized);

    // Verify all sensitive keys are replaced with [REDACTED]
    expect(jsonOutput).not.toContain("wst_secret_ticket_value_98765");
    expect(jsonOutput).not.toContain("SuperSecretPassword!");
    expect(jsonOutput).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(jsonOutput).not.toContain("Classified Discovery");
    expect(jsonOutput).not.toContain("Patent pending");
    expect(jsonOutput).not.toContain("AQD+8u8D/vLvAwAA");

    expect(sanitized.ticket).toBe("[REDACTED]");
    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.text).toBe("[REDACTED]");
    expect(sanitized.content).toBe("[REDACTED]");
    expect(sanitized.updateBase64).toBe("[REDACTED]");
    expect(sanitized.payload_bytes).toBe("[REDACTED]");

    expect((sanitized.metadata as Record<string, unknown>).safeField).toBe("pdflatex");
  });
});
