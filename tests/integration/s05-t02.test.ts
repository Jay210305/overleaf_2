// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FileUploader } from "../../apps/web/src/features/files/file-uploader.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const apiUrl = "http://api.test/api/v1";

function file(name: string, content: string): File {
  const item = new File([content], name, { type: "text/plain" });
  Object.defineProperty(item, "arrayBuffer", {
    value: async () => Uint8Array.from(content, (character) => character.charCodeAt(0)).buffer,
  });
  return item;
}

class UploadRequest {
  static instances: UploadRequest[] = [];
  static autoComplete = true;
  readonly upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;
  aborted = false;
  constructor() {
    UploadRequest.instances.push(this);
  }
  open() {}
  send() {
    if (UploadRequest.autoComplete) this.complete();
  }
  complete() {
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 } as ProgressEvent);
      this.onload?.();
    });
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
}

describe("S05-T02 multi-file upload interaction", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    UploadRequest.instances = [];
    UploadRequest.autoComplete = true;
  });

  it("uploads selected files one at a time and reports durable completion", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    let nextId = 1;
    const fetcher = vi.fn(async (url: string, _options?: RequestInit) => {
      if (url.endsWith("/presign")) {
        const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
        return new Response(
          JSON.stringify({
            uploadId: id,
            url: `http://storage.test/${id}`,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: crypto.randomUUID() }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetcher);
    const onUploaded = vi.fn();
    render(createElement(FileUploader, { projectId, apiUrl, csrfToken: "csrf", onUploaded }));
    fireEvent.change(screen.getByLabelText("Upload project files"), {
      target: { files: [file("one.tex", "one"), file("two.bib", "two")] },
    });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Complete")).toHaveLength(2);
    expect(UploadRequest.instances).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/presign"))).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/complete"))).toHaveLength(2);
  });

  it("rejects unsafe and unsupported files locally without asking for a URL", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(createElement(FileUploader, { projectId, apiUrl, csrfToken: "csrf" }));
    fireEvent.change(screen.getByLabelText("Upload project files"), {
      target: { files: [file("../secret.tex", "secret"), file("archive.zip", "zip")] },
    });
    await screen.findAllByRole("alert");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels an active PUT and leaves the next queued file available", async () => {
    UploadRequest.autoComplete = false;
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    let nextId = 1;
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            uploadId: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
            url: "http://storage.test/upload",
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    render(createElement(FileUploader, { projectId, apiUrl, csrfToken: "csrf" }));
    fireEvent.change(screen.getByLabelText("Upload project files"), {
      target: { files: [file("one.tex", "one"), file("two.tex", "two")] },
    });
    await waitFor(() => expect(UploadRequest.instances).toHaveLength(1));
    UploadRequest.instances[0]!.upload.onprogress?.({
      lengthComputable: true,
      loaded: 1,
      total: 2,
    } as ProgressEvent);
    await waitFor(() =>
      expect(screen.getByLabelText("one.tex upload progress").getAttribute("value")).toBe("50"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel one.tex" }));
    await waitFor(() => expect(UploadRequest.instances).toHaveLength(2));
    expect(UploadRequest.instances[0]?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Retry one.tex" })).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("canceling a queued file does not abort the active file", async () => {
    UploadRequest.autoComplete = false;
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    let nextId = 1;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              uploadId: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
              url: "http://storage.test/upload",
              expiresAt: new Date(Date.now() + 300_000).toISOString(),
            }),
            { status: 200 },
          ),
      ),
    );
    render(createElement(FileUploader, { projectId, apiUrl, csrfToken: "csrf" }));
    fireEvent.change(screen.getByLabelText("Upload project files"), {
      target: { files: [file("one.tex", "one"), file("two.tex", "two")] },
    });
    await waitFor(() => expect(UploadRequest.instances).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel two.tex" }));
    expect(UploadRequest.instances[0]?.aborted).toBe(false);
    expect(screen.getByRole("button", { name: "Retry two.tex" })).toBeTruthy();
  });

  it("accepts dropped files through the same validation path", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(createElement(FileUploader, { projectId, apiUrl, csrfToken: "csrf" }));
    fireEvent.drop(screen.getByRole("button", { name: "Drop files here or choose files" }), {
      dataTransfer: { files: [file("archive.zip", "not supported")] },
    });
    await screen.findByRole("alert");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retries an uncertain completion with the same upload and idempotency key", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    let completeCount = 0;
    const fetcher = vi.fn(async (url: string, _options?: RequestInit) => {
      if (url.endsWith("/presign"))
        return new Response(
          JSON.stringify({
            uploadId: "22222222-2222-4222-8222-222222222222",
            url: "http://storage.test/upload",
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          }),
          { status: 200 },
        );
      completeCount++;
      if (completeCount === 1) throw new Error("response lost");
      return new Response("{}", { status: 201 });
    });
    vi.stubGlobal("fetch", fetcher);
    const onUploaded = vi.fn();
    render(createElement(FileUploader, { projectId, apiUrl, csrfToken: "csrf", onUploaded }));
    fireEvent.change(screen.getByLabelText("Upload project files"), {
      target: { files: [file("one.tex", "one")] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Retry one.tex" }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce());
    expect(UploadRequest.instances).toHaveLength(1);
    const presignCalls = fetcher.mock.calls.filter(([url]) => url.endsWith("/presign"));
    const completionCalls = fetcher.mock.calls.filter(([url]) => url.endsWith("/complete"));
    expect(presignCalls).toHaveLength(1);
    expect(completionCalls).toHaveLength(2);
    expect((completionCalls[0]?.[1] as RequestInit).headers).toEqual(
      (completionCalls[1]?.[1] as RequestInit).headers,
    );
  });
});
