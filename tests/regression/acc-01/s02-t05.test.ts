// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Router } from "../../../apps/web/src/app/router.js";

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

describe("ACC-01 browser auth route wiring", () => {
  it.each([
    ["/register", "Create your account"],
    ["/verify-email", "Verify your email"],
    ["/login", "Sign in"],
    ["/forgot-password", "Reset your password"],
    ["/reset-password", "Choose a new password"],
  ])("renders %s as a real form", async (path, heading) => {
    history.replaceState(null, "", path);
    render(createElement(Router));
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Create account|Verify email|Sign in|Send reset link|Reset password/,
      }),
    ).toBeTruthy();
  });
});
