// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AvatarSettings } from "../../../apps/web/src/features/account/avatar.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
});

it("loads a private avatar with credentials and replaces it with a bounded PNG upload", async () => {
  const profile = {
    id: "8094c658-191c-4f35-8fb6-4f251f3f5d8d",
    email: "writer@example.test",
    displayName: "Writer",
    locale: "en",
    timezone: "UTC",
    avatarUrl: "/api/v1/me/avatar/content",
  };
  const png = new File([new Uint8Array([137, 80, 78, 71])], "portrait.png", {
    type: "image/png",
  });
  const objectUrl = vi
    .fn()
    .mockReturnValueOnce("blob:previous-avatar")
    .mockReturnValueOnce("blob:new-avatar");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: objectUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  const image = () =>
    new Response(new Blob(["png"], { type: "image/png" }), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(image())
    .mockResolvedValueOnce(new Response(JSON.stringify(profile), { status: 200 }))
    .mockResolvedValueOnce(image());
  vi.stubGlobal("fetch", fetcher);
  const onProfileChange = vi.fn();
  render(createElement(AvatarSettings, { profile, csrf: "session-secret", onProfileChange }));
  const preview = await screen.findByRole("img", { name: "Writer avatar" });
  expect(preview.getAttribute("src")).toBe("blob:previous-avatar");
  fireEvent.change(screen.getByLabelText("Avatar PNG"), { target: { files: [png] } });
  fireEvent.click(screen.getByRole("button", { name: "Upload avatar" }));
  await waitFor(() => expect(onProfileChange).toHaveBeenCalledWith(profile));
  await waitFor(() => expect(preview.getAttribute("src")).toBe("blob:new-avatar"));
  const [uploadUrl, init] = fetcher.mock.calls[1] as [string, RequestInit];
  expect(uploadUrl).toMatch(/\/me\/avatar$/);
  expect(init.method).toBe("POST");
  expect(init.credentials).toBe("include");
  expect(init.headers).toMatchObject({
    "content-type": "image/png",
    "x-csrf-token": "session-secret",
  });
  expect(init.body).toBe(png);
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
});
