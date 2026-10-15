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
      if (k === -d || (k !== d && (v[k - 1 + max] ?? 0) < (v[k + 1 + max] ?? 0))) {
        x = v[k + 1 + max] ?? 0;
      } else {
        x = (v[k - 1 + max] ?? 0) + 1;
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

    if ((v[kTrace(d) + max] ?? 0) >= n && (v[kTrace(d) + max] ?? 0) - kTrace(d) >= m) {
      break;
    }
  }

  function kTrace(step: number): number {
    for (let k = -step; k <= step; k += 2) {
      const x = v[k + max] ?? 0;
      const y = x - k;
      if (x >= n && y >= m) return k;
    }
    return 0;
  }

  // Backtrack through trace to build shortest edit script
  let currX = n;
  let currY = m;
  const script: Array<{ type: DiffOp; aIndex?: number; bIndex?: number }> = [];

  for (let step = trace.length - 1; step >= 0; step--) {
    const vAtStep = trace[step]!;
    const k = currX - currY;

    let prevK: number;
    if (step === 0) {
      prevK = 0;
    } else {
      const vPrev = trace[step - 1]!;
      if (k === -step || (k !== step && (vPrev[k - 1 + max] ?? 0) < (vPrev[k + 1 + max] ?? 0))) {
        prevK = k + 1;
      } else {
        prevK = k - 1;
      }
    }

    const prevX = vAtStep[prevK + max] ?? 0;
    const prevY = prevX - prevK;

    while (currX > prevX && currY > prevY) {
      script.push({ type: "equal", aIndex: currX - 1, bIndex: currY - 1 });
      currX--;
      currY--;
    }

    if (step > 0) {
      if (currX === prevX) {
        script.push({ type: "insert", bIndex: currY - 1 });
        currY--;
      } else {
        script.push({ type: "delete", aIndex: currX - 1 });
        currX--;
      }
    }
  }

  while (currX > 0 && currY > 0) {
    script.push({ type: "equal", aIndex: currX - 1, bIndex: currY - 1 });
    currX--;
    currY--;
  }
  while (currX > 0) {
    script.push({ type: "delete", aIndex: currX - 1 });
    currX--;
  }
  while (currY > 0) {
    script.push({ type: "insert", bIndex: currY - 1 });
    currY--;
  }

  script.reverse();

  let insertions = 0;
  let deletions = 0;
  let equal = 0;
  const lines: DiffLine[] = [];

  for (const item of script) {
    if (item.type === "equal") {
      equal++;
      lines.push({
        type: "equal",
        content: a[item.aIndex!] ?? "",
        oldLineNo: item.aIndex! + 1,
        newLineNo: item.bIndex! + 1,
      });
    } else if (item.type === "insert") {
      insertions++;
      lines.push({
        type: "insert",
        content: b[item.bIndex!] ?? "",
        oldLineNo: null,
        newLineNo: item.bIndex! + 1,
      });
    } else {
      deletions++;
      lines.push({
        type: "delete",
        content: a[item.aIndex!] ?? "",
        oldLineNo: item.aIndex! + 1,
        newLineNo: null,
      });
    }
  }

  return { lines, insertions, deletions, equal };
}

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

  return { added, removed, renamed, modifiedText, modifiedBinary, unchanged };
}
