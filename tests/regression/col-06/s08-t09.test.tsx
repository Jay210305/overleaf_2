// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as Y from "yjs";
import { CommentAnchors } from "../../../apps/web/src/features/review/comment-anchors.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const memberId = "22222222-2222-4222-8222-222222222222";
const fileId = "55555555-5555-4555-8555-555555555555";

function textUpdateBase64(source: string) {
  const doc = new Y.Doc();
  doc.getText("content").insert(0, source);
  const update = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
  doc.destroy();
  return update;
}

function stubApi(comments: unknown[], source = "A target Z") {
  const requests: Array<{ url: string; method?: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/files/"))
        return {
          ok: true,
          json: async () => ({ updateBase64: textUpdateBase64(source) }),
        };
      if (url.includes("/members"))
        return {
          ok: true,
          json: async () => ({
            items: [
              { userId: memberId, displayName: "R Levante", role: "REVIEWER", revokedAt: null },
            ],
            nextCursor: null,
          }),
        };
      if (
        options?.method === "POST" ||
        options?.method === "PATCH" ||
        options?.method === "DELETE"
      ) {
        requests.push({
          url,
          method: options.method,
          body: options.body ? JSON.parse(String(options.body)) : undefined,
        });
        return { ok: true, json: async () => ({ id: "comment-id" }) };
      }
      return { ok: true, json: async () => ({ items: comments, nextCursor: null }) };
    }),
  );
  return requests;
}

function attachedComment() {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    projectId: "11111111-1111-4111-8111-111111111111",
    fileId,
    createdBy: memberId,
    body: "Review this range",
    status: "open",
    createdAt: new Date().toISOString(),
    anchorStart: { tname: "content", item: { client: 1, clock: 2 }, assoc: 0 },
    anchorEnd: { tname: "content", item: { client: 1, clock: 8 }, assoc: 0 },
    selectedText: "target",
    mentions: [memberId],
    replies: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        commentId: "33333333-3333-4333-8333-333333333333",
        authorId: memberId,
        body: "Agreed",
        mentions: [],
        createdAt: new Date().toISOString(),
      },
    ],
    detached: false,
    detachedReason: null,
    start: 2,
    end: 8,
  };
}

describe("S08-T09 comment anchors", () => {
  it("highlights the anchored range and shows replies, mentions and resolve", async () => {
    stubApi([attachedComment()]);
    render(
      <CommentAnchors
        projectId="project-id"
        fileId={fileId}
        apiUrl="http://api.test"
        csrfToken="csrf"
      />,
    );
    const mark = await screen.findByText("target", { selector: "mark" });
    expect(mark.getAttribute("aria-label")).toBe("Comment anchor: target");
    expect(mark.textContent).toBe("target");
    expect(screen.getByText("Review this range")).toBeTruthy();
    expect(screen.getByText("Agreed")).toBeTruthy();
    expect(
      screen.getByText((_, element) => element?.textContent === "Mentions: R Levante"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resolve comment" })).toBeTruthy();
  });

  it("posts a reply against the anchored thread", async () => {
    const requests = stubApi([attachedComment()]);
    render(
      <CommentAnchors
        projectId="project-id"
        fileId={fileId}
        apiUrl="http://api.test"
        csrfToken="csrf"
      />,
    );
    await screen.findByText("target", { selector: "mark" });
    fireEvent.change(screen.getByRole("textbox", { name: "Reply to this comment" }), {
      target: { value: "On it" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.url).toContain("/replies");
    expect(requests[0]?.body).toMatchObject({ body: "On it" });
  });

  it("shows the detached reason without moving the comment to unrelated source", async () => {
    stubApi([
      {
        ...attachedComment(),
        detached: true,
        detachedReason: "range_changed",
        start: null,
        end: null,
      },
    ]);
    render(
      <CommentAnchors
        projectId="project-id"
        fileId={fileId}
        apiUrl="http://api.test"
        csrfToken="csrf"
      />,
    );
    expect(await screen.findByText("Anchor unavailable: selected range changed.")).toBeTruthy();
    expect(screen.queryByText("target", { selector: "mark" })).toBeNull();
    expect(screen.getByText("Review this range")).toBeTruthy();
  });

  it("highlights the current source at shifted offsets and hides stale offsets", async () => {
    const shifted = { ...attachedComment(), start: 6, end: 12 };
    stubApi([shifted], "new A target Z");
    const rendered = render(
      <CommentAnchors
        projectId="project-id"
        fileId={fileId}
        apiUrl="http://api.test"
        csrfToken="csrf"
      />,
    );
    const mark = await screen.findByText("target", { selector: "mark" });
    expect(mark.parentElement?.textContent).toContain("new A target Z");
    rendered.unmount();
    vi.unstubAllGlobals();

    stubApi([{ ...attachedComment(), start: 0, end: 6 }]);
    render(
      <CommentAnchors
        projectId="project-id"
        fileId={fileId}
        apiUrl="http://api.test"
        csrfToken="csrf"
      />,
    );
    expect(await screen.findByText(/Anchor unavailable in loaded source/)).toBeTruthy();
    expect(screen.queryByText("target", { selector: "mark" })).toBeNull();
  });
});
