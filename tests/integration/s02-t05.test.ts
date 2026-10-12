// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthForms } from "../../apps/web/src/features/auth/auth-forms.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("S02-T05 browser authentication forms", () => {
  it("uses an emailed invitation with the real registration endpoint and clears the URL fragment", async () => {
    const invitation = "i".repeat(43);
    history.replaceState(null, "", `/register#invitation=${invitation}`);
    const fetcher = vi.fn().mockResolvedValue(new Response('{"accepted":true}', { status: 202 }));
    vi.stubGlobal("fetch", fetcher);
    render(createElement(AuthForms, { mode: "register" }));
    expect(location.hash).toBe("");
    expect((screen.getByLabelText("Invitation code") as HTMLInputElement).value).toBe(invitation);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Writer@example.test" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Writer" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByText(/Check your email/);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/register$/);
    expect(init.credentials).toBe("include");
    expect(init.headers).toMatchObject({ "x-registration-invite": invitation });
    expect(JSON.parse(String(init.body))).toEqual({
      email: "Writer@example.test",
      displayName: "Writer",
      password: "correct-password-123",
    });
  });

  it("shows 429 and network errors, with focus on the status message", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "60" } }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetcher);
    render(createElement(AuthForms, { mode: "forgot" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "writer@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    const limited = await screen.findByRole("alert");
    expect(limited.textContent).toMatch(/Too many attempts/);
    expect(document.activeElement).toBe(limited);
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    const offline = await screen.findByRole("alert");
    expect(offline.textContent).toMatch(/Connection failed/);
    expect(document.activeElement).toBe(offline);
  });

  it("logs in and logs out with the session CSRF secret", async () => {
    const user = {
      id: "8094c658-191c-4f35-8fb6-4f251f3f5d8d",
      email: "writer@example.test",
      displayName: "Writer",
      createdAt: "2026-10-11T00:00:00.000Z",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(user), {
          status: 200,
          headers: { "x-csrf-token": "session-secret" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    render(createElement(AuthForms, { mode: "login" }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText(/Signed in as Writer/);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText(/Signed out/);
    const [url, init] = fetcher.mock.calls[2] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/logout$/);
    expect(init.headers).toMatchObject({ "x-csrf-token": "session-secret" });
    expect(init.credentials).toBe("include");
  });

  it("restores a cookie session after a page reload and allows logout", async () => {
    const user = {
      id: "8094c658-191c-4f35-8fb6-4f251f3f5d8d",
      email: "writer@example.test",
      displayName: "Writer",
      createdAt: "2026-10-11T00:00:00.000Z",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(user), {
          status: 200,
          headers: { "x-csrf-token": "restored-secret" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    render(createElement(AuthForms, { mode: "login" }));
    await screen.findByText(/Signed in as Writer/);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByText(/Signed out/);
    expect(fetcher.mock.calls[0]?.[0]).toMatch(/\/auth\/session$/);
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).credentials).toBe("include");
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).headers).toMatchObject({
      "x-csrf-token": "restored-secret",
    });
  });

  it("uses a reset link once and reports an expired token", async () => {
    const token = "t".repeat(43);
    history.replaceState(null, "", `/reset-password#token=${token}`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 401 })));
    render(createElement(AuthForms, { mode: "reset" }));
    expect(location.hash).toBe("");
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "replacement-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "replacement-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/expired or already used/);
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("shows a server validation error without reporting success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 400 })));
    render(createElement(AuthForms, { mode: "forgot" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "writer@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/check the fields/i);
    expect(screen.queryByText(/If that address can receive/)).toBeNull();
  });

  it("reports a denied invitation without creating an account", async () => {
    history.replaceState(null, "", `/register#invitation=${"i".repeat(43)}`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    render(createElement(AuthForms, { mode: "register" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "writer@example.test" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Writer" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Request denied/);
    expect(screen.queryByText(/Check your email/)).toBeNull();
  });
});
