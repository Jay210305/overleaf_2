import { createHash } from "node:crypto";
import * as Y from "yjs";
import {
  assertUUID,
  type DatabaseClient,
} from "@latex-collab/db";
import {
  maxArchiveNodes,
  maxExpandedBytes,
  maxFileBytes,
  type StorageAdapter,
} from "@latex-collab/storage";

export type SourceExportErrorCode = "NOT_FOUND" | "LIMIT_EXCEEDED" | "INVALID_STATE";

const statusFor: Record<SourceExportErrorCode, 404 | 413 | 422> = {
  NOT_FOUND: 404,
  LIMIT_EXCEEDED: 413,
  INVALID_STATE: 422,
};

/** Export failures carry an HTTP-style status without leaking internals. */
export class SourceExportError extends Error {
  readonly code: SourceExportErrorCode;
  readonly status: 404 | 413 | 422;

  constructor(code: SourceExportErrorCode) {
    super(code);
    this.name = "SourceExportError";
    this.status = statusFor[code];
  }
}

export type SourceExportRequest = {
  projectId: string;
  actorId: string;
  revisionNo: number;
};

export type SourceExportFile = {
  path: string;
  sha256: string;
  sizeBytes: number;
};

export type SourceExportResult = {
  bytes: Buffer;
  revisionNo: number;
  files: SourceExportFile[];
  manifestHash: string;
};

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

/** Fixed DOS timestamp (1980-01-01) so one revision always yields one byte stream. */
const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 33;
const UTF8_FLAG = 0x0800;

type ZipEntry = { name: Buffer; data: Buffer };

function encodeZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30 + entry.name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(FIXED_DOS_TIME, 10);
    local.writeUInt16LE(FIXED_DOS_DATE, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(entry.data.length >>> 0, 18);
    local.writeUInt32LE(entry.data.length >>> 0, 22);
    local.writeUInt16LE(entry.name.length, 26);
    local.writeUInt16LE(0, 28);
    entry.name.copy(local, 30);
    chunks.push(local, entry.data);
    const header = Buffer.alloc(46 + entry.name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_FLAG, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(FIXED_DOS_TIME, 12);
    header.writeUInt16LE(FIXED_DOS_DATE, 14);
    header.writeUInt32LE(crc >>> 0, 16);
    header.writeUInt32LE(entry.data.length >>> 0, 20);
    header.writeUInt32LE(entry.data.length >>> 0, 24);
    header.writeUInt16LE(entry.name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset >>> 0, 42);
    entry.name.copy(header, 46);
    central.push(header);
    offset += local.length + entry.data.length;
  }
  const centralStart = offset;
  const centralBytes = Buffer.concat(central);
  chunks.push(centralBytes);
  offset += centralBytes.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);
  return Buffer.concat(chunks);
}

/** Revision paths come from validated node names; anything else is corruption. */
function checkExportPath(path: string): void {
  if (!path || path.startsWith("/") || path.includes("\\") || path !== path.normalize("NFC")) {
    throw new SourceExportError("INVALID_STATE");
  }
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new SourceExportError("INVALID_STATE");
    }
  }
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function replayText(
  db: DatabaseClient,
  fileId: string,
): Promise<Buffer> {
  const updates = await db.query<{ payload_bytes: Buffer }>(
    "SELECT payload_bytes FROM crdt_updates WHERE file_id = $1 ORDER BY seq ASC",
    [fileId],
  );
  const doc = new Y.Doc();
  try {
    for (const row of updates.rows) {
      Y.applyUpdate(doc, new Uint8Array(row.payload_bytes));
    }
    return Buffer.from(doc.getText("content").toString(), "utf8");
  } finally {
    doc.destroy();
  }
}

/**
 * Builds a deterministic immutable source ZIP for one frozen revision. Only
 * authorized manifest paths are included: the tree comes from the revision
 * row, TEXT bytes from canonical Yjs replay and BINARY bytes from verified
 * content-addressed objects. Foreign, trashed or missing projects and
 * unknown revisions read as 404; the revision's text reflects canonical
 * state observed during export (single-actor G1 flow; concurrent
 * modification between checkpoint and export is out of scope).
 */
export async function buildSourceZip(
  db: DatabaseClient,
  storage: StorageAdapter,
  input: SourceExportRequest,
): Promise<SourceExportResult> {
  try {
    assertUUID(input.projectId, "projectId");
    assertUUID(input.actorId, "actorId");
  } catch {
    throw new SourceExportError("NOT_FOUND");
  }
  if (!Number.isSafeInteger(input.revisionNo) || input.revisionNo < 1) {
    throw new SourceExportError("NOT_FOUND");
  }

  const projRes = await db.query<{ owner_id: string; status: string }>(
    "SELECT owner_id, status FROM projects WHERE id = $1",
    [input.projectId],
  );
  const proj = projRes.rows[0];
  if (!proj || proj.status === "trashed") throw new SourceExportError("NOT_FOUND");
  if (proj.owner_id !== input.actorId) {
    const memberRes = await db.query<{ role: string }>(
      "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
      [input.projectId, input.actorId],
    );
    if (!memberRes.rows[0]) throw new SourceExportError("NOT_FOUND");
  }

  const revRes = await db.query<{ id: string }>(
    "SELECT id FROM project_revisions WHERE project_id = $1 AND revision_no = $2",
    [input.projectId, input.revisionNo],
  );
  const revision = revRes.rows[0];
  if (!revision) throw new SourceExportError("NOT_FOUND");

  const itemsRes = await db.query<{ node_id: string; path: string; blob_key: string }>(
    `SELECT node_id, path, blob_key FROM revision_items
      WHERE revision_id = $1 AND deleted = FALSE ORDER BY path ASC`,
    [revision.id],
  );
  if (itemsRes.rows.length > maxArchiveNodes) throw new SourceExportError("LIMIT_EXCEEDED");

  const nodeRes = await db.query<{ id: string; content_kind: string; mime: string }>(
    "SELECT id, content_kind, mime FROM project_nodes WHERE project_id = $1",
    [input.projectId],
  );
  const kinds = new Map(nodeRes.rows.map((row) => [row.id, row]));

  const entries: ZipEntry[] = [];
  const files: SourceExportFile[] = [];
  const dirs = new Set<string>();
  let totalBytes = 0;

  for (const item of itemsRes.rows) {
    checkExportPath(item.path);
    const node = kinds.get(item.node_id);
    if (!node || (node.content_kind !== "TEXT" && node.content_kind !== "BINARY")) {
      throw new SourceExportError("INVALID_STATE");
    }
    let data: Buffer;
    if (node.content_kind === "TEXT") {
      data = await replayText(db, item.node_id);
    } else {
      let raw: Uint8Array;
      try {
        raw = await storage.getLimited(item.blob_key, maxFileBytes);
      } catch {
        throw new SourceExportError("INVALID_STATE");
      }
      data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      const contentHash = digest(data);
      if (item.blob_key !== `projects/${input.projectId}/blobs/${contentHash}`) {
        throw new SourceExportError("INVALID_STATE");
      }
    }
    if (data.length > maxFileBytes) throw new SourceExportError("LIMIT_EXCEEDED");
    totalBytes += data.length;
    if (totalBytes > maxExpandedBytes) throw new SourceExportError("LIMIT_EXCEEDED");
    const sha256 = digest(data);
    entries.push({ name: Buffer.from(item.path, "utf8"), data });
    files.push({ path: item.path, sha256, sizeBytes: data.length });
    const parts = item.path.split("/").slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth++) {
      dirs.add(`${parts.slice(0, depth).join("/")}/`);
    }
  }

  const dirEntries: ZipEntry[] = [...dirs]
    .sort()
    .map((dir) => ({ name: Buffer.from(dir, "utf8"), data: Buffer.alloc(0) }));
  if (entries.length + dirEntries.length > maxArchiveNodes) {
    throw new SourceExportError("LIMIT_EXCEEDED");
  }
  const bytes = encodeZip([...dirEntries, ...entries]);
  const manifestHash = digest(
    JSON.stringify(files.map((file) => [file.path, file.sha256, file.sizeBytes])),
  );
  return { bytes, revisionNo: input.revisionNo, files, manifestHash };
}
