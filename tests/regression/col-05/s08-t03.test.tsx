// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Router } from "../../../apps/web/src/app/router.js";
import { ShareDialog } from "../../../apps/web/src/features/sharing/share-dialog.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
});

it("shows a newly created share URL only in the open dialog", async () => {
  const token = "s".repeat(43);
  const projectId = "11111111-1111-4111-8111-111111111111";
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && url.endsWith("/share-links"))
      return Response.json(
        {
          token,
          link: {
            id: "22222222-2222-4222-8222-222222222222",
            projectId,
            role: "VIEWER",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            maxUses: null,
            useCount: 0,
            revokedAt: null,
          },
        },
        { status: 201 },
      );
    return Response.json({ items: [], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetcher);
  const props = {
    projectId,
    apiUrl: "http://api.test/api/v1",
    csrfToken: "csrf",
    onClose: vi.fn(),
  };
  const mounted = render(createElement(ShareDialog, props));
  fireEvent.change(await screen.findByLabelText("Link expiry"), {
    target: { value: new Date(Date.now() + 3_600_000).toISOString().slice(0, 16) },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create share link" }));
  const oneTime = (await screen.findByLabelText("One-time share URL")) as HTMLInputElement;
  expect(oneTime.value).toContain(`#token=${token}`);
  mounted.unmount();
  render(createElement(ShareDialog, props));
  expect(screen.queryByLabelText("One-time share URL")).toBeNull();
});

it("redeems a fragment share token through the JSON body without leaving it in the URL", async () => {
  const token = "t".repeat(43);
  const projectId = "11111111-1111-4111-8111-111111111111";
  window.history.replaceState(null, "", `/share-links#token=${token}`);
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith("/auth/session"))
      return Response.json(
        { user: { id: projectId } },
        { headers: { "x-csrf-token": "fresh-csrf" } },
      );
    if (url.endsWith("/share-links/redeem")) return Response.json({ projectId, role: "VIEWER" });
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  render(createElement(Router));
  expect(await screen.findByRole("heading", { name: "Share link" })).toBeTruthy();
  expect(window.location.hash).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Join project" }));
  expect(await screen.findByRole("link", { name: "Open project" })).toBeTruthy();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  const request = fetcher.mock.calls[1]?.[1];
  expect(request).toMatchObject({
    method: "POST",
    credentials: "include",
    headers: expect.objectContaining({ "x-csrf-token": "fresh-csrf" }),
    body: JSON.stringify({ token }),
  });
});
