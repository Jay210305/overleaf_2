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

async function scanZipArchive(
  input: Uint8Array,
  retainBytes: boolean,
): Promise<{ manifest: ImportManifest; files: Map<string, Buffer> }> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
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
  const directories = new Set<string>();
  const filePaths = new Set<string>();
  const entries: ImportManifestEntry[] = [];
  const files = new Map<string, Buffer>();
  const totalUsed = { value: 0 };
  let nodes = 0;
  try {
    for await (const entry of zipfile.eachEntry()) {
      const { path, directory } = normalizeArchivePath(decodeName(entry.fileNameRaw), seen);
      if (directory) {
        if (filePaths.has(path)) throw new ZipValidationError("UNSAFE_PATH");
        if (!directories.has(path)) {
          directories.add(path);
          nodes += 1;
        }
        if (nodes > maxArchiveNodes) throw new ZipValidationError("LIMIT_EXCEEDED");
        entries.push({ path: `${path}/`, kind: "DIRECTORY" });
        continue;
      }
      if (directories.has(path)) throw new ZipValidationError("UNSAFE_PATH");
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
      nodes += 1;
      filePaths.add(path);
      const parts = path.split("/").slice(0, -1);
      for (let depth = 1; depth <= parts.length; depth++) {
        const ancestor = parts.slice(0, depth).join("/");
        if (filePaths.has(ancestor)) throw new ZipValidationError("UNSAFE_PATH");
        if (!directories.has(ancestor)) {
          directories.add(ancestor);
          nodes += 1;
        }
      }
      if (nodes > maxArchiveNodes) throw new ZipValidationError("LIMIT_EXCEEDED");
      entries.push({ path, kind: policy.kind, mime: policy.mime, size: data.length, sha256 });
      if (retainBytes) files.set(path, data);
    }
  } catch (error) {
    if (error instanceof ZipValidationError) throw error;
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  if (entries.length === 0) throw new ZipValidationError("INVALID_ARCHIVE");
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return { manifest: { version: 1, entries }, files };
}

/** Private bounded ZIP validator; never writes project state or source bytes. */
export async function validateZipArchive(input: Uint8Array): Promise<ImportManifest> {
  return (await scanZipArchive(input, false)).manifest;
}

/** Re-validate and materialize source bytes only when the manifest still matches. */
export async function readArchiveForApply(
  input: Uint8Array,
  expected: ImportManifest,
): Promise<Map<string, Buffer>> {
  const scanned = await scanZipArchive(input, true);
  if (
    expected?.version !== 1 ||
    !Array.isArray(expected.entries) ||
    expected.entries.length !== scanned.manifest.entries.length ||
    !expected.entries.every((entry, index) => {
      const actual = scanned.manifest.entries[index];
      if (!actual || entry.path !== actual.path || entry.kind !== actual.kind) return false;
      if (entry.kind === "DIRECTORY" || actual.kind === "DIRECTORY") {
        return entry.kind === "DIRECTORY" && actual.kind === "DIRECTORY";
      }
      return (
        entry.mime === actual.mime && entry.size === actual.size && entry.sha256 === actual.sha256
      );
    })
  ) {
    throw new ZipValidationError("INVALID_ARCHIVE");
  }
  return scanned.files;
}
