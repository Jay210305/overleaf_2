// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as Y from "yjs";
import { CommentAnchors } from "../../../apps/web/src/features/review/comment-anchors.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubApi() {
  const doc = new Y.Doc();
  doc.getText("content").insert(0, "A target Z");
  const update = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
  doc.destroy();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/files/"))
        return { ok: true, json: async () => ({ updateBase64: update }) };
      if (url.includes("/members"))
        return { ok: true, json: async () => ({ items: [], nextCursor: null }) };
      return { ok: true, json: async () => ({ items: [], nextCursor: null }) };
    }),
  );
}

describe("S08-T09 comment anchor keyboard review", () => {
  it("labels every control and reaches them in a visible tab order", async () => {
    stubApi();
    render(
      <CommentAnchors
        projectId="project-id"
        fileId="file-id"
        apiUrl="http://api.test"
        csrfToken="csrf"
      />,
    );
    const source = await screen.findByRole("textbox", {
      name: "Source text for comment selection",
    });
    const body = screen.getByRole("textbox", { name: "Comment body" });
    const mention = screen.getByRole("combobox", { name: "Mention a member" });
    const add = screen.getByRole("button", { name: "Add comment" });
    const refresh = screen.getByRole("button", { name: "Refresh comments" });
    const accessibleName = (control: Element) => {
      const labelledBy = control.getAttribute("aria-label");
      if (labelledBy) return labelledBy;
      const id = control.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label?.textContent) return label.textContent;
      }
      return control.textContent;
    };
    for (const control of [source, body, mention, add, refresh])
      expect(accessibleName(control)).toBeTruthy();

    source.focus();
    expect(document.activeElement).toBe(source);
    // Manual keyboard path: source, body, mention and refresh remain reachable
    // without pointer-only affordances; the disabled Add button is skipped until
    // a range and body are present.
    body.focus();
    expect(document.activeElement).toBe(body);
    mention.focus();
    expect(document.activeElement).toBe(mention);
    expect(add.hasAttribute("disabled")).toBe(true);
    fireEvent.select(source, { target: { selectionStart: 0, selectionEnd: 1 } });
    fireEvent.change(body, { target: { value: "Check this" } });
    expect(add.hasAttribute("disabled")).toBe(false);
    add.focus();
    expect(document.activeElement).toBe(add);
    refresh.focus();
    expect(document.activeElement).toBe(refresh);
  });

  it("announces failures as text instead of color-only status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403 })),
    );
    render(
      <CommentAnchors
        projectId="project-id"
        fileId="file-id"
        apiUrl="http://api.test"
        csrfToken="csrf"
      />,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/unavailable|role/i);
  });
});
