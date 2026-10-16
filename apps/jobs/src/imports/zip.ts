import { createHash } from "node:crypto";
import * as yauzl from "yauzl";
import {
  classifyArchivePath,
  maxArchiveNodes,
  maxEntryExpansionRatio,
  maxExpandedBytes,
  maxFileBytes,
  verifyBinaryContent,
  verifyTextContent,
  ContentPolicyError,
} from "@latex-collab/storage";
import type {
  ImportManifest,
  ImportManifestEntry,
} from "@latex-collab/db/repositories/import-jobs";

export type ZipValidationCode = "UNSAFE_PATH" | "LIMIT_EXCEEDED" | "INVALID_ARCHIVE";

const statusFor: Record<ZipValidationCode, 400 | 413 | 422> = {
  UNSAFE_PATH: 400,
  LIMIT_EXCEEDED: 413,
  INVALID_ARCHIVE: 422,
};

export class ZipValidationError extends Error {
  readonly code: ZipValidationCode;
  readonly status: 400 | 413 | 422;

  constructor(code: ZipValidationCode) {
    super(code);
    this.name = "ZipValidationError";
    this.code = code;
    this.status = statusFor[code];
  }
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeName(raw: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
}

/** Archive path rules: traversal, absolute, encoded and duplicate names are 400. */
function normalizeArchivePath(
  rawName: string,
  seen: Set<string>,
): { path: string; directory: boolean } {
  const directory = rawName.endsWith("/");
  const trimmed = directory ? rawName.slice(0, -1) : rawName;
  if (trimmed === "" || trimmed !== trimmed.normalize("NFC")) {
    throw new ZipValidationError("UNSAFE_PATH");
  }
  if (
    trimmed.includes("\\") ||
    trimmed.includes("\0") ||
    /[^\x20-\x7e\u00a0-\u{10ffff}]/u.test(trimmed) ||
    trimmed.startsWith("/") ||
    /^[A-Za-z]:\//.test(trimmed) ||
    /%(?:2e|2f|5c|00)/i.test(trimmed)
  ) {
    throw new ZipValidationError("UNSAFE_PATH");
  }
  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new ZipValidationError("UNSAFE_PATH");
    }
  }
  try {
    const decoded = decodeURIComponent(trimmed);
    if (
      decoded !== trimmed &&
      (decoded.includes("..") || decoded.startsWith("/") || decoded.includes("\\"))
    ) {
      throw new ZipValidationError("UNSAFE_PATH");
    }
  } catch {
    // Malformed percent sequences stay literal; the pattern check above stands.
  }
  if (seen.has(trimmed)) throw new ZipValidationError("UNSAFE_PATH");
  seen.add(trimmed);
  return { path: trimmed, directory };
}

function checkRegularFile(entry: yauzl.Entry): void {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0o170000;
  if (unixMode !== 0 && unixMode !== 0o100000) {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
}

async function readEntryBytes(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
  totalUsed: { value: number },
): Promise<Buffer> {
  if (entry.uncompressedSize > entry.compressedSize * maxEntryExpansionRatio) {
    throw new ZipValidationError("LIMIT_EXCEEDED");
  }
  if (entry.compressedSize === 0 && entry.uncompressedSize > 0) {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  const stream = await zipfile.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      totalUsed.value += bytes.length;
      if (size > maxFileBytes || totalUsed.value > maxExpandedBytes) {
        throw new ZipValidationError("LIMIT_EXCEEDED");
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof ZipValidationError) {
      stream.destroy();
      throw error;
    }
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  const data = Buffer.concat(chunks, size);
  if (data.length !== entry.uncompressedSize || crc32(data) !== entry.crc32 >>> 0) {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  return data;
}

/**
 * Private bounded ZIP validator. Reads only the central directory for
 * metadata, streams each entry once with independent byte counters, and
 * returns a versioned manifest with hashes but no source bytes. It writes
 * no project, node or text rows. Never called with a filesystem path.
 */
export async function validateZipArchive(input: Uint8Array): Promise<ImportManifest> {
  const { manifest } = await scanArchive(input, false);
  return manifest;
}

function manifestsEqual(
  actual: ImportManifest,
  expected: ImportManifest,
): boolean {
  if (expected?.version !== 1 || actual.version !== 1) return false;
  if (!Array.isArray(expected.entries) || actual.entries.length !== expected.entries.length) {
    return false;
  }
  for (let index = 0; index < actual.entries.length; index++) {
    const left = actual.entries[index]!;
    const right = expected.entries[index]!;
    if (left.path !== right.path || left.kind !== right.kind) return false;
    // JSONB round-trips reorder object keys, so compare field by field.
    if (left.kind === "DIRECTORY" || right.kind === "DIRECTORY") {
      if (left.kind !== "DIRECTORY" || right.kind !== "DIRECTORY") return false;
      continue;
    }
    if (
      left.mime !== right.mime ||
      left.size !== right.size ||
      left.sha256 !== right.sha256
    ) {
      return false;
    }
  }
  return true;
}

/**
 * A validated file path must never block another entry's folder: `notes.tex`
 * as a file plus `notes.tex/extra.tex` passes the name scan but cannot be
 * applied without destroying one of them.
 */
function assertNoPathCollisions(entries: ImportManifestEntry[]): void {
  const filePaths = entries.filter((entry) => entry.kind !== "DIRECTORY").map((entry) => entry.path);
  for (const filePath of filePaths) {
    const prefix = `${filePath}/`;
    for (const entry of entries) {
      if (entry.path !== filePath && entry.path.startsWith(prefix)) {
        throw new ZipValidationError("INVALID_ARCHIVE");
      }
    }
  }
}

/**
 * Reopens a validated archive and returns exact file bytes keyed by archive
 * path. The scan reproduces the validator's manifest from the current bytes
 * and compares it field by field against the expected manifest, so bytes
 * replaced after validation or a tampered manifest fail with no partial map.
 * Directory entries are structural only and never returned as files.
 */
export async function readArchiveForApply(
  input: Uint8Array,
  expected: ImportManifest,
): Promise<Map<string, Buffer>> {
  const { manifest, files } = await scanArchive(input, true);
  if (!manifestsEqual(manifest, expected)) {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  assertNoPathCollisions(manifest.entries);
  return files;
}
/**
 * Shared bounded entry scan. With `collect` it also retains exact file bytes;
 * otherwise only the manifest is produced. Callers must compare the manifest
 * before trusting retained bytes.
 */
async function scanArchive(
  input: Uint8Array,
  collect: boolean,
): Promise<{ manifest: ImportManifest; files: Map<string, Buffer> }> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const files = new Map<string, Buffer>();
  let zipfile: yauzl.ZipFile;
  try {
    zipfile = await yauzl.fromBufferPromise(bytes, {
      lazyEntries: true,
      validateEntrySizes: true,
      decodeStrings: false,
    });
  } catch {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  const seen = new Set<string>();
  const implied = new Set<string>();
  const entries: ImportManifestEntry[] = [];
  const totalUsed = { value: 0 };
  let nodes = 0;
  try {
    for await (const entry of zipfile.eachEntry()) {
      const { path, directory } = normalizeArchivePath(decodeName(entry.fileNameRaw), seen);
      if (directory) {
        nodes += 1;
        if (nodes > maxArchiveNodes) throw new ZipValidationError("LIMIT_EXCEEDED");
        entries.push({ path: `${path}/`, kind: "DIRECTORY" });
        continue;
      }
      if (entry.isEncrypted() || !entry.canDecodeFileData()) {
        throw new ZipValidationError("INVALID_ARCHIVE");
      }
      checkRegularFile(entry);
      if (path.toLowerCase().endsWith(".zip")) {
        throw new ZipValidationError("INVALID_ARCHIVE");
      }
      let policy: { kind: "TEXT" | "BINARY"; mime: string };
      try {
        policy = classifyArchivePath(path);
      } catch (error) {
        if (error instanceof ContentPolicyError) throw new ZipValidationError("INVALID_ARCHIVE");
        throw error;
      }
      const data = await readEntryBytes(zipfile, entry, totalUsed);
      try {
        if (policy.kind === "TEXT") verifyTextContent(data);
        else verifyBinaryContent(path, data);
      } catch (error) {
        if (error instanceof ContentPolicyError) throw new ZipValidationError("INVALID_ARCHIVE");
        throw error;
      }
      const sha256 = createHash("sha256").update(data).digest("hex");
      if (collect) files.set(path, data);
      nodes += 1;
      const ancestors: string[] = [];
      const parts = path.split("/").slice(0, -1);
      for (let depth = 1; depth <= parts.length; depth++) {
        const ancestor = parts.slice(0, depth).join("/");
        if (!seen.has(ancestor) && !implied.has(ancestor)) {
          implied.add(ancestor);
          ancestors.push(ancestor);
        }
      }
      nodes += ancestors.length;
      if (nodes > maxArchiveNodes) throw new ZipValidationError("LIMIT_EXCEEDED");
      entries.push({ path, kind: policy.kind, mime: policy.mime, size: data.length, sha256 });
    }
  } catch (error) {
    if (error instanceof ZipValidationError) throw error;
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  if (entries.length === 0) throw new ZipValidationError("INVALID_ARCHIVE");
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return { manifest: { version: 1, entries }, files };
}
