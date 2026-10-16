// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TemplateCatalogue } from "../../apps/web/src/features/templates/catalogue.js";

const apiUrl = "http://api.test/api/v1";

const templates = [
  {
    id: "minimal-article",
    title: "Minimal article",
    category: "article",
    description: "Start writing immediately.",
    version: "1.0.0",
    manifestHash: "a".repeat(64),
    mainPath: "main.tex",
    files: [{ path: "main.tex", sha256: "b".repeat(64), sizeBytes: 10, mime: "application/x-tex" }],
  },
  {
    id: "thesis-outline",
    title: "Thesis outline",
    category: "thesis",
    description: "Report with chapter and bibliography.",
    version: "1.0.0",
    manifestHash: "c".repeat(64),
    mainPath: "main.tex",
    files: [
      { path: "main.tex", sha256: "d".repeat(64), sizeBytes: 10, mime: "application/x-tex" },
      { path: "refs.bib", sha256: "e".repeat(64), sizeBytes: 5, mime: "application/x-bibtex" },
    ],
  },
];

function stubList() {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/templates?category=thesis")) {
      return new Response(JSON.stringify({ templates: [templates[1]] }), { status: 200 });
    }
    return new Response(JSON.stringify({ templates }), { status: 200 });
  });
}

describe("S05-T06 template catalogue", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists versioned templates and filters by category", async () => {
    const fetcher = stubList();
    vi.stubGlobal("fetch", fetcher);
    render(createElement(TemplateCatalogue, { apiUrl }));
    expect(await screen.findByText("Minimal article")).not.toBeNull();
    expect(screen.getByText("Thesis outline")).not.toBeNull();
    expect(screen.getAllByText("v1.0.0")).toHaveLength(2);
    fireEvent.change(screen.getByTestId("template-filter"), { target: { value: "thesis" } });
    await waitFor(() => expect(screen.queryByText("Minimal article")).toBeNull());
    expect(screen.getByText("Thesis outline")).not.toBeNull();
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init).toMatchObject({ credentials: "include" });
  });

  it("instantiates a template with a title and reports the project", async () => {
    const fetcher = stubList();
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/instantiate") && (init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body)) as { title: string };
        expect(body.title).toBe("My thesis");
        return new Response(
          JSON.stringify({
            id: "22222222-2222-4222-8222-222222222222",
            title: "My thesis",
            templateId: "thesis-outline",
            templateVersion: "1.0.0",
            mainFileId: "33333333-3333-4333-8333-333333333333",
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ templates }), { status: 200 });
    });
    const onInstantiated = vi.fn();
    render(createElement(TemplateCatalogue, { apiUrl, onInstantiated }));
    expect(await screen.findByText("Thesis outline")).not.toBeNull();
    const cards = screen.getAllByTestId("template-card");
    const thesis = cards.find((card) => card.textContent?.includes("Thesis outline"))!;
    fireEvent.change(thesis.querySelector("[data-testid='template-title-input']")!, {
      target: { value: "My thesis" },
    });
    fireEvent.click(thesis.querySelector("[data-testid='template-instantiate']")!);
    await waitFor(() =>
      expect(onInstantiated).toHaveBeenCalledWith(
        expect.objectContaining({ templateId: "thesis-outline" }),
      ),
    );
  });

  it("shows instantiate failures without creating phantom projects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/templates")
          ? new Response(JSON.stringify({ templates }), { status: 200 })
          : new Response(JSON.stringify({ message: "taken" }), { status: 409 }),
      ),
    );
    const onInstantiated = vi.fn();
    render(createElement(TemplateCatalogue, { apiUrl, onInstantiated }));
    expect(await screen.findByText("Minimal article")).not.toBeNull();
    fireEvent.click(screen.getAllByTestId("template-instantiate")[0]!);
    expect(await screen.findByTestId("catalogue-error")).not.toBeNull();
    expect(onInstantiated).not.toHaveBeenCalled();
  });
});
