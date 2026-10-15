import { describe, it, expect } from "vitest";
import { parseSynctexData, forwardLookup, inverseLookup } from "../../../apps/api/src/modules/synctex/routes.js";
import {
  navigateSourceToPdf,
  navigatePdfToSource,
  pdfPointsToPixels,
  pixelsToPdfPoints,
  isWithinSyncTeXDistance,
} from "../../../apps/web/src/features/pdf/source-navigation.js";

describe("Regression CMP-07 (S10-T10): SyncTeX Forward and Inverse Coordinate Transformations", () => {
  const sampleSyncTeX = `SyncTeX Version:1
Input:1:main.tex
Output:pdf
Unit:1
Magnification:1000
x:0
y:0
{1
[1,42:4718592,9437184:6553600,655360]
}1
`;
  const fileId = "11111111-1111-4111-8111-111111111111";

  it("performs forward lookup mapping source line to PDF coordinates", () => {
    const data = parseSynctexData(sampleSyncTeX, { "main.tex": fileId });
    const result = forwardLookup(data, fileId, 42, 1);

    expect(result).not.toBeNull();
    expect(result?.page).toBe(1);
    expect(result?.boxes[0]?.x).toBe(72);
    expect(result?.boxes[0]?.y).toBe(144);
  });

  it("performs inverse lookup mapping PDF point to source file and line", () => {
    const data = parseSynctexData(sampleSyncTeX, { "main.tex": fileId });
    const result = inverseLookup(data, 1, 75, 145);

    expect(result).not.toBeNull();
    expect(result?.fileId).toBe(fileId);
    expect(result?.line).toBe(42);
  });

  it("calculates viewport coordinates correctly in UI navigation helper", async () => {
    const mockFetch: typeof fetch = async (url) => {
      const u = String(url);
      if (u.includes("forward")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            page: 1,
            boxes: [{ x: 72, y: 144, width: 100, height: 10 }],
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          fileId,
          line: 42,
          column: 1,
        }),
      } as unknown as Response;
    };

    const pdfPos = await navigateSourceToPdf({
      projectId: "proj-1",
      jobId: "job-1",
      fileId,
      line: 42,
      column: 1,
      fetchImpl: mockFetch,
    });
    expect(pdfPos.page).toBe(1);
    expect(pdfPos.boxes[0]?.x).toBe(72);

    const sourcePos = await navigatePdfToSource({
      projectId: "proj-1",
      jobId: "job-1",
      page: 1,
      x: 75,
      y: 145,
      fetchImpl: mockFetch,
    });
    expect(sourcePos.fileId).toBe(fileId);
    expect(sourcePos.line).toBe(42);

    expect(pdfPointsToPixels(72, 1.5)).toBe(108);
    expect(pixelsToPdfPoints(108, 1.5)).toBe(72);
    expect(isWithinSyncTeXDistance({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(true);
  });
});
