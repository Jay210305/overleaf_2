import { describe, expect, it } from "vitest";
import {
  applyGitDelta,
  buildPackfile,
  buildReceivePackResponse,
  buildRefAdvertisement,
  chunkPackfileSideband,
  createBlobObject,
  createCommitObject,
  createTreeObject,
  encodePktLine,
  parsePktLines,
  parseReceivePackCommands,
  unpackPackfile,
  verifyFastForward,
} from "../../../apps/git-bridge/src/protocol.js";

describe("Regression INT-06 (S14-T03): Git Smart HTTP protocol framing, packfile integrity, and fast-forward checks", () => {
  it("encodes and parses standard pkt-line frames including flush packets", () => {
    const line1 = encodePktLine("want aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
    expect(line1.subarray(0, 4).toString("ascii")).toBe("0032"); // 46 + 4 = 50 = 0x0032

    const flush = Buffer.from("0000", "ascii");
    const combined = Buffer.concat([line1, flush]);

    const parsed = parsePktLines(combined);
    expect(parsed.lines).toEqual(["want aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n", "0000"]);
  });

  it("constructs compliant ref advertisements for upload-pack and receive-pack", () => {
    const tip = "1234567890123456789012345678901234567890";

    const uploadAdv = buildRefAdvertisement("git-upload-pack", tip);
    expect(uploadAdv.toString("utf8")).toContain("# service=git-upload-pack\n");
    expect(uploadAdv.toString("utf8")).toContain(`${tip} refs/heads/main\0side-band-64k`);
    expect(uploadAdv.toString("utf8")).toContain(`${tip} HEAD\n`);

    const receiveAdv = buildRefAdvertisement("git-receive-pack", tip);
    expect(receiveAdv.toString("utf8")).toContain("# service=git-receive-pack\n");
    expect(receiveAdv.toString("utf8")).toContain(`${tip} refs/heads/main\0report-status\n`);
  });

  it("builds valid Git packfile with OBJ_COMMIT, OBJ_TREE, and OBJ_BLOB objects", () => {
    const blob = createBlobObject(
      "\\documentclass{article}\n\\begin{document}\nTest\n\\end{document}\n",
    );
    expect(blob.sha.length).toBe(40);

    const tree = createTreeObject([{ name: "main.tex", sha: blob.sha }]);
    expect(tree.sha.length).toBe(40);

    const commit = createCommitObject({
      treeSha: tree.sha,
      message: "Initial LaTeX document",
    });
    expect(commit.sha.length).toBe(40);

    const pack = buildPackfile([
      { type: 1, raw: commit.raw }, // OBJ_COMMIT
      { type: 2, raw: tree.raw }, // OBJ_TREE
      { type: 3, raw: blob.raw }, // OBJ_BLOB
    ]);

    // Check PACK header
    expect(pack.subarray(0, 4).toString("ascii")).toBe("PACK");
    expect(pack.readUInt32BE(4)).toBe(2); // version 2
    expect(pack.readUInt32BE(8)).toBe(3); // 3 objects
    expect(pack.length).toBeGreaterThan(32); // Header (12) + compressed payloads + 20-byte sha1
  });

  it("multiplexes packfile across sideband-64k channel 1 chunks", () => {
    const dummyPack = Buffer.alloc(100000, 0xab); // 100 KB dummy pack
    const stream = chunkPackfileSideband(dummyPack);

    expect(stream.toString("ascii")).toContain("0008NAK\n");
    // Trailing flush packet
    expect(stream.subarray(stream.length - 4).toString("ascii")).toBe("0000");
  });

  it("parses receive-pack commands and validates fast-forward conditions strictly", () => {
    const tip = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const goodNew = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const staleOld = "cccccccccccccccccccccccccccccccccccccccc";

    const commandText = `${tip} ${goodNew} refs/heads/main\0report-status\n`;
    const commands = parseReceivePackCommands(commandText);
    expect(commands.length).toBe(1);
    expect(commands[0]!.oldSha).toBe(tip);
    expect(commands[0]!.newSha).toBe(goodNew);

    // Fast-forward check with correct old tip
    const checkGood = verifyFastForward(commands[0]!, tip);
    expect(checkGood.ok).toBe(true);

    // Fast-forward check with stale old tip
    const checkStale = verifyFastForward(
      { oldSha: staleOld, newSha: goodNew, ref: "refs/heads/main" },
      tip,
    );
    expect(checkStale.ok).toBe(false);
    if (!checkStale.ok) {
      expect(checkStale.error).toContain("non-fast-forward");
    }

    // Response formatting
    const errResp = buildReceivePackResponse([
      { ref: "refs/heads/main", ok: false, error: "stale base" },
    ]);
    expect(errResp.toString("utf8")).toContain("unpack ok\n");
    expect(errResp.toString("utf8")).toContain("ng refs/heads/main stale base\n");

    const okResp = buildReceivePackResponse([{ ref: "refs/heads/main", ok: true }]);
    expect(okResp.toString("utf8")).toContain("unpack ok\n");
    expect(okResp.toString("utf8")).toContain("ok refs/heads/main\n");
  });

  it("applies Git delta instructions (copy and insert) accurately to reconstruct target object", () => {
    const base = Buffer.from("Hello World from LaTeX editor");
    // delta: baseSize=29 (0x1d), targetSize=43 (0x2b)
    // copy 0..11 ("Hello World"), insert " Collaborative" (14 bytes), copy 11..29 (" from LaTeX editor", 18 bytes)
    const insertBytes = Buffer.from(" Collaborative");
    const delta = Buffer.concat([
      Buffer.from([0x1d, 0x2b]),
      Buffer.from([0x91, 0x00, 0x0b]),
      Buffer.from([insertBytes.length]),
      insertBytes,
      Buffer.from([0x91, 0x0b, 0x12]),
    ]);

    const reconstructed = applyGitDelta(base, delta);
    expect(reconstructed.toString("utf8")).toBe("Hello World Collaborative from LaTeX editor");
  });

  it("unpacks packfiles into commits, trees, blobs, and extracted file maps", () => {
    const blob1 = createBlobObject(
      "\\documentclass{article}\n\\begin{document}\nMain\n\\end{document}\n",
    );
    const blob2 = createBlobObject("% Comments file\n");
    const tree = createTreeObject([
      { name: "main.tex", sha: blob1.sha },
      { name: "notes.txt", sha: blob2.sha },
    ]);
    const commit = createCommitObject({
      treeSha: tree.sha,
      message: "Test commit for packfile unpacking",
    });

    const packfile = buildPackfile([
      { type: 1, raw: commit.raw },
      { type: 2, raw: tree.raw },
      { type: 3, raw: blob1.raw },
      { type: 3, raw: blob2.raw },
    ]);

    const unpacked = unpackPackfile(packfile);
    expect(unpacked.objectsBySha.size).toBe(4);
    expect(unpacked.commits.has(commit.sha)).toBe(true);
    expect(unpacked.trees.has(tree.sha)).toBe(true);
    expect(unpacked.blobs.has(blob1.sha)).toBe(true);
    expect(unpacked.blobs.has(blob2.sha)).toBe(true);

    expect(unpacked.files.length).toBe(2);
    const mainFile = unpacked.files.find((f) => f.path === "main.tex");
    expect(mainFile).toBeDefined();
    expect(mainFile!.content).toContain("Main");

    const notesFile = unpacked.files.find((f) => f.path === "notes.txt");
    expect(notesFile).toBeDefined();
    expect(notesFile!.content).toBe("% Comments file\n");
  });
});
