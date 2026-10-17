import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

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
