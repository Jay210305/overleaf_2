// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotificationList } from "../../../apps/web/src/features/notifications/list.js";

const item = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "mention",
  projectId: "22222222-2222-4222-8222-222222222222",
  sourceId: "33333333-3333-4333-8333-333333333333",
  projectTitle: "Shared paper",
  readAt: null,
  createdAt: "2026-10-15T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S08-T06 in-app notifications", () => {
  it("shows an authorized notification and persists mark read", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options?: RequestInit) => {
        requests.push(`${options?.method ?? "GET"} ${url}`);
        if (options?.method === "PATCH")
          return { ok: true, json: async () => ({ ...item, readAt: "2026-10-15T12:05:00.000Z" }) };
        return { ok: true, json: async () => ({ items: [item], nextCursor: null }) };
      }),
    );
    render(<NotificationList apiUrl="http://api.test/api/v1" csrfToken="csrf" />);
    expect(await screen.findByText(/mentioned you in Shared paper/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Shared paper/ }).getAttribute("href")).toBe(
      `/project/${item.projectId}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    expect(await screen.findByText("Read")).toBeTruthy();
    expect(requests.some((value) => value.startsWith("PATCH "))).toBe(true);
  });

  it("shows a visible error if the private feed is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401 })),
    );
    render(<NotificationList apiUrl="http://api.test/api/v1" csrfToken="csrf" />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/notifications unavailable/i);
  });
});
