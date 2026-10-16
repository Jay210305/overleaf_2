export type DiffOp = "equal" | "insert" | "delete";

export interface DiffLine {
  type: DiffOp;
  content: string;
  oldLineNo?: number | null;
  newLineNo?: number | null;
}

export interface TextDiffResult {
  lines: DiffLine[];
  insertions: number;
  deletions: number;
  equal: number;
}

/**
 * Deterministic Myers diff algorithm for text line comparisons.
 * Computes shortest edit script (SES) with minimal insertions and deletions.
 */
export function myersDiff(oldText: string, newText: string): TextDiffResult {
  if (oldText === "" && newText === "") {
    return { lines: [], insertions: 0, deletions: 0, equal: 0 };
  }

  const a = oldText === "" ? [] : oldText.split(/\r?\n/);
  const b = newText === "" ? [] : newText.split(/\r?\n/);

  const n = a.length;
  const m = b.length;

  if (n === 0) {
    const lines: DiffLine[] = b.map((line, idx) => ({
      type: "insert",
      content: line,
      oldLineNo: null,
      newLineNo: idx + 1,
    }));
    return { lines, insertions: m, deletions: 0, equal: 0 };
  }

  if (m === 0) {
    const lines: DiffLine[] = a.map((line, idx) => ({
      type: "delete",
      content: line,
      oldLineNo: idx + 1,
      newLineNo: null,
    }));
    return { lines, insertions: 0, deletions: n, equal: 0 };
  }

  const max = n + m;
  const v: number[] = new Array(2 * max + 1);
  const trace: number[][] = [];

  v[1 + max] = 0;

  let d = 0;
  for (d = 0; d <= max; d++) {
    const vCopy = [...v];
    trace.push(vCopy);

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[k - 1 + max]! < v[k + 1 + max]!)) {
        x = v[k + 1 + max]!;
      } else {
        x = v[k - 1 + max]! + 1;
      }

      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      v[k + max] = x;

      if (x >= n && y >= m) {
        break;
      }
    }

    if (v[n - m + max]! >= n) {
      break;
    }
  }

  // Backtrack to build the edit script
  const script: Array<{ prevX: number; prevY: number; x: number; y: number }> = [];
  let currX = n;
  let currY = m;

  for (let step = d; step > 0; step--) {
    const vPrev = trace[step]!;
    const k = currX - currY;

    let prevK: number;
    if (k === -step || (k !== step && vPrev[k - 1 + max]! < vPrev[k + 1 + max]!)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = vPrev[prevK + max]!;
    const prevY = prevX - prevK;

    script.unshift({ prevX, prevY, x: currX, y: currY });

    currX = prevX;
    currY = prevY;
  }

  const resultLines: DiffLine[] = [];
  let aIdx = 0;
  let bIdx = 0;
  let insertions = 0;
  let deletions = 0;
  let equal = 0;

  for (const step of script) {
    // Diagonal snake before insertion/deletion
    while (aIdx < step.prevX && bIdx < step.prevY) {
      resultLines.push({
        type: "equal",
        content: a[aIdx]!,
        oldLineNo: aIdx + 1,
        newLineNo: bIdx + 1,
      });
      aIdx++;
      bIdx++;
      equal++;
    }

    // Horizontal (delete) or vertical (insert)
    if (step.x - step.prevX > step.y - step.prevY) {
      // Deletion
      resultLines.push({
        type: "delete",
        content: a[aIdx]!,
        oldLineNo: aIdx + 1,
        newLineNo: null,
      });
      aIdx++;
      deletions++;
    } else if (step.y - step.prevY > step.x - step.prevX) {
      // Insertion
      resultLines.push({
        type: "insert",
        content: b[bIdx]!,
        oldLineNo: null,
        newLineNo: bIdx + 1,
      });
      bIdx++;
      insertions++;
    }

    // Remainder of snake after step
    while (aIdx < step.x && bIdx < step.y) {
      resultLines.push({
        type: "equal",
        content: a[aIdx]!,
        oldLineNo: aIdx + 1,
        newLineNo: bIdx + 1,
      });
      aIdx++;
      bIdx++;
      equal++;
    }
  }

  // Trailing snake to end of sequences
  while (aIdx < n && bIdx < m) {
    resultLines.push({
      type: "equal",
      content: a[aIdx]!,
      oldLineNo: aIdx + 1,
      newLineNo: bIdx + 1,
    });
    aIdx++;
    bIdx++;
    equal++;
  }

  return {
    lines: resultLines,
    insertions,
    deletions,
    equal,
  };
}

export interface ManifestItemDiff {
  nodeId: string;
  path: string;
  kind: "TEXT" | "BINARY";
  sha256: string;
  sizeBytes?: number;
}

export interface TreeRevisionDiff {
  added: ManifestItemDiff[];
  removed: ManifestItemDiff[];
  renamed: Array<{ nodeId: string; oldPath: string; newPath: string; sha256: string }>;
  modifiedText: Array<{ nodeId: string; path: string; oldSha256: string; newSha256: string }>;
  modifiedBinary: Array<{ nodeId: string; path: string; oldSha256: string; newSha256: string }>;
  unchanged: ManifestItemDiff[];
}

/**
 * Compares two revision item sets structurally by node ID and binary/text changes by SHA-256 hash.
 */
export function compareRevisionManifests(
  baseItems: ManifestItemDiff[],
  targetItems: ManifestItemDiff[],
): TreeRevisionDiff {
  const baseByNodeId = new Map(baseItems.map((item) => [item.nodeId, item]));
  const targetByNodeId = new Map(targetItems.map((item) => [item.nodeId, item]));

  const added: ManifestItemDiff[] = [];
  const removed: ManifestItemDiff[] = [];
  const renamed: Array<{ nodeId: string; oldPath: string; newPath: string; sha256: string }> = [];
  const modifiedText: Array<{ nodeId: string; path: string; oldSha256: string; newSha256: string }> = [];
  const modifiedBinary: Array<{ nodeId: string; path: string; oldSha256: string; newSha256: string }> = [];
  const unchanged: ManifestItemDiff[] = [];

  for (const [nodeId, targetItem] of targetByNodeId.entries()) {
    const baseItem = baseByNodeId.get(nodeId);
    if (!baseItem) {
      added.push(targetItem);
    } else {
      const isPathChanged = baseItem.path !== targetItem.path;
      const isHashChanged = baseItem.sha256 !== targetItem.sha256;

      if (isPathChanged) {
        renamed.push({
          nodeId,
          oldPath: baseItem.path,
          newPath: targetItem.path,
          sha256: targetItem.sha256,
        });
      }

      if (isHashChanged) {
        if (targetItem.kind === "BINARY" || baseItem.kind === "BINARY") {
          modifiedBinary.push({
            nodeId,
            path: targetItem.path,
            oldSha256: baseItem.sha256,
            newSha256: targetItem.sha256,
          });
        } else {
          modifiedText.push({
            nodeId,
            path: targetItem.path,
            oldSha256: baseItem.sha256,
            newSha256: targetItem.sha256,
          });
        }
      }

      if (!isPathChanged && !isHashChanged) {
        unchanged.push(targetItem);
      }
    }
  }

  for (const [nodeId, baseItem] of baseByNodeId.entries()) {
    if (!targetByNodeId.has(nodeId)) {
      removed.push(baseItem);
    }
  }

  // Sort lists deterministically by path
  added.sort((a, b) => a.path.localeCompare(b.path));
  removed.sort((a, b) => a.path.localeCompare(b.path));
  renamed.sort((a, b) => a.newPath.localeCompare(b.newPath));
  modifiedText.sort((a, b) => a.path.localeCompare(b.path));
  modifiedBinary.sort((a, b) => a.path.localeCompare(b.path));
  unchanged.sort((a, b) => a.path.localeCompare(b.path));

  return {
    added,
    removed,
    renamed,
    modifiedText,
    modifiedBinary,
    unchanged,
  };
}
