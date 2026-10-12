// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthForms } from "../../../apps/web/src/features/auth/auth-forms.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("NFR-08 accessible authentication forms", () => {
  it.each(["register", "verify", "login", "forgot", "reset"] as const)(
    "%s exposes named controls and a keyboard submit button",
    (mode) => {
      render(createElement(AuthForms, { mode }));
      const form = document.querySelector("form");
      expect(form).not.toBeNull();
      for (const input of form!.querySelectorAll("input")) {
        expect(input.labels?.length).toBeGreaterThan(0);
        expect(input.tabIndex).toBeGreaterThanOrEqual(0);
      }
      const submit = form!.querySelector("button[type='submit']");
      expect(submit?.textContent?.trim()).toBeTruthy();
      expect(submit?.getAttribute("tabindex")).toBeNull();
    },
  );

  it("moves focus to a validation error without trapping subsequent input", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    render(createElement(AuthForms, { mode: "login" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    const alert = await screen.findByRole("alert");
    expect(document.activeElement).toBe(alert);
    const email = screen.getByLabelText("Email");
    email.focus();
    expect(document.activeElement).toBe(email);
  });
});
