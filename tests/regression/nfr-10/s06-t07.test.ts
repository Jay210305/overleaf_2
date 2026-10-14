import { describe, expect, it } from "vitest";
import { parseLatexLog } from "../../../packages/latex/src/parse-log.js";

describe("NFR-10 Zero credentials and tokens in logs (S06-T07)", () => {
  it("prevents any database passwords, auth tokens, or private secrets from appearing in log outputs", () => {
    const rawWithLeaks = `
[info] Connecting to db: postgresql://admin:prod_password_987@postgres.internal:5432/core
[info] Session token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload.signature
[warn] Access token provided: token="gho_16digitsecretkeyhere"
./main.tex:10: LaTeX Error: Bad syntax.
`;
    const parsed = parseLatexLog(rawWithLeaks);

    expect(parsed.cleanLog).not.toContain("prod_password_987");
    expect(parsed.cleanLog).not.toContain("secretpayload.signature");
    expect(parsed.cleanLog).not.toContain("gho_16digitsecretkeyhere");
    expect(parsed.cleanLog).toContain("[REDACTED_SECRET]");

    // Diagnostics must also be clean
    for (const diag of parsed.diagnostics) {
      expect(diag.message).not.toContain("prod_password_987");
      expect(diag.message).not.toContain("secretpayload.signature");
    }
  });
});
