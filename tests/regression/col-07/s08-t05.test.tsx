// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectChat } from "../../../apps/web/src/features/chat/project-chat.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";
const message = {
  id: messageId,
  projectId,
  authorId: "33333333-3333-4333-8333-333333333333",
  authorName: "Reviewer",
  body: "Ready to review",
  createdAt: "2026-10-15T12:00:00.000Z",
};

class FakeSocket {
  static latest: FakeSocket;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.latest = this;
  }
  close() {}
  notify() {
    this.onmessage?.({
      data: JSON.stringify({
        eventId: "55555555-5555-4555-8555-555555555555",
        version: 1,
        projectId,
        occurredAt: "2026-10-15T12:00:00.000Z",
        type: "chat.created",
        payload: { messageId },
      }),
    } as MessageEvent);
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S08-T05 project chat", () => {
  it("posts a bounded message and refreshes durable history on invalidation and focus", async () => {
    const requests: string[] = [];
    let items: (typeof message)[] = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        requests.push(`${options?.method ?? "GET"} ${url}`);
        if (options?.method === "POST") {
          items = [message];
          return { ok: true, json: async () => message };
        }
        return { ok: true, json: async () => ({ items, nextCursor: null }) };
      }),
    );
    render(<ProjectChat projectId={projectId} apiUrl="http://api.test/api/v1" csrfToken="csrf" />);
    await screen.findByRole("heading", { name: "Project chat" });
    fireEvent.change(screen.getByRole("textbox", { name: "Chat message" }), {
      target: { value: "Ready to review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("Ready to review")).toBeTruthy();
    expect(requests.some((item) => item.startsWith("POST "))).toBe(true);
    const before = requests.length;
    FakeSocket.latest.notify();
    await waitFor(() => expect(requests.length).toBeGreaterThan(before));
    items = [
      { ...message, id: "44444444-4444-4444-8444-444444444444", body: "Missed while offline" },
      message,
    ];
    fireEvent.focus(window);
    expect(await screen.findByText("Missed while offline")).toBeTruthy();
  });

  it("shows an access error when history is denied", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403 })),
    );
    render(<ProjectChat projectId={projectId} apiUrl="http://api.test/api/v1" csrfToken="csrf" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/current role/i);
  });

  it("loads an older durable page from its cursor", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          url.includes("cursor=")
            ? {
                items: [
                  { ...message, id: "44444444-4444-4444-8444-444444444444", body: "Earlier draft" },
                ],
                nextCursor: null,
              }
            : { items: [message], nextCursor: messageId },
      })),
    );
    render(<ProjectChat projectId={projectId} apiUrl="http://api.test/api/v1" />);
    await screen.findByText("Ready to review");
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    expect(await screen.findByText("Earlier draft")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load older messages" })).toBeNull();
    await act(async () => fireEvent.focus(window));
    expect(screen.getByText("Earlier draft")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load older messages" })).toBeNull();
  });
});
