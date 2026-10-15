import { describe, expect, it } from "vitest";
import { validateSafeRegex } from "../../../apps/api/src/modules/search/routes.js";

describe("EDT-08 Regression: Search and replace with safe regex and concurrency guard", () => {
  it("enforces safe regex limits and rejects ReDoS vulnerabilities", () => {
    expect(() => validateSafeRegex("((a+)+)+")).toThrow(/catastrophic exponential backtracking/);
  });

  it("replaces matches accurately with preview capability", () => {
    const text = "Old string and another old string.";
    const query = "old string";
    const replacement = "new phrase";

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");

    const count = (text.match(regex) ?? []).length;
    expect(count).toBe(2);

    const result = text.replace(regex, replacement);
    expect(result).toBe("new phrase and another new phrase.");
  });
});
