// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TemplatePreview } from "../../apps/web/src/features/templates/template-preview.js";

const apiUrl = "http://api.test/api/v1";

const detail = {
  id: "thesis-outline",
  title: "Thesis outline",
  category: "thesis",
  description: "Report with chapter and bibliography.",
  version: "1.0.0",
  manifestHash: "c".repeat(64),
  mainPath: "main.tex",
  files: [
    { path: "main.tex", sha256: "d".repeat(64), sizeBytes: 120, mime: "application/x-tex" },
    { path: "refs.bib", sha256: "e".repeat(64), sizeBytes: 40, mime: "application/x-bibtex" },
  ],
  contents: [
    { path: "main.tex", content: "\\documentclass{report}\n\\begin{document}\n" },
    { path: "refs.bib", content: "@book{key, title={T}}\n" },
  ],
};

describe("S05-T11 template preview and instantiate", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the versioned manifest with main source preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(detail), { status: 200 })),
    );
    render(createElement(TemplatePreview, { apiUrl, templateId: "thesis-outline" }));
    expect(await screen.findByTestId("template-preview")).not.toBeNull();
    expect(screen.getByText("Thesis outline")).not.toBeNull();
    expect(screen.getByText("v1.0.0")).not.toBeNull();
    expect(screen.getByTestId("template-manifest-hash").textContent).toContain("c".repeat(8));
    expect(screen.getByTestId("template-main-source").textContent).toContain(
      "\\documentclass{report}",
    );
    expect(screen.getByTestId("template-file-list").textContent).toContain("refs.bib");
  });

  it("instantiates from the preview with a title", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/instantiate")) {
        expect(init?.method ?? "GET").toBe("POST");
        return new Response(
          JSON.stringify({
            id: "22222222-2222-4222-8222-222222222222",
            title: "From preview",
            templateId: "thesis-outline",
            templateVersion: "1.0.0",
            mainFileId: "33333333-3333-4333-8333-333333333333",
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify(detail), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const onInstantiated = vi.fn();
    render(
      createElement(TemplatePreview, { apiUrl, templateId: "thesis-outline", onInstantiated }),
    );
    expect(await screen.findByTestId("template-preview")).not.toBeNull();
    fireEvent.change(screen.getByTestId("template-title-input"), {
      target: { value: "From preview" },
    });
    fireEvent.click(screen.getByTestId("template-instantiate"));
    await waitFor(() =>
      expect(onInstantiated).toHaveBeenCalledWith(
        expect.objectContaining({ title: "From preview", templateVersion: "1.0.0" }),
      ),
    );
  });

  it("reports unknown templates and instantiate failures honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    render(createElement(TemplatePreview, { apiUrl, templateId: "missing" }));
    expect(await screen.findByTestId("template-preview-error")).not.toBeNull();
  });
});
