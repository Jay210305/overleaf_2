// @vitest-environment jsdom
import { createElement } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PdfViewer } from "../../../apps/web/src/features/pdf/pdf-viewer.js";

describe("NFR-06 PDF viewer revision provenance label (S06-T08)", () => {
  afterEach(() => {
    cleanup();
  });

  it("visibly displays source revision provenance and retains previous version with stale badge on failure", () => {
    render(
      createElement(PdfViewer, {
        projectId: "proj-provenance-test",
        pdfUrl: "/api/v1/projects/proj-123/artifacts/output.pdf",
        sourceRevisionId: "abc12345-6789-abcd-ef01-23456789abcd",
        revisionNo: 7,
        revisionLabel: "v1.2-draft",
        isStale: true,
        lastCompileStatus: "failed",
      }),
    );

    const revLabel = screen.getByTestId("revision-label");
    expect(revLabel).toBeTruthy();
    expect(revLabel.textContent).toBe("v1.2-draft");

    const staleBadge = screen.getByTestId("stale-badge");
    expect(staleBadge).toBeTruthy();
    expect(staleBadge.textContent).toBe("OUTDATED");
  });
});
