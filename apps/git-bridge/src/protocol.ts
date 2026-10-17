import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

export const PKT_FLUSH = Buffer.from("0000", "ascii");

export function encodePktLine(data: string | Buffer): Buffer {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const len = buf.length + 4;
  const hex = len.toString(16).padStart(4, "0");
  return Buffer.concat([Buffer.from(hex, "ascii"), buf]);
}

export function parsePktLines(buf: Buffer): { lines: string[]; remaining: Buffer } {
  const lines: string[] = [];
  let offset = 0;

  while (offset + 4 <= buf.length) {
    const lenHex = buf.subarray(offset, offset + 4).toString("ascii");
    if (lenHex === "0000") {
      lines.push("0000");
      offset += 4;
      continue;
    }
    const len = Number.parseInt(lenHex, 16);
    if (Number.isNaN(len) || len < 4 || offset + len > buf.length) {
      break;
    }
    const payload = buf.subarray(offset + 4, offset + len);
    lines.push(payload.toString("utf8"));
    offset += len;
  }

  return { lines, remaining: buf.subarray(offset) };
}

export function encodePackObjectHeader(typeNum: number, uncompressedSize: number): Buffer {
  const bytes: number[] = [];
  let s = uncompressedSize;
  let c = (typeNum << 4) | (s & 0x0f);
  s = Math.floor(s / 16);
  while (s > 0) {
    bytes.push(c | 0x80);
    c = s & 0x7f;
    s = Math.floor(s / 128);
  }
  bytes.push(c);
  return Buffer.from(bytes);
}

export function createBlobObject(content: Buffer | string): { sha: string; raw: Buffer } {
  const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${raw.length}\0`);
  const full = Buffer.concat([header, raw]);
  const sha = createHash("sha1").update(full).digest("hex");
  return { sha, raw };
}

export function createTreeObject(
  entries: Array<{ mode?: string; name: string; sha: string }>,
): { sha: string; raw: Buffer } {
  // Sort entries by name per Git specification
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const parts: Buffer[] = [];

  for (const entry of sorted) {
    const mode = entry.mode ?? "100644";
    const shaBytes = Buffer.from(entry.sha, "hex");
    parts.push(Buffer.from(`${mode} ${entry.name}\0`), shaBytes);
  }

  const raw = Buffer.concat(parts);
  const header = Buffer.from(`tree ${raw.length}\0`);
  const sha = createHash("sha1").update(Buffer.concat([header, raw])).digest("hex");
  return { sha, raw };
}

export function createCommitObject(params: {
  treeSha: string;
  parentSha?: string | undefined;
  author?: { name: string; email: string; timestamp?: number; tz?: string } | undefined;
  committer?: { name: string; email: string; timestamp?: number; tz?: string } | undefined;
  message: string;
}): { sha: string; raw: Buffer } {
  const author = params.author ?? { name: "Collaborative User", email: "user@latex-collab.local" };
  const committer = params.committer ?? author;
  const ts = Math.floor((author.timestamp ?? Date.now()) / 1000);
  const tz = author.tz ?? "+0000";

  let body = `tree ${params.treeSha}\n`;
  if (params.parentSha && params.parentSha !== "0000000000000000000000000000000000000000") {
    body += `parent ${params.parentSha}\n`;
  }
  body += `author ${author.name} <${author.email}> ${ts} ${tz}\n`;
  body += `committer ${committer.name} <${committer.email}> ${ts} ${tz}\n\n`;
  body += `${params.message.trim()}\n`;

  const raw = Buffer.from(body, "utf8");
  const header = Buffer.from(`commit ${raw.length}\0`);
  const sha = createHash("sha1").update(Buffer.concat([header, raw])).digest("hex");
  return { sha, raw };
}

export function buildPackfile(
  objects: Array<{ type: number; raw: Buffer }>,
): Buffer {
  const packHeader = Buffer.alloc(12);
  packHeader.write("PACK", 0, "ascii");
  packHeader.writeUInt32BE(2, 4); // version 2
  packHeader.writeUInt32BE(objects.length, 8);

  const parts: Uint8Array[] = [packHeader];
  for (const obj of objects) {
    parts.push(encodePackObjectHeader(obj.type, obj.raw.length));
    parts.push(deflateSync(obj.raw));
  }

  const packData = Buffer.concat(parts);
  const packChecksum = createHash("sha1").update(packData).digest();
  return Buffer.concat([packData, packChecksum]);
}

export function generateProjectSnapshotPackfile(params: {
  files: Array<{ path: string; content: string | Buffer }>;
  authorName?: string;
  authorEmail?: string;
  message?: string;
  parentSha?: string;
}): { packfile: Buffer; commitSha: string; treeSha: string } {
  const treeEntries: Array<{ name: string; sha: string; mode?: string }> = [];
  const packObjects: Array<{ type: number; raw: Buffer }> = [];

  for (const file of params.files) {
    const blob = createBlobObject(file.content);
    treeEntries.push({ name: file.path, sha: blob.sha });
    packObjects.push({ type: 3, raw: blob.raw }); // OBJ_BLOB = 3
  }

  const tree = createTreeObject(treeEntries);
  packObjects.push({ type: 2, raw: tree.raw }); // OBJ_TREE = 2

  const commit = createCommitObject({
    treeSha: tree.sha,
    parentSha: params.parentSha,
    author: {
      name: params.authorName ?? "Collaborative Editor",
      email: params.authorEmail ?? "editor@latex-collab.local",
    },
    message: params.message ?? "Revision commit from collaborative editor",
  });
  packObjects.unshift({ type: 1, raw: commit.raw }); // OBJ_COMMIT = 1

  const packfile = buildPackfile(packObjects);
  return { packfile, commitSha: commit.sha, treeSha: tree.sha };
}

export function buildRefAdvertisement(
  service: "git-upload-pack" | "git-receive-pack",
  tipSha: string,
): Buffer {
  const serviceHeader = encodePktLine(`# service=${service}\n`);
  const flush = PKT_FLUSH;
  // receive-pack uses report-status, upload-pack uses side-band-64k
  const caps = service === "git-receive-pack"
    ? "report-status"
    : "side-band-64k agent=latex-collab-git-bridge/1.0";
  const refLine = encodePktLine(`${tipSha} refs/heads/main\0${caps}\n`);
  const headLine = encodePktLine(`${tipSha} HEAD\n`);
  return Buffer.concat([serviceHeader, flush, refLine, headLine, flush]);
}

export function chunkPackfileSideband(packfile: Buffer): Buffer {
  const chunks: Buffer[] = [encodePktLine("NAK\n")];
  let offset = 0;
  const CHUNK_SIZE = 65515; // 65520 - 4 hex bytes - 1 band byte

  while (offset < packfile.length) {
    const slice = packfile.subarray(offset, offset + CHUNK_SIZE);
    offset += CHUNK_SIZE;
    const bandBuf = Buffer.concat([Buffer.from([1]), slice]);
    chunks.push(encodePktLine(bandBuf));
  }
  chunks.push(PKT_FLUSH);
  return Buffer.concat(chunks);
}

export function parseReceivePackCommands(
  body: Buffer | string,
): Array<{ oldSha: string; newSha: string; ref: string }> {
  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
  const regex = /([0-9a-f]{40})\s+([0-9a-f]{40})\s+([^\x00\n]+)/g;
  const commands: Array<{ oldSha: string; newSha: string; ref: string }> = [];
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    commands.push({
      oldSha: m[1]!,
      newSha: m[2]!,
      ref: m[3]!.trim(),
    });
  }
  return commands;
}

export function verifyFastForward(
  command: { oldSha: string; newSha: string; ref: string },
  currentTipSha: string,
): { ok: true } | { ok: false; error: string } {
  // Empty initial repository allows any base
  if (currentTipSha === "0000000000000000000000000000000000000000") {
    return { ok: true };
  }

  if (command.oldSha !== currentTipSha) {
    return {
      ok: false,
      error: "non-fast-forward: stale base revision; pull first",
    };
  }

  return { ok: true };
}

export function buildReceivePackResponse(
  results: Array<{ ref: string; ok: boolean; error?: string }>,
): Buffer {
  const lines: Buffer[] = [encodePktLine("unpack ok\n")];

  for (const r of results) {
    if (r.ok) {
      lines.push(encodePktLine(`ok ${r.ref}\n`));
    } else {
      lines.push(encodePktLine(`ng ${r.ref} ${r.error ?? "error"}\n`));
    }
  }

  lines.push(PKT_FLUSH);
  return Buffer.concat(lines);
}

export interface GitRawObject {
  type: number; // 1 = commit, 2 = tree, 3 = blob, 4 = tag
  raw: Buffer;
  sha: string;
}

export interface ParsedTreeEntry {
  mode: string;
  name: string;
  sha: string;
}

export interface ParsedCommit {
  sha: string;
  treeSha: string;
  parentShas: string[];
  author: string;
  message: string;
}

export interface UnpackedPackfile {
  objectsBySha: Map<string, GitRawObject>;
  commits: Map<string, ParsedCommit>;
  trees: Map<string, ParsedTreeEntry[]>;
  blobs: Map<string, Buffer>;
  files: Array<{ path: string; content: string }>;
}

export function parseTreeObject(buf: Buffer): ParsedTreeEntry[] {
  const entries: ParsedTreeEntry[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const spaceIdx = buf.indexOf(0x20, offset);
    if (spaceIdx === -1) break;
    const mode = buf.subarray(offset, spaceIdx).toString("ascii");
    const nullIdx = buf.indexOf(0x00, spaceIdx + 1);
    if (nullIdx === -1) break;
    const name = buf.subarray(spaceIdx + 1, nullIdx).toString("utf8");
    const sha = buf.subarray(nullIdx + 1, nullIdx + 21).toString("hex");
    entries.push({ mode, name, sha });
    offset = nullIdx + 21;
  }
  return entries;
}

export function parseCommitObject(buf: Buffer): Omit<ParsedCommit, "sha"> {
  const text = buf.toString("utf8");
  const lines = text.split("\n");
  let treeSha = "";
  const parentShas: string[] = [];
  let author = "";
  let messageStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line === "") {
      messageStart = i + 1;
      break;
    }
    if (line.startsWith("tree ")) {
      treeSha = line.slice(5).trim();
    } else if (line.startsWith("parent ")) {
      parentShas.push(line.slice(7).trim());
    } else if (line.startsWith("author ")) {
      author = line.slice(7).trim();
    }
  }
  const message = lines.slice(messageStart).join("\n").trim();
  return { treeSha, parentShas, author, message };
}

export function applyGitDelta(base: Buffer, delta: Buffer): Buffer {
  let pos = 0;
  let baseSize = 0;
  let shift = 0;
  while (pos < delta.length) {
    const b = delta[pos++]!;
    baseSize |= (b & 0x7f) << shift;
    shift += 7;
    if (!(b & 0x80)) break;
  }
  void baseSize;
  let targetSize = 0;
  shift = 0;
  while (pos < delta.length) {
    const b = delta[pos++]!;
    targetSize |= (b & 0x7f) << shift;
    shift += 7;
    if (!(b & 0x80)) break;
  }
  const target = Buffer.alloc(targetSize);
  let outPos = 0;
  while (pos < delta.length) {
    const cmd = delta[pos++]!;
    if (cmd & 0x80) {
      let copyOffset = 0;
      let copyLength = 0;
      if (cmd & 0x01) copyOffset |= delta[pos++]!;
      if (cmd & 0x02) copyOffset |= (delta[pos++]! << 8);
      if (cmd & 0x04) copyOffset |= (delta[pos++]! << 16);
      if (cmd & 0x08) copyOffset |= (delta[pos++]! << 24);
      if (cmd & 0x10) copyLength |= delta[pos++]!;
      if (cmd & 0x20) copyLength |= (delta[pos++]! << 8);
      if (cmd & 0x40) copyLength |= (delta[pos++]! << 16);
      if (copyLength === 0) copyLength = 0x10000;
      base.copy(target, outPos, copyOffset, copyOffset + copyLength);
      outPos += copyLength;
    } else if (cmd > 0) {
      delta.copy(target, outPos, pos, pos + cmd);
      pos += cmd;
      outPos += cmd;
    }
  }
  return target;
}

export function unpackPackfile(
  packBuf: Buffer,
  existingObjects?: Map<string, GitRawObject>,
): UnpackedPackfile {
  const objectsBySha = new Map<string, GitRawObject>(existingObjects);
  const objectsByOffset = new Map<number, GitRawObject>();
  const commits = new Map<string, ParsedCommit>();
  const trees = new Map<string, ParsedTreeEntry[]>();
  const blobs = new Map<string, Buffer>();

  if (packBuf.length < 12 || packBuf.subarray(0, 4).toString("ascii") !== "PACK") {
    return { objectsBySha, commits, trees, blobs, files: [] };
  }

  const numObjects = packBuf.readUInt32BE(8);
  let offset = 12;

  interface PendingDelta {
    objOffset: number;
    baseType: "ofs" | "ref";
    baseOffset?: number;
    baseSha?: string;
    deltaData: Buffer;
  }
  const pendingDeltas: PendingDelta[] = [];

  for (let i = 0; i < numObjects; i++) {
    const objStart = offset;
    let b = packBuf[offset++]!;
    const type = (b >> 4) & 7;
    let size = b & 0x0f;
    let shift = 4;
    while (b & 0x80) {
      b = packBuf[offset++]!;
      size |= (b & 0x7f) << shift;
      shift += 7;
    }
    void size;

    if (type >= 1 && type <= 4) {
      const res = inflateSync(packBuf.subarray(offset), { info: true });
      offset += (res as unknown as { engine: { bytesWritten: number } }).engine.bytesWritten;
      const raw = Buffer.from(res.buffer);
      const typeName = type === 1 ? "commit" : type === 2 ? "tree" : type === 3 ? "blob" : "tag";
      const header = Buffer.from(`${typeName} ${raw.length}\0`);
      const sha = createHash("sha1").update(Buffer.concat([header, raw])).digest("hex");
      const obj: GitRawObject = { type, raw, sha };
      objectsBySha.set(sha, obj);
      objectsByOffset.set(objStart, obj);
    } else if (type === 6) {
      let byte = packBuf[offset++]!;
      let relOffset = byte & 0x7f;
      while (byte & 0x80) {
        byte = packBuf[offset++]!;
        relOffset = ((relOffset + 1) << 7) | (byte & 0x7f);
      }
      const baseOffset = objStart - relOffset;
      const res = inflateSync(packBuf.subarray(offset), { info: true });
      offset += (res as unknown as { engine: { bytesWritten: number } }).engine.bytesWritten;
      pendingDeltas.push({ objOffset: objStart, baseType: "ofs", baseOffset, deltaData: Buffer.from(res.buffer) });
    } else if (type === 7) {
      const baseSha = packBuf.subarray(offset, offset + 20).toString("hex");
      offset += 20;
      const res = inflateSync(packBuf.subarray(offset), { info: true });
      offset += (res as unknown as { engine: { bytesWritten: number } }).engine.bytesWritten;
      pendingDeltas.push({ objOffset: objStart, baseType: "ref", baseSha, deltaData: Buffer.from(res.buffer) });
    }
  }

  let progress = true;
  while (pendingDeltas.length > 0 && progress) {
    progress = false;
    for (let j = 0; j < pendingDeltas.length; j++) {
      const delta = pendingDeltas[j]!;
      const base = delta.baseType === "ofs"
        ? objectsByOffset.get(delta.baseOffset!)
        : objectsBySha.get(delta.baseSha!);
      if (base) {
        const resolvedRaw = applyGitDelta(base.raw, delta.deltaData);
        const typeName = base.type === 1 ? "commit" : base.type === 2 ? "tree" : base.type === 3 ? "blob" : "tag";
        const header = Buffer.from(`${typeName} ${resolvedRaw.length}\0`);
        const sha = createHash("sha1").update(Buffer.concat([header, resolvedRaw])).digest("hex");
        const resolvedObj: GitRawObject = { type: base.type, raw: resolvedRaw, sha };
        objectsBySha.set(sha, resolvedObj);
        objectsByOffset.set(delta.objOffset, resolvedObj);
        pendingDeltas.splice(j, 1);
        progress = true;
        break;
      }
    }
  }

  for (const obj of objectsBySha.values()) {
    if (obj.type === 1) {
      const parsed = parseCommitObject(obj.raw);
      commits.set(obj.sha, { ...parsed, sha: obj.sha });
    } else if (obj.type === 2) {
      trees.set(obj.sha, parseTreeObject(obj.raw));
    } else if (obj.type === 3) {
      blobs.set(obj.sha, obj.raw);
    }
  }

  function collectTreeFiles(treeSha: string, prefix: string = ""): Array<{ path: string; content: string }> {
    const entries = trees.get(treeSha);
    if (!entries) return [];
    const filesList: Array<{ path: string; content: string }> = [];
    for (const entry of entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.mode === "40000" || entry.mode === "040000") {
        filesList.push(...collectTreeFiles(entry.sha, fullPath));
      } else {
        const blobBuf = blobs.get(entry.sha);
        if (blobBuf !== undefined) {
          filesList.push({ path: fullPath, content: blobBuf.toString("utf8") });
        }
      }
    }
    return filesList;
  }

  const files: Array<{ path: string; content: string }> = [];
  for (const commit of commits.values()) {
    const commitFiles = collectTreeFiles(commit.treeSha);
    for (const f of commitFiles) {
      if (!files.some((x) => x.path === f.path)) {
        files.push(f);
      }
    }
  }

  if (files.length === 0) {
    for (const treeSha of trees.keys()) {
      const treeFiles = collectTreeFiles(treeSha);
      for (const f of treeFiles) {
        if (!files.some((x) => x.path === f.path)) {
          files.push(f);
        }
      }
    }
  }

  return { objectsBySha, commits, trees, blobs, files };
}
