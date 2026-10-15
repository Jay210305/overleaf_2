import { describe, expect, it } from "vitest";
import {
  forwardLookup,
  inverseLookup,
  parseSynctexData,
} from "../../../apps/api/src/modules/synctex/routes.js";
import {
  isWithinSyncTeXDistance,
  SYNCTEX_POINT_TOLERANCE_PT,
} from "../../../apps/web/src/features/pdf/source-navigation.js";

describe("CMP-07 Regression: Secure Forward/Inverse SyncTeX navigation", () => {
  const synctexText = `SyncTeX Version:1
Input:1:main.tex
Content:
!123
{1
[1,42:4718592,4718592:6553600,655360]
}1
`;

  it("navigates forward and validates documented tolerance", () => {
    const fileId = "00000000-0000-0000-0000-000000000001";
    const records = parseSynctexData(synctexText, { "main.tex": fileId });

    const forward = forwardLookup(records, fileId, 42, 1);
    expect(forward).not.toBeNull();
    expect(forward?.page).toBe(1);
    expect(forward?.boxes).toHaveLength(1);

    const box = forward!.boxes[0]!;
    expect(box.x).toBe(72);
    expect(box.y).toBe(72);

    // Verify distance from (72, 72) within tolerance
    expect(isWithinSyncTeXDistance({ x: 73, y: 74 }, { x: box.x, y: box.y })).toBe(true);
    expect(
      isWithinSyncTeXDistance(
        { x: 72 + SYNCTEX_POINT_TOLERANCE_PT + 1, y: 72 },
        { x: box.x, y: box.y },
      ),
    ).toBe(false);
  });

  it("navigates inverse from coordinates to line 42", () => {
    const fileId = "00000000-0000-0000-0000-000000000001";
    const records = parseSynctexData(synctexText, { "main.tex": fileId });

    const inverse = inverseLookup(records, 1, 75, 75);
    expect(inverse).not.toBeNull();
    expect(inverse?.fileId).toBe(fileId);
    expect(inverse?.line).toBe(42);
  });

  it("rejects lookup for unknown file gracefully", () => {
    const records = parseSynctexData(synctexText, {});
    const forward = forwardLookup(records, "non-existent-file-id", 42, 1);
    expect(forward).toBeNull();
  });
});
