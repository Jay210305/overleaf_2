// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProjectWorkspace } from "../../../apps/web/src/features/projects/workspace.js";
import { ShareDialog } from "../../../apps/web/src/features/sharing/share-dialog.js";

vi.mock("../../../apps/web/src/features/files/file-tree.js", () => ({ FileTree: () => null }));
vi.mock("../../../apps/web/src/features/files/file-uploader.js", () => ({
  FileUploader: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("shows members read-only when a non-owner opens sharing", async () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (new URL(url).pathname.endsWith("/members"))
        return Response.json({
          items: [
            {
              userId: "22222222-2222-4222-8222-222222222222",
              displayName: "Owner",
              role: "OWNER",
              revokedAt: null,
            },
          ],
          nextCursor: null,
        });
      return new Response("", { status: 403 });
    }),
  );
  render(
    createElement(ShareDialog, { projectId, apiUrl: "http://api.test/api/v1", onClose: vi.fn() }),
  );
  expect(await screen.findByText(/Owner · OWNER/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Send invitation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Create share link" })).toBeNull();
});

it("opens the sharing controls from a loaded project workspace", async () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith(`/projects/${projectId}`))
        return Response.json({ id: projectId, title: "Research draft" });
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  render(
    createElement(
      MemoryRouter,
      null,
      createElement(ProjectWorkspace, { projectId, apiUrl: "http://api.test/api/v1" }),
    ),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Share project" }));
  expect(await screen.findByRole("dialog", { name: "Project sharing" })).toBeTruthy();
});
