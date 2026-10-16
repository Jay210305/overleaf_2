// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BinaryPreview } from "../../apps/web/src/features/files/binary-preview.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const apiUrl = "http://api.test/api/v1";

function node(id: string, name: string, mime: string) {
  return { id, name, mime, contentKind: "BINARY" as const, sizeBytes: 4 };
}

function stubObjectUrl(): string[] {
  const created: string[] = [];
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => {
      const url = `blob:preview-${created.length}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn(),
  });
  return created;
}

describe("S05-T05 binary preview safety", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders permitted images from authorized fetched bytes", async () => {
    stubObjectUrl();
    const fetcher = vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    render(
      createElement(BinaryPreview, { projectId, apiUrl, node: node("a1", "fig.png", "image/png") }),
    );
    const image = (await screen.findByTestId("binary-image")) as HTMLImageElement;
    expect(image.src).toMatch(/^blob:/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${apiUrl}/projects/${projectId}/files/a1/download`);
    expect(init.credentials).toBe("include");
  });

  it("renders PDFs from authorized fetched bytes without inline execution surface", async () => {
    stubObjectUrl();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([37, 80, 68, 70]), {
            status: 200,
            headers: { "content-type": "application/pdf" },
          }),
      ),
    );
    render(
      createElement(BinaryPreview, {
        projectId,
        apiUrl,
        node: node("b2", "doc.pdf", "application/pdf"),
      }),
    );
    const embed = (await screen.findByTestId("binary-pdf")) as HTMLEmbedElement;
    expect(embed.src).toMatch(/^blob:/);
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("serves active HTML/SVG as attachment-only links without fetching bytes", async () => {
    stubObjectUrl();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { rerender } = render(
      createElement(BinaryPreview, {
        projectId,
        apiUrl,
        node: node("c3", "evil.html", "text/html"),
      }),
    );
    const htmlLink = (await screen.findByTestId("binary-download")) as HTMLAnchorElement;
    expect(htmlLink.getAttribute("href")).toBe(`${apiUrl}/projects/${projectId}/files/c3/download`);
    expect(htmlLink.hasAttribute("download")).toBe(true);
    rerender(
      createElement(BinaryPreview, {
        projectId,
        apiUrl,
        node: node("c4", "art.svg", "image/svg+xml"),
      }),
    );
    expect(await screen.findByTestId("binary-download")).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector("embed")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("shows an unavailable placeholder when the authorized fetch fails", async () => {
    stubObjectUrl();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 404 })),
    );
    render(
      createElement(BinaryPreview, {
        projectId,
        apiUrl,
        node: node("d4", "gone.png", "image/png"),
      }),
    );
    expect(await screen.findByTestId("binary-unavailable")).not.toBeNull();
    expect(screen.queryByTestId("binary-image")).toBeNull();
  });
});
