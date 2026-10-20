import { unzipSync, zipSync } from "fflate";
import * as Y from "yjs";
import {
  treeViewSchema,
  uploadViewSchema,
  type ProjectNodeView,
  type TreeView,
} from "@latex-collab/contracts";

/**
 * Browser-side ZIP support for project import/export.
 *
 * Archives are only ever a transport: every extracted entry is uploaded
 * through the existing authorized presign/complete endpoints, so server-side
 * name, quota, content-policy, signature and revision checks stay in force.
 * Nothing here is trusted by the API.
 */

const maxArchiveBytes = 200 * 1024 * 1024;
const maxFileBytes = 100 * 1024 * 1024;
const maxExpandedBytes = 500 * 1024 * 1024;
const maxEntries = 2000;

const ignoredPathSegments = new Set([".git", "__MACOSX", ".DS_Store", "Thumbs.db"]);

type UploadPolicy = { kind: "TEXT" | "BINARY"; mime: string };

/** Mirrors the server upload content policy (packages/storage/content-policy). */
const extensionPolicy: Record<string, UploadPolicy> = {
  ".tex": { kind: "TEXT", mime: "application/x-tex" },
  ".bib": { kind: "TEXT", mime: "application/x-bibtex" },
  ".sty": { kind: "TEXT", mime: "application/x-tex" },
  ".cls": { kind: "TEXT", mime: "application/x-tex" },
  ".bst": { kind: "TEXT", mime: "application/x-tex" },
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

export interface ZipFileEntry {
  path: string;
  bytes: Uint8Array;
}

export interface ExtractedArchive {
  entries: ZipFileEntry[];
  /** Entries intentionally dropped (unsupported extension or archive noise). */
  skipped: string[];
  /** Root folder that was stripped from every path, if any. */
  strippedRoot: string | null;
}

export interface ZipImportProgress {
  phase: "extracting" | "folders" | "uploading" | "done";
  completed: number;
  total: number;
  currentPath?: string | undefined;
}

export interface ZipImportFailure {
  path: string;
  message: string;
}

export interface ZipImportResult {
  uploaded: number;
  skippedExisting: number;
  /** Entries the server refused or that failed mid-upload; the import continues. */
  failed: ZipImportFailure[];
}

const supportedSummary =
  ".tex, .bib, .sty, .cls, .bst, .tikz, .txt, .png, .jpg, .jpeg, .eps, .pdf, .ttf, .otf";

/**
 * Overleaf and older desktop editors export TeX sources as UTF-8 or as
 * Windows-1252/Latin-1. The API only stores strict UTF-8 text, so legacy
 * bytes are transcoded here instead of being rejected (which used to abort a
 * whole archive import on the first accented file).
 */
function normalizeTextEntry(bytes: Uint8Array): Uint8Array | null {
  let body = bytes;
  if (body.length >= 3 && body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) {
    body = body.subarray(3);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    try {
      text = new TextDecoder("windows-1252", { fatal: true }).decode(body);
    } catch {
      return null;
    }
  }
  if (text.includes("\0")) return null;
  return Uint8Array.from(new TextEncoder().encode(text));
}

export function policyForPath(path: string): UploadPolicy | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  return extensionPolicy[name.slice(dot).toLowerCase()] ?? null;
}

function normalizeEntryPath(raw: string): string | null {
  // macOS archives store decomposed (NFD) names; normalize instead of dropping
  // accented files produced on a Mac.
  const forward = raw.replace(/\\/g, "/").replace(/^\.\//, "").normalize("NFC");
  if (!forward || forward.endsWith("/")) return null;
  if (forward.startsWith("/") || /^[A-Za-z]:\//.test(forward) || forward.includes("\0")) {
    return null;
  }
  const segments = forward.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".."))
    return null;
  if (segments.some((segment) => ignoredPathSegments.has(segment))) return null;
  if (/[\u0000-\u001f\u007f]/.test(forward)) return null;
  return segments.join("/");
}

/**
 * Reads a `.zip` selected by the user. Entry metadata is bounded before
 * inflation (count, per-entry and total expanded bytes), and only paths the
 * server upload policy accepts survive.
 */
export function extractArchive(archive: Uint8Array): ExtractedArchive {
  if (archive.length === 0) throw new Error("The selected archive is empty.");
  if (archive.length > maxArchiveBytes) {
    throw new Error("The selected archive exceeds the 200 MiB ZIP limit.");
  }

  const skipped: string[] = [];
  let count = 0;
  let expanded = 0;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(archive, {
      filter: (file) => {
        const path = normalizeEntryPath(file.name);
        if (!path) return false;
        if (!policyForPath(path)) {
          skipped.push(path);
          return false;
        }
        if (file.originalSize > maxFileBytes) {
          throw new Error(`"${path}" exceeds the 100 MiB per-file limit.`);
        }
        count += 1;
        expanded += file.originalSize;
        if (count > maxEntries) throw new Error("The archive contains more than 2000 files.");
        if (expanded > maxExpandedBytes) {
          throw new Error("The archive expands beyond the 500 MiB project limit.");
        }
        return true;
      },
    });
  } catch (cause) {
    if (cause instanceof Error && /limit|archive contains|exceeds/i.test(cause.message)) {
      throw cause;
    }
    throw new Error("This file is not a readable ZIP archive.");
  }

  const entries = new Map<string, Uint8Array>();
  let realExpanded = 0;
  for (const [name, bytes] of Object.entries(raw)) {
    const path = normalizeEntryPath(name);
    if (!path) continue;
    const policy = policyForPath(path);
    if (!policy) continue;
    // Central-directory sizes can be omitted by streaming zip writers, so the
    // byte limits are enforced again on the inflated payload.
    if (bytes.length > maxFileBytes) {
      throw new Error(`"${path}" exceeds the 100 MiB per-file limit.`);
    }
    realExpanded += bytes.length;
    if (realExpanded > maxExpandedBytes) {
      throw new Error("The archive expands beyond the 500 MiB project limit.");
    }
    if (policy.kind === "TEXT") {
      const normalized = normalizeTextEntry(bytes);
      if (!normalized) {
        skipped.push(path);
        continue;
      }
      entries.set(path, normalized);
      continue;
    }
    entries.set(path, bytes);
  }

  if (entries.size === 0) {
    throw new Error(
      `No supported project files were found in this archive. Supported types: ${supportedSummary}.`,
    );
  }

  // Overleaf exports usually wrap the project in a single top-level folder.
  const paths = [...entries.keys()];
  const roots = new Set(paths.map((path) => path.split("/")[0]));
  const hasNested = paths.some((path) => path.includes("/"));
  const strippedRoot = roots.size === 1 && hasNested ? [...roots][0]! : null;
  const finalEntries: ZipFileEntry[] = [];
  for (const [path, bytes] of entries) {
    const finalPath = strippedRoot ? path.slice(strippedRoot.length + 1) : path;
    if (!finalPath) continue;
    finalEntries.push({ path: finalPath, bytes });
  }
  finalEntries.sort((left, right) => left.path.localeCompare(right.path));

  return { entries: finalEntries, skipped, strippedRoot };
}

function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  return crypto.subtle
    .digest("SHA-256", copy.buffer)
    .then((digest) =>
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
}

function csrfFromSession(explicit?: string | null): string | null {
  if (explicit) return explicit;
  try {
    return sessionStorage.getItem("csrf_token");
  } catch {
    return null;
  }
}

async function readTree(apiUrl: string, projectId: string): Promise<TreeView> {
  const response = await fetch(`${apiUrl}/projects/${projectId}/nodes`, {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Could not read the project file tree. Refresh and try again.");
  }
  const parsed = treeViewSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("The project file tree response was invalid.");
  return parsed.data;
}

async function createFolder(
  apiUrl: string,
  projectId: string,
  csrf: string,
  name: string,
  parentId: string | null,
): Promise<ProjectNodeView> {
  const response = await fetch(`${apiUrl}/projects/${projectId}/nodes`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({
      name,
      parentId,
      kind: "FOLDER",
      mime: "application/x-directory",
      contentKind: "BINARY",
    }),
  });
  if (!response.ok) {
    if (response.status === 409) {
      throw new Error(`A file or folder named "${name}" already exists.`);
    }
    throw new Error(`Could not create the folder "${name}" (HTTP ${response.status}).`);
  }
  return (await response.json()) as ProjectNodeView;
}

async function deleteNode(
  apiUrl: string,
  projectId: string,
  csrf: string,
  nodeId: string,
): Promise<void> {
  const response = await fetch(`${apiUrl}/projects/${projectId}/nodes/${nodeId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { accept: "application/json", "x-csrf-token": csrf },
  });
  if (!response.ok) {
    throw new Error(`Could not replace the placeholder file (HTTP ${response.status}).`);
  }
}

async function uploadFile(
  apiUrl: string,
  projectId: string,
  csrf: string,
  parentId: string | null,
  fileName: string,
  mime: string,
  bytes: Uint8Array,
): Promise<void> {
  const hash = await sha256Hex(bytes);
  const presign = await fetch(`${apiUrl}/projects/${projectId}/uploads/presign`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({
      fileName,
      mime,
      sizeBytes: bytes.length,
      sha256: hash,
      parentId,
    }),
  });
  if (!presign.ok) {
    throw new Error(`Could not start the upload for "${fileName}" (HTTP ${presign.status}).`);
  }
  const signed = uploadViewSchema.parse(await presign.json());

  let put: Response;
  try {
    put = await fetch(signed.url, {
      method: "PUT",
      headers: { "content-type": mime },
      body: new Blob([bytes as BlobPart], { type: mime }),
    });
  } catch {
    throw new Error(
      `Direct upload of "${fileName}" to storage failed (network or CORS error). Verify bucket CORS configuration.`,
    );
  }
  if (!put.ok) {
    throw new Error(`Uploading "${fileName}" failed (HTTP ${put.status}).`);
  }

  const complete = await fetch(`${apiUrl}/projects/${projectId}/uploads/complete`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrf,
      "idempotency-key": `zip-import-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({ uploadId: signed.uploadId, sha256: hash }),
  });
  if (!complete.ok) {
    let message = `Finalizing "${fileName}" failed (HTTP ${complete.status}).`;
    try {
      const err = (await complete.json()) as { message?: string; detail?: string; code?: string };
      if (err?.message || err?.detail || err?.code) {
        message = `Finalizing "${fileName}" failed: ${err.message || err.detail || err.code} (HTTP ${complete.status}).`;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }
}

function parentPath(path: string): string | null {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? null : path.slice(0, slash);
}

function folderPathsFor(entries: ZipFileEntry[]): string[] {
  const folders = new Set<string>();
  for (const entry of entries) {
    const segments = entry.path.split("/");
    for (let depth = 1; depth < segments.length; depth++) {
      folders.add(segments.slice(0, depth).join("/"));
    }
  }
  return [...folders].sort(
    (left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right),
  );
}

/**
 * Adds extracted entries to an existing project, creating the folder tree and
 * uploading every file through the authorized upload endpoints.
 */
export async function importArchiveIntoProject(input: {
  apiUrl: string;
  projectId: string;
  csrfToken?: string | null | undefined;
  entries: ZipFileEntry[];
  onProgress?: ((progress: ZipImportProgress) => void) | undefined;
}): Promise<ZipImportResult> {
  const csrf = csrfFromSession(input.csrfToken);
  if (!csrf) throw new Error("Your session expired. Sign in and try again.");

  const { entries, onProgress } = input;
  const folders = folderPathsFor(entries);
  const tree = await readTree(input.apiUrl, input.projectId);

  const folderIds = new Map<string, string>();
  const fileIdsByParent = new Map<string, Set<string>>();
  for (const node of tree.items) {
    if (node.kind === "FOLDER") {
      const path = pathOfNode(node, tree.items);
      if (path) folderIds.set(path, node.id);
    } else {
      const key = node.parentId ?? "__root__";
      const set = fileIdsByParent.get(key) ?? new Set<string>();
      set.add(node.name);
      fileIdsByParent.set(key, set);
    }
  }

  onProgress?.({ phase: "folders", completed: 0, total: folders.length });
  for (const [index, folder] of folders.entries()) {
    if (folderIds.has(folder)) continue;
    const parent = parentPath(folder);
    const created = await createFolder(
      input.apiUrl,
      input.projectId,
      csrf,
      folder.slice(folder.lastIndexOf("/") + 1),
      parent ? (folderIds.get(parent) ?? null) : null,
    );
    folderIds.set(folder, created.id);
    onProgress?.({
      phase: "folders",
      completed: index + 1,
      total: folders.length,
      currentPath: folder,
    });
  }

  let uploaded = 0;
  let skippedExisting = 0;
  let processed = 0;
  const failed: ZipImportFailure[] = [];
  const total = entries.length;
  for (const entry of entries) {
    const policy = policyForPath(entry.path);
    if (!policy) {
      processed += 1;
      continue;
    }
    const parent = parentPath(entry.path);
    const parentId = parent ? (folderIds.get(parent) ?? null) : null;
    const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
    const existing = fileIdsByParent.get(parentId ?? "__root__");
    if (existing?.has(name)) {
      skippedExisting += 1;
      processed += 1;
      continue;
    }
    onProgress?.({
      phase: "uploading",
      completed: processed,
      total,
      currentPath: entry.path,
    });
    try {
      await uploadFile(
        input.apiUrl,
        input.projectId,
        csrf,
        parentId,
        name,
        policy.mime,
        entry.bytes,
      );
      existing?.add(name);
      uploaded += 1;
    } catch (cause) {
      // One rejected entry (legacy encoding, unsupported signature, quota)
      // must not discard the rest of an Overleaf export.
      failed.push({
        path: entry.path,
        message: cause instanceof Error ? cause.message : "The file could not be uploaded.",
      });
    } finally {
      processed += 1;
      onProgress?.({ phase: "uploading", completed: processed, total });
    }
  }

  onProgress?.({ phase: "done", completed: total, total });
  return {
    uploaded,
    skippedExisting,
    failed,
  };
}

function pathOfNode(node: ProjectNodeView, nodes: ProjectNodeView[]): string | null {
  const parts = [node.name];
  let parentId = node.parentId;
  const seen = new Set<string>([node.id]);
  while (parentId) {
    if (seen.has(parentId)) return null;
    seen.add(parentId);
    const parent = nodes.find((candidate) => candidate.id === parentId);
    if (!parent) return null;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join("/");
}

/** Deletes the default `main.tex` placeholder created with a new project. */
export async function removePlaceholderMainFile(input: {
  apiUrl: string;
  projectId: string;
  csrfToken?: string | null | undefined;
}): Promise<void> {
  const csrf = csrfFromSession(input.csrfToken);
  if (!csrf) throw new Error("Your session expired. Sign in and try again.");
  const tree = await readTree(input.apiUrl, input.projectId);
  const placeholder = tree.items.find(
    (node) => node.kind === "FILE" && node.parentId === null && node.name === "main.tex",
  );
  if (!placeholder) return;
  await deleteNode(input.apiUrl, input.projectId, csrf, placeholder.id);
}

/** Chooses a sensible main document after import: root main.tex, else the shortest .tex path. */
export function pickMainDocument(entries: ZipFileEntry[]): string | null {
  const tex = entries.filter((entry) => entry.path.toLowerCase().endsWith(".tex"));
  if (tex.length === 0) return null;
  const rootMain = tex.find((entry) => entry.path === "main.tex");
  if (rootMain) return rootMain.path;
  return [...tex].sort(
    (left, right) =>
      left.path.split("/").length - right.path.split("/").length ||
      left.path.length - right.path.length ||
      left.path.localeCompare(right.path),
  )[0]!.path;
}

export async function setMainDocument(input: {
  apiUrl: string;
  projectId: string;
  csrfToken?: string | null | undefined;
  fileId: string;
}): Promise<void> {
  const csrf = csrfFromSession(input.csrfToken);
  if (!csrf) throw new Error("Your session expired. Sign in and try again.");
  const response = await fetch(`${input.apiUrl}/projects/${input.projectId}/settings`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-csrf-token": csrf,
    },
    body: JSON.stringify({ mainFileId: input.fileId }),
  });
  if (!response.ok) {
    throw new Error(`Could not set the main document (HTTP ${response.status}).`);
  }
}

export function findNodeIdByPath(nodes: ProjectNodeView[], path: string): string | null {
  const match = nodes.find((node) => node.kind === "FILE" && pathOfNode(node, nodes) === path);
  return match?.id ?? null;
}

function safeDownloadName(title: string): string {
  const cleaned = title
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "project";
}

function triggerDownload(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface DownloadArchiveResult {
  fileCount: number;
  folderCount: number;
  fileName: string;
}

/**
 * Packs every active project node into `<project title>.zip` in the browser.
 * Text files use the canonical Yjs state; binaries stream from the authorized
 * per-file download route. No object keys reach the client.
 */
export async function downloadProjectArchive(input: {
  apiUrl: string;
  projectId: string;
  projectTitle: string;
}): Promise<DownloadArchiveResult> {
  const tree = await readTree(input.apiUrl, input.projectId);
  const archive: Record<string, Uint8Array> = {};
  let totalBytes = 0;
  let folderCount = 0;

  for (const node of tree.items) {
    const path = pathOfNode(node, tree.items);
    if (!path) continue;
    if (node.kind === "FOLDER") {
      archive[`${path}/`] = new Uint8Array();
      folderCount += 1;
      continue;
    }
    let bytes: Uint8Array;
    if (node.contentKind === "TEXT") {
      const response = await fetch(
        `${input.apiUrl}/projects/${input.projectId}/files/${node.id}/text`,
        { credentials: "include", headers: { accept: "application/json" } },
      );
      if (!response.ok) throw new Error(`Could not read "${path}" (HTTP ${response.status}).`);
      const state = (await response.json()) as { updateBase64?: string };
      if (!state.updateBase64) throw new Error(`The text state for "${path}" was invalid.`);
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(
          doc,
          Uint8Array.from(atob(state.updateBase64), (char) => char.charCodeAt(0)),
        );
        // Copy into this realm: fflate's instanceof check rejects foreign
        // Uint8Arrays (e.g. jsdom), which would zip the text byte-by-byte.
        bytes = Uint8Array.from(new TextEncoder().encode(doc.getText("content").toString()));
      } finally {
        doc.destroy();
      }
    } else {
      const response = await fetch(
        `${input.apiUrl}/projects/${input.projectId}/files/${node.id}/download`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(`Could not read "${path}" (HTTP ${response.status}).`);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    totalBytes += bytes.length;
    if (totalBytes > maxExpandedBytes) {
      throw new Error("The project exceeds the 500 MiB ZIP export limit.");
    }
    archive[path] = bytes;
  }

  if (Object.keys(archive).length === 0) {
    throw new Error("This project has no files to download yet.");
  }

  const fileName = `${safeDownloadName(input.projectTitle)}.zip`;
  triggerDownload(zipSync(archive, { level: 6 }), fileName);
  return {
    fileCount: Object.keys(archive).filter((path) => !path.endsWith("/")).length,
    folderCount,
    fileName,
  };
}
