// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Profile } from "../../../apps/web/src/features/account/profile.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("loads persisted settings and saves user-specific preferences with session CSRF", async () => {
  const user = {
    id: "8094c658-191c-4f35-8fb6-4f251f3f5d8d",
    email: "writer@example.test",
    displayName: "Writer",
    createdAt: "2026-10-11T00:00:00.000Z",
  };
  const preferences = {
    locale: "es-PE",
    timezone: "America/Lima",
    theme: "dark",
    editor: {},
    notifications: {},
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(user), {
        status: 200,
        headers: { "x-csrf-token": "session-secret" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...user, ...preferences }), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(preferences), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...preferences, theme: "light" }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(createElement(Profile));
  await screen.findByDisplayValue("es-PE");
  expect((screen.getByLabelText("Timezone") as HTMLInputElement).value).toBe("America/Lima");
  fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "light" } });
  fireEvent.click(screen.getByRole("button", { name: "Save preferences" }));
  await screen.findByText("Preferences saved.");
  const [url, init] = fetcher.mock.calls[4] as [string, RequestInit];
  expect(url).toMatch(/\/me\/preferences$/);
  expect(init.credentials).toBe("include");
  expect(init.headers).toMatchObject({ "x-csrf-token": "session-secret" });
  expect(JSON.parse(String(init.body))).toMatchObject({
    locale: "es-PE",
    timezone: "America/Lima",
    theme: "light",
  });
  await waitFor(() => expect(localStorage.getItem("theme")).toBe("light"));
});

it("loads another page of sessions before offering revocation", async () => {
  const user = {
    id: "8094c658-191c-4f35-8fb6-4f251f3f5d8d",
    email: "writer@example.test",
    displayName: "Writer",
    locale: "en",
    timezone: "UTC",
  };
  const preferences = { locale: "en", timezone: "UTC", theme: "system" };
  const first = {
    id: "8094c658-191c-4f35-8fb6-4f251f3f5d8e",
    deviceLabel: "Browser",
    createdAt: "2026-10-11T00:00:00.000Z",
    lastSeenAt: "2026-10-11T00:00:00.000Z",
    expiresAt: "2026-10-18T00:00:00.000Z",
    current: true,
  };
  const second = { ...first, id: "8094c658-191c-4f35-8fb6-4f251f3f5d8f", current: false };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("{}", { status: 200, headers: { "x-csrf-token": "session-secret" } }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(user), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(preferences), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [first], nextCursor: "next-page" }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [second], nextCursor: null }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(createElement(Profile));
  fireEvent.click(await screen.findByRole("button", { name: "Load more sessions" }));
  await waitFor(() => expect(screen.getAllByRole("button", { name: /Revoke/ })).toHaveLength(2));
  expect(fetcher.mock.calls[4]?.[0]).toMatch(/\/me\/sessions\?cursor=next-page$/);
});
