// @vitest-environment jsdom
import { afterEach, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Providers } from "../../apps/web/src/app/providers";
import { Router } from "../../apps/web/src/app/router";
afterEach(() => {
  cleanup();
  localStorage.clear();
  history.replaceState({}, "", "/");
});
it("routes explicitly unavailable features and persists theme", () => {
  history.replaceState({}, "", "/projects");
  render(
    <Providers>
      <Router />
    </Providers>,
  );
  expect(screen.getByRole("heading", { name: "Projects" })).toBeTruthy();
  expect(screen.getByText(/Not implemented yet/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
  expect(localStorage.getItem("theme")).toBe("dark");
  cleanup();
  render(
    <Providers>
      <Router />
    </Providers>,
  );
  expect(screen.getByRole("button", { name: "Dark theme" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
});
it("provides navigable recovery for unknown routes", () => {
  history.replaceState({}, "", "/missing");
  render(
    <Providers>
      <Router />
    </Providers>,
  );
  expect(screen.getByRole("heading", { name: "Page not found" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Return home" }).getAttribute("href")).toBe("/");
});
