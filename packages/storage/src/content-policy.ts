import { isUUID } from "@latex-collab/db";
import { StorageSecurityError } from "./s3.js";

/**
 * Server-only shared upload content policy. It is consumed by the S05-T01
 * project-file upload routes and the S05-T03 ZIP validator so both paths
 * enforce the same extension/MIME pairs, byte limits and binary signatures.
 * This module must never be imported by browser code.
 */

export const maxFileBytes = 100 * 1024 * 1024;
export const maxProjectBytes = 500 * 1024 * 1024;
export const maxProjectNodes = 2000;
export const maxArchiveBytes = 200 * 1024 * 1024;
export const maxExpandedBytes = 500 * 1024 * 1024;
export const maxArchiveNodes = 2000;
export const maxEntryExpansionRatio = 100;

export type UploadContentKind = "TEXT" | "BINARY";

export class ContentPolicyError extends Error {
  readonly status: 400 | 413 | 422;
  readonly code: "VALIDATION_ERROR" | "QUOTA_EXCEEDED" | "UNSUPPORTED_CONTENT";

  constructor(
    status: 400 | 413 | 422,
    code: "VALIDATION_ERROR" | "QUOTA_EXCEEDED" | "UNSUPPORTED_CONTENT",
  ) {
    super(code);
    this.name = "ContentPolicyError";
    this.status = status;
    this.code = code;
  }
}

type ExtensionPolicy = { kind: UploadContentKind; mime: string };

const extensionPolicy: Record<string, ExtensionPolicy> = {
  ".tex": { kind: "TEXT", mime: "application/x-tex" },
  ".bib": { kind: "TEXT", mime: "application/x-bibtex" },
  ".sty": { kind: "TEXT", mime: "application/x-tex" },
  ".cls": { kind: "TEXT", mime: "application/x-tex" },
  ".bst": { kind: "TEXT", mime: "application/x-tex" },
  // Overleaf projects routinely ship these alongside TeX sources.
  ".tikz": { kind: "TEXT", mime: "application/x-tex" },
  ".txt": { kind: "TEXT", mime: "text/plain" },
  ".eps": { kind: "BINARY", mime: "application/postscript" },
  ".png": { kind: "BINARY", mime: "image/png" },
  ".jpg": { kind: "BINARY", mime: "image/jpeg" },
  ".jpeg": { kind: "BINARY", mime: "image/jpeg" },
  ".pdf": { kind: "BINARY", mime: "application/pdf" },
  ".ttf": { kind: "BINARY", mime: "font/ttf" },
  ".otf": { kind: "BINARY", mime: "font/otf" },
};

const acceptedMimes: Record<string, string[]> = {
  ".tex": ["application/x-tex", "text/x-tex", "text/plain"],
  ".bib": ["application/x-bibtex", "text/plain"],
  ".sty": ["application/x-tex", "text/plain"],
  ".cls": ["application/x-tex", "text/plain"],
  ".bst": ["application/x-tex", "text/plain"],
  ".tikz": ["application/x-tex", "text/plain"],
  ".txt": ["text/plain"],
  ".eps": ["application/postscript", "application/eps", "image/eps", "application/x-eps"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".pdf": ["application/pdf"],
  ".ttf": ["font/ttf"],
  ".otf": ["font/otf"],
};

function policyFor(name: string): ExtensionPolicy {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const policy = extension === "" ? undefined : extensionPolicy[extension];
  if (!policy) throw new ContentPolicyError(422, "UNSUPPORTED_CONTENT");
  return policy;
}

/** S05-T01 presign check: extension/MIME pair for a declared upload. */
export function classifyUploadContent(name: string, mime: string): UploadContentKind {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const accepted = extension === "" ? undefined : acceptedMimes[extension];
  const policy = extension === "" ? undefined : extensionPolicy[extension];
  if (!policy || !accepted || !accepted.includes(mime)) {
    throw new ContentPolicyError(422, "UNSUPPORTED_CONTENT");
  }
  return policy.kind;
}

/** S05-T03 archive check: canonical kind/MIME derived from the entry path. */
export function classifyArchivePath(path: string): { kind: UploadContentKind; mime: string } {
  const policy = policyFor(path);
  return { kind: policy.kind, mime: policy.mime };
}

/** Strict UTF-8 text check shared by uploads and archive entries. */
export function verifyTextContent(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ContentPolicyError(422, "UNSUPPORTED_CONTENT");
  }
  if (text.includes("\0")) throw new ContentPolicyError(422, "UNSUPPORTED_CONTENT");
  return text;
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngCrcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});

function pngCrc(bytes: Buffer, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index++)
    crc = pngCrcTable[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validPng(bytes: Buffer): boolean {
  if (bytes.length < 57 || !bytes.subarray(0, 8).equals(pngSignature)) return false;
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return false;
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return false;
    if (pngCrc(bytes, offset + 4, offset + 8 + length) !== bytes.readUInt32BE(offset + 8 + length))
      return false;
    if (!sawHeader) {
      if (type !== "IHDR" || length !== 13) return false;
      if (bytes.readUInt32BE(offset + 8) === 0 || bytes.readUInt32BE(offset + 12) === 0)
        return false;
      sawHeader = true;
    } else if (type === "IHDR") {
      return false;
    }
    if (type === "IDAT") sawData = true;
    if (type === "IEND") return length === 0 && sawData && end === bytes.length;
    offset = end;
  }
  return false;
}

/** Binary signature check shared by uploads and archive entries. */
export function verifyBinaryContent(name: string, bytes: Uint8Array): void {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  let valid = false;
  if (extension === ".png") {
    valid = validPng(buffer);
  } else if (extension === ".jpg" || extension === ".jpeg") {
    valid =
      buffer.length >= 4 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff &&
      buffer.subarray(-2).equals(Buffer.from([0xff, 0xd9]));
  } else if (extension === ".eps") {
    // Accept plain PostScript headers and DOS EPS binaries (C5 D0 D3 C6).
    const dosEps =
      buffer.length >= 4 &&
      buffer[0] === 0xc5 &&
      buffer[1] === 0xd0 &&
      buffer[2] === 0xd3 &&
      buffer[3] === 0xc6;
    valid = (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%!PS") || dosEps;
  } else if (extension === ".pdf") {
    valid =
      buffer.length >= 12 &&
      buffer.subarray(0, 5).toString("ascii") === "%PDF-" &&
      buffer.subarray(-1024).includes(Buffer.from("%%EOF"));
  } else if (extension === ".ttf") {
    valid = buffer.length >= 12 && buffer.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0]));
  } else if (extension === ".otf") {
    valid = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "OTTO";
  }
  if (!valid) throw new ContentPolicyError(422, "UNSUPPORTED_CONTENT");
}

/** Deterministic server-only keys for the S05-T12 intake (S05-T03 owns the job row). */
export function buildImportUploadKey(actorId: string, uploadId: string): string {
  if (!isUUID(actorId) || !isUUID(uploadId)) {
    throw new StorageSecurityError("Import staging key requires actor and upload UUIDs");
  }
  return `imports/${actorId}/uploads/${uploadId}`;
}

export function buildImportArchiveKey(actorId: string, jobId: string): string {
  if (!isUUID(actorId) || !isUUID(jobId)) {
    throw new StorageSecurityError("Import archive key requires actor and job UUIDs");
  }
  return `imports/${actorId}/jobs/${jobId}/source.zip`;
}

/** Actor scope for import keys. Callers must never accept a client key. */
export function assertImportKeyScope(key: string, actorId: string): void {
  if (!isUUID(actorId)) {
    throw new StorageSecurityError("Import scope requires an actor UUID");
  }
  if (!key.startsWith(`imports/${actorId}/`)) {
    throw new StorageSecurityError("Import object is outside the authorized actor scope");
  }
}
