// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Router } from "../../../apps/web/src/app/router.js";

vi.mock("../../../apps/web/src/features/files/file-tree.js", () => ({ FileTree: () => null }));
vi.mock("../../../apps/web/src/features/files/file-uploader.js", () => ({
  FileUploader: () => null,
}));
vi.mock("../../../apps/web/src/features/chat/project-chat.js", () => ({ ProjectChat: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("mounts the authorized sync panel from the loaded project workspace", async () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  window.history.replaceState(null, "", `/project/${projectId}`);
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith(`/projects/${projectId}`))
      return Response.json({ id: projectId, title: "Draft" });
    if (url.endsWith(`/projects/${projectId}/integrations/github/status`))
      return Response.json({
        id: projectId,
        status: "synced",
        sourceRevisionId: projectId,
        remoteRevision: "a".repeat(40),
        conflicts: [],
        entries: [],
        base: null,
      });
    return Response.json({ items: [], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetcher);
  render(createElement(Router));
  fireEvent.click(await screen.findByRole("button", { name: "GitHub Sync" }));
  expect(await screen.findByRole("region", { name: "GitHub synchronization" })).toBeTruthy();
  expect(
    fetcher.mock.calls.some(
      ([url, init]) => url.endsWith("/integrations/github/status") && init?.method === "POST",
    ),
  ).toBe(true);
});
