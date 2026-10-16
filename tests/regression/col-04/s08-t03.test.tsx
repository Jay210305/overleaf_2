// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareDialog } from "../../../apps/web/src/features/sharing/share-dialog.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const inviteId = "33333333-3333-4333-8333-333333333333";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows owner sharing state and sends role changes with session CSRF", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    const method = init.method ?? "GET";
    if (method === "PATCH" && url.endsWith(`/members/${memberId}`))
      return Response.json({
        userId: memberId,
        displayName: "Collaborator",
        role: "VIEWER",
        revokedAt: null,
      });
    if (new URL(url).pathname.endsWith("/members"))
      return Response.json({
        items: [{ userId: memberId, displayName: "Collaborator", role: "EDITOR", revokedAt: null }],
        nextCursor: null,
      });
    if (new URL(url).pathname.endsWith("/invitations"))
      return Response.json({
        items: [
          {
            id: inviteId,
            projectId,
            email: "pending@example.test",
            role: "REVIEWER",
            status: "pending",
            expiresAt: "2026-10-20T00:00:00.000Z",
            createdAt: "2026-10-15T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      });
    if (new URL(url).pathname.endsWith("/share-links"))
      return Response.json({ items: [], nextCursor: null });
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetcher);
  const onClose = vi.fn();
  render(
    createElement(ShareDialog, {
      projectId,
      apiUrl: "http://api.test/api/v1",
      csrfToken: "session-csrf",
      onClose,
    }),
  );
  expect(
    await screen.findByRole("button", { name: "Revoke invitation for pending@example.test" }),
  ).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  expect(screen.getByText(/Collaborator · EDITOR/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Role for Collaborator"), {
    target: { value: "VIEWER" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save role for Collaborator" }));
  await waitFor(() =>
    expect(
      calls.some(([url, init]) => url.endsWith(`/members/${memberId}`) && init.method === "PATCH"),
    ).toBe(true),
  );
  const patch = calls.find(
    ([url, init]) => url.endsWith(`/members/${memberId}`) && init.method === "PATCH",
  )!;
  expect(patch[1]).toMatchObject({
    credentials: "include",
    headers: expect.objectContaining({ "x-csrf-token": "session-csrf" }),
    body: JSON.stringify({ role: "VIEWER" }),
  });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await waitFor(() =>
    expect(
      calls.some(([url, init]) => url.endsWith("/invitations") && init.method === "POST"),
    ).toBe(true),
  );
  const invite = calls.find(
    ([url, init]) => url.endsWith("/invitations") && init.method === "POST",
  )!;
  expect(invite[1]).toMatchObject({
    credentials: "include",
    body: JSON.stringify({ email: "new@example.test", role: "EDITOR" }),
    headers: expect.objectContaining({ "x-csrf-token": "session-csrf" }),
  });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("keeps sharing controls available after a failed mutation so the owner can retry", async () => {
  let patches = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === "PATCH") {
        patches += 1;
        return patches === 1
          ? new Response("", { status: 409 })
          : Response.json({
              userId: memberId,
              displayName: "Collaborator",
              role: "VIEWER",
              revokedAt: null,
            });
      }
      if (new URL(url).pathname.endsWith("/members"))
        return Response.json({
          items: [
            { userId: memberId, displayName: "Collaborator", role: "EDITOR", revokedAt: null },
          ],
          nextCursor: null,
        });
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  render(
    createElement(ShareDialog, {
      projectId,
      apiUrl: "http://api.test/api/v1",
      csrfToken: "session-csrf",
      onClose: vi.fn(),
    }),
  );
  const save = await screen.findByRole("button", { name: "Save role for Collaborator" });
  fireEvent.click(save);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Sharing changed. Refresh and try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Save role for Collaborator" }));
  await waitFor(() => expect(patches).toBe(2));
});
