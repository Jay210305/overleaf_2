import { describe, expect, it } from "vitest";
import { containsUnsafeMarkdown, assertSafeBody } from "../../../apps/api/src/modules/comments/safety.js";
import { AuthError } from "../../../apps/api/src/modules/auth/errors.js";

const unsafeCorpus = [
  `<script>alert("xss")</script>`,
  `Take a look <SCRIPT SRC="https://evil.example/x.js"></SCRIPT> here`,
  `<img src="x" onerror="alert(1)">`,
  `<a href="javascript:alert(1)">click me</a>`,
  `<svg onload="alert(1)">`,
  `<div onclick = "steal()">text</div>`,
  `[click me](javascript:alert(1))`,
  `![alt](JaVaScRiPt:alert(1))`,
  `[click me](  <javascript:alert(1)>  )`,
  `[ later ]:\n[ref]: javascript:alert(1)`,
  `[x](data:text/html,<script>alert(1)</script>)`,
  `<iframe src="https://evil.example"></iframe>`,
  `<object data="https://evil.example/x.swf"></object>`,
  `<form action="https://evil.example"><input type="text"></form>`,
  `<a href="vbscript:msgbox(1)">legacy</a>`,
  `prefix <style>body{display:none}</style> suffix`,
  "null byte \u0000 in body",
];

const safeCorpus = [
  `Please review **section 2** before Friday.`,
  `See [the docs](https://example.com/guide) for details.`,
  "Use `\\textbf{bold}` and `$x^2 + y^2$` here.",
  `Change a < b and c > d in the proof.`,
  `Tom & Jerry reviewed equation (3).`,
  `@reviewer please check "quotes" and 'apostrophes'.`,
  "```latex\n\\section{Intro}\n```",
  `![figure](https://example.com/fig.png)`,
  `An <em>emphasized</em> word and <strong>strong</strong> word.`,
  `<a href="https://example.com">safe link</a>`,
  `onboarding = true is just code, not a handler.`,
  `The javascript ecosystem is large.`,
  `2 < 3 and 5 > 4, so (a+b) < (c+d).`,
];

describe("S08-T07 comment safety corpus (COL-06)", () => {
  it("rejects XSS vectors without touching safe content", () => {
    for (const body of unsafeCorpus) expect(containsUnsafeMarkdown(body)).toBe(true);
    for (const body of safeCorpus) expect(containsUnsafeMarkdown(body)).toBe(false);
  });

  it("assertSafeBody rejects unsafe or oversized input with 400", () => {
    for (const body of unsafeCorpus) {
      try {
        assertSafeBody(body);
        expect.unreachable(`expected rejection for ${JSON.stringify(body.slice(0, 40))}`);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).status).toBe(400);
      }
    }
    expect(() => assertSafeBody("x".repeat(10_001))).toThrowError(AuthError);
    try {
      assertSafeBody("x".repeat(10_001));
      expect.unreachable();
    } catch (error) {
      expect((error as AuthError).status).toBe(400);
    }
  });

  it("assertSafeBody accepts boundary-safe input", () => {
    for (const body of safeCorpus) expect(() => assertSafeBody(body)).not.toThrow();
    expect("x".repeat(10_000)).toHaveLength(10_000);
    expect(() => assertSafeBody("x".repeat(10_000))).not.toThrow();
  });
});
