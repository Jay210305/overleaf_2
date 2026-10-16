// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as Y from "yjs";
import { CommentThread } from "../../../apps/web/src/features/review/comment-thread.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S08-T04 comment thread", () => {
  it("creates a relative range from selected canonical text and posts a comment", async () => {
    const doc = new Y.Doc();
    doc.getText("content").insert(0, "A target Z");
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        if (url.includes("/files/"))
          return {
            ok: true,
            json: async () => ({
              updateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
            }),
          };
        if (options?.method === "POST") {
          requests.push({ url, body: JSON.parse(String(options.body)) });
          return { ok: true, json: async () => ({ id: "comment-id" }) };
        }
        return { ok: true, json: async () => ({ items: [], nextCursor: null }) };
      }),
    );
    render(
      <CommentThread
        projectId="project-id"
        fileId="file-id"
        apiUrl="http://api.test"
        csrfToken="csrf"
      />,
    );
    const source = await screen.findByRole("textbox", {
      name: "Source text for comment selection",
    });
    fireEvent.select(source, { target: { selectionStart: 2, selectionEnd: 8 } });
    fireEvent.change(screen.getByRole("textbox", { name: "Comment body" }), {
      target: { value: "Review this" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toMatchObject({
      fileId: "file-id",
      selectedText: "target",
      body: "Review this",
    });
    expect(requests[0]?.body).toHaveProperty("anchorStart.item");
    doc.destroy();
  });
});
