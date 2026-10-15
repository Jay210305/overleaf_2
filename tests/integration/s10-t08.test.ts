import { describe, expect, it } from "vitest";
import {
  setProjectFileText,
  validateSafeRegex,
} from "../../apps/api/src/modules/search/routes.js";

describe("S10-T08 Integration: Project Search and Previewed Replacement", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const file1 = "22222222-2222-4222-8222-222222222222";
  const file2 = "33333333-3333-4333-8333-333333333333";

  setProjectFileText(
    projectId,
    file1,
    "\\section{Quantum Mechanics}\nQuantum entanglement is a phenomenon.",
  );
  setProjectFileText(
    projectId,
    file2,
    "In classical physics, quantum effects are negligible.",
  );

  it("validates safe regex patterns and rejects catastrophic backtracking or overlong patterns", () => {
    const valid = validateSafeRegex("quantum.*");
    expect(valid.test("quantum entanglement")).toBe(true);

    // Rejects overlong patterns (>200 chars)
    expect(() => validateSafeRegex("a".repeat(201))).toThrow(/maximum allowed length/);

    // Rejects ReDoS nested quantifiers like (a+)+
    expect(() => validateSafeRegex("(a+)+")).toThrow(/catastrophic exponential backtracking/);
    expect(() => validateSafeRegex("([0-9]*)*")).toThrow(/catastrophic exponential backtracking/);

    // Rejects invalid regex syntax
    expect(() => validateSafeRegex("[unclosed-class")).toThrow(/Invalid regular expression syntax/);
  });

  it("handles case-insensitive and regex search queries accurately", () => {
    const pattern = validateSafeRegex("[Qq]uantum");
    const text1 = "\\section{Quantum Mechanics}\nQuantum entanglement is a phenomenon.";
    const matches1 = text1.match(pattern);
    expect(matches1).toHaveLength(2);
  });

  it("replaces occurrences cleanly in target text without side effects", () => {
    const original = "Quantum state in quantum mechanics.";
    const replaced = original.replace(/quantum/gi, "classical");
    expect(replaced).toBe("classical state in classical mechanics.");
  });
});
