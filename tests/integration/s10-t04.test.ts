import { describe, expect, it } from "vitest";
import {
  forwardLookup,
  inverseLookup,
  parseSynctexData,
} from "../../apps/api/src/modules/synctex/routes.js";
import {
  isWithinSyncTeXDistance,
  navigatePdfToSource,
  navigateSourceToPdf,
  pdfPointsToPixels,
  pixelsToPdfPoints,
  SYNCTEX_POINT_TOLERANCE_PT,
} from "../../apps/web/src/features/pdf/source-navigation.js";

describe("S10-T04 Integration: Forward and Inverse SyncTeX", () => {
  const sampleSynctex = `SyncTeX Version:1
Input:1:main.tex
Input:2:chapters/intro.tex
Content:
!123
{1
[1,10:4718592,4718592:6553600,655360]
x1,15:4718592,9437184
(2,5:4718592,14155776:3276800,655360)
}1
{2
[1,25:4718592,4718592:6553600,655360]
}2
`;

  it("parses raw synctex file into structured records", () => {
    const fileIdMap = {
      "main.tex": "11111111-1111-4111-8111-111111111111",
      "chapters/intro.tex": "22222222-2222-4222-8222-222222222222",
    };

    const records = parseSynctexData(sampleSynctex, fileIdMap);
    expect(records.length).toBeGreaterThanOrEqual(4);

    const r1 = records[0]!;
    expect(r1.fileId).toBe("11111111-1111-4111-8111-111111111111");
    expect(r1.page).toBe(1);
    expect(r1.line).toBe(10);
    expect(r1.x).toBe(72); // 4718592 / 65536 = 72 pt
    expect(r1.y).toBe(72);
    expect(r1.width).toBe(100); // 6553600 / 65536 = 100 pt
  });

  it("forward synctex maps source line to target page and bounding boxes within tolerance", () => {
    const fileId = "11111111-1111-4111-8111-111111111111";
    const records = parseSynctexData(sampleSynctex, { "main.tex": fileId });

    const view = forwardLookup(records, fileId, 10, 1);
    expect(view).not.toBeNull();
    expect(view?.page).toBe(1);
    expect(view?.boxes.length).toBeGreaterThanOrEqual(1);
    expect(view?.boxes[0]?.x).toBe(72);
    expect(view?.boxes[0]?.y).toBe(72);

    // Nearby line matches closest
    const viewNearby = forwardLookup(records, fileId, 11, 1);
    expect(viewNearby?.page).toBe(1);
  });

  it("inverse synctex maps PDF coordinates to source file, line, and column", () => {
    const fileId = "11111111-1111-4111-8111-111111111111";
    const records = parseSynctexData(sampleSynctex, { "main.tex": fileId });

    const view = inverseLookup(records, 1, 74, 75);
    expect(view).not.toBeNull();
    expect(view?.fileId).toBe(fileId);
    expect(view?.line).toBe(10);
    expect(view?.column).toBe(1);
  });

  it("client navigation helper handles forward and inverse requests", async () => {
    const mockJobId = "33333333-3333-4333-8333-333333333333";
    const mockFileId = "11111111-1111-4111-8111-111111111111";

    const mockFetch: typeof fetch = async (url) => {
      const urlStr = String(url);

      if (urlStr.includes("/synctex/forward")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            page: 1,
            boxes: [{ x: 72, y: 72, width: 100, height: 10 }],
          }),
        } as unknown as Response;
      }
      if (urlStr.includes("/synctex/inverse")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            fileId: mockFileId,
            line: 10,
            column: 1,
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    };

    const forwardRes = await navigateSourceToPdf({
      projectId: "00000000-0000-0000-0000-000000000001",
      jobId: mockJobId,
      fileId: mockFileId,
      line: 10,
      column: 1,
      fetchImpl: mockFetch,
    });
    expect(forwardRes.page).toBe(1);
    expect(forwardRes.boxes).toHaveLength(1);

    const inverseRes = await navigatePdfToSource({
      projectId: "00000000-0000-0000-0000-000000000001",
      jobId: mockJobId,
      page: 1,
      x: 75,
      y: 75,
      fetchImpl: mockFetch,
    });
    expect(inverseRes.fileId).toBe(mockFileId);
    expect(inverseRes.line).toBe(10);
  });

  it("verifies tolerance calculations and scale transformations", () => {
    expect(isWithinSyncTeXDistance({ x: 100, y: 100 }, { x: 102, y: 102 })).toBe(true);
    expect(
      isWithinSyncTeXDistance(
        { x: 100, y: 100 },
        { x: 120, y: 120 },
        SYNCTEX_POINT_TOLERANCE_PT,
      ),
    ).toBe(false);

    expect(pdfPointsToPixels(72, 1.5)).toBe(108);
    expect(pixelsToPdfPoints(108, 1.5)).toBe(72);
  });
});
