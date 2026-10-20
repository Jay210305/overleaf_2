import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { uploadViewSchema } from "@latex-collab/contracts";
import { extractArchive, importArchiveIntoProject } from "./zip.js";

const maxFileBytes = 100 * 1024 * 1024;

type UploadStatus =
  | "queued"
  | "hashing"
  | "presigning"
  | "uploading"
  | "completing"
  | "complete"
  | "error"
  | "cancelled";
type SignedUpload = { uploadId: string; url: string; expiresAt: string };
type ZipStatus = "reading" | "importing" | "complete" | "error";
type ZipRow = {
  id: string;
  file: File;
  status: ZipStatus;
  message: string;
};
type UploadRow = {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  completionKey: string;
  hash?: string;
  signed?: SignedUpload;
  error?: string | undefined;
};

const statusLabels: Record<UploadStatus, string> = {
  queued: "Waiting",
  hashing: "Preparing",
  presigning: "Starting upload",
  uploading: "Uploading",
  completing: "Finalizing",
  complete: "Complete",
  error: "Failed",
  cancelled: "Cancelled",
};

export interface FileUploaderProps {
  projectId: string;
  apiUrl: string;
  csrfToken?: string | undefined;
  onUploaded?: (() => void) | undefined;
}

class UploadFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function fileMime(file: File): string {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const supported: Record<string, string[]> = {
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
  const accepted = supported[extension];
  if (!accepted || (file.type && !accepted.includes(file.type))) {
    throw new UploadFailure(422, "Unsupported file type. Choose a permitted source or asset file.");
  }
  return file.type || accepted[0]!;
}

function validateFile(file: File): string {
  const name = file.name;
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name !== name.normalize("NFC") ||
    /[/\\\0]/.test(name) ||
    /%(?:2e|2f|5c|00)/i.test(name)
  ) {
    throw new UploadFailure(400, "Unsafe file name. Rename the file and try again.");
  }
  if (file.size < 1 || file.size > maxFileBytes) {
    throw new UploadFailure(413, "File exceeds the 100 MiB upload limit or is empty.");
  }
  return fileMime(file);
}

function statusMessage(error: unknown): string {
  if (error instanceof UploadFailure) {
    if (
      typeof error.message === "string" &&
      (error.message.includes("Verify bucket CORS configuration") ||
        error.message.startsWith("Storage upload failed"))
    ) {
      return error.message;
    }
    if (error.status === 0)
      return (
        error.message ||
        "Storage upload failed: network or CORS error. Verify bucket CORS configuration."
      );
    if (error.status === 400) return "Unsafe file name or invalid request.";
    if (error.status === 401) return "Session expired. Sign in and retry.";
    if (error.status === 403 || error.status === 404)
      return "Project upload permission denied or project unavailable.";
    if (error.status === 409) return "A file with this name already exists.";
    if (error.status === 413) return "Project or file quota exceeded.";
    if (error.status === 422) return error.message;
    if (error.status === 503) return "Upload service unavailable. Retry later.";
    return error.message || `Upload failed (${error.status}). Retry this file.`;
  }
  return error instanceof Error ? error.message : "Connection failed. Retry this file.";
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function putSigned(
  url: string,
  file: File,
  mime: string,
  onProgress: (progress: number) => void,
  onRequest: (request: XMLHttpRequest | null) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    onRequest(request);
    request.open("PUT", url);
    if (typeof request.setRequestHeader === "function") {
      request.setRequestHeader("Content-Type", mime);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0)
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => {
      onRequest(null);
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new UploadFailure(request.status, `Storage upload failed (HTTP ${request.status}).`));
    };
    request.onerror = () => {
      onRequest(null);
      reject(
        new UploadFailure(
          0,
          "Storage upload failed: network or CORS error. Verify bucket CORS configuration.",
        ),
      );
    };
    request.onabort = () => {
      onRequest(null);
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    request.send(file);
  });
}

export function FileUploader({ projectId, apiUrl, csrfToken, onUploaded }: FileUploaderProps) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [zipRows, setZipRows] = useState<ZipRow[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef<Set<string>>(new Set());

  const update = useCallback((id: string, changes: Partial<UploadRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }, []);

  const importZip = useCallback(
    async (row: ZipRow) => {
      try {
        const csrf = csrfToken || sessionStorage.getItem("csrf_token");
        const bytes = new Uint8Array(await row.file.arrayBuffer());
        setZipRows((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, status: "reading", message: "Reading archive…" } : item,
          ),
        );
        const archive = extractArchive(bytes);
        setZipRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  status: "importing",
                  message: `Importing ${archive.entries.length} file${
                    archive.entries.length === 1 ? "" : "s"
                  }…`,
                }
              : item,
          ),
        );
        const result = await importArchiveIntoProject({
          apiUrl,
          projectId,
          csrfToken: csrf,
          entries: archive.entries,
          onProgress: (progress) => {
            if (progress.phase === "uploading" && progress.currentPath) {
              setZipRows((current) =>
                current.map((item) =>
                  item.id === row.id
                    ? {
                        ...item,
                        status: "importing",
                        message: `Uploading ${Math.min(
                          progress.completed + 1,
                          progress.total,
                        )}/${progress.total}: ${progress.currentPath}`,
                      }
                    : item,
                ),
              );
            }
          },
        });
        const skipped = archive.skipped.length + result.skippedExisting;
        setZipRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  status: result.failed.length > 0 ? "error" : "complete",
                  message: `${result.uploaded} file${
                    result.uploaded === 1 ? "" : "s"
                  } imported${skipped > 0 ? ` · ${skipped} skipped` : ""}${
                    result.failed.length > 0
                      ? ` · ${result.failed.length} failed (${result.failed[0]?.path}: ${result.failed[0]?.message})`
                      : ""
                  }.`,
                }
              : item,
          ),
        );
        onUploaded?.();
      } catch (cause) {
        setZipRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  status: "error",
                  message:
                    cause instanceof Error
                      ? cause.message
                      : "The ZIP archive could not be imported.",
                }
              : item,
          ),
        );
      }
    },
    [apiUrl, csrfToken, onUploaded, projectId],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const selected = Array.from(files);
      const archives = selected.filter((file) => file.name.toLowerCase().endsWith(".zip"));
      const sources = selected.filter((file) => !file.name.toLowerCase().endsWith(".zip"));
      if (archives.length > 0) {
        const addedZipRows = archives.map((file) => ({
          id: crypto.randomUUID(),
          file,
          status: "reading" as const,
          message: "Reading archive…",
        }));
        setZipRows((current) => [...current, ...addedZipRows]);
        for (const row of addedZipRows) void importZip(row);
      }
      const added = sources.map((file) => ({
        id: crypto.randomUUID(),
        file,
        status: "queued" as const,
        progress: 0,
        completionKey: crypto.randomUUID(),
      }));
      setRows((current) => [...current, ...added]);
    },
    [importZip],
  );

  const apiRequest = useCallback(
    async (path: string, body: object, key?: string): Promise<Response> => {
      const csrf = csrfToken || sessionStorage.getItem("csrf_token");
      if (!csrf) throw new UploadFailure(401, "Session expired.");
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        return await fetch(`${apiUrl}/projects/${projectId}/uploads/${path}`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf,
            ...(key ? { "idempotency-key": key } : {}),
          },
          body: JSON.stringify(body),
        });
      } finally {
        controllerRef.current = null;
      }
    },
    [apiUrl, csrfToken, projectId],
  );

  const finish = useCallback(
    async (row: UploadRow, signed: SignedUpload, hash: string): Promise<boolean> => {
      update(row.id, { status: "completing", progress: 100 });
      const response = await apiRequest(
        "complete",
        { uploadId: signed.uploadId, sha256: hash },
        row.completionKey,
      );
      if (response.status === 201) {
        update(row.id, { status: "complete", error: undefined });
        onUploaded?.();
        return true;
      }
      if (response.status === 422) return false;
      throw new UploadFailure(response.status, "Completion failed.");
    },
    [apiRequest, onUploaded, update],
  );

  const process = useCallback(
    async (row: UploadRow) => {
      try {
        const mime = validateFile(row.file);
        update(row.id, { status: "hashing", error: undefined });
        const hash = row.hash ?? (await sha256(row.file));
        update(row.id, { hash });
        if (cancelledRef.current.has(row.id)) return;
        if (row.signed && (await finish(row, row.signed, hash))) return;
        if (cancelledRef.current.has(row.id)) return;
        update(row.id, { status: "presigning" });
        const response = await apiRequest("presign", {
          fileName: row.file.name,
          mime,
          sizeBytes: row.file.size,
          sha256: hash,
        });
        if (!response.ok) throw new UploadFailure(response.status, "Presign failed.");
        const signed = uploadViewSchema.parse(await response.json());
        update(row.id, { signed, status: "uploading", progress: 0 });
        if (cancelledRef.current.has(row.id)) return;
        await putSigned(
          signed.url,
          row.file,
          mime,
          (progress) => update(row.id, { progress }),
          (request) => {
            requestRef.current = request;
          },
        );
        if (cancelledRef.current.has(row.id)) return;
        if (!(await finish(row, signed, hash)))
          throw new UploadFailure(422, "Upload content was rejected. Check the file and retry.");
      } catch (error) {
        if (cancelledRef.current.has(row.id)) {
          update(row.id, { status: "cancelled", error: undefined });
        } else {
          update(row.id, { status: "error", error: statusMessage(error) });
        }
      }
    },
    [apiRequest, finish, update],
  );

  useEffect(() => {
    if (running) return;
    const next = rows.find((row) => row.status === "queued");
    if (!next) return;
    setRunning(true);
    activeIdRef.current = next.id;
    void process(next).finally(() => {
      activeIdRef.current = null;
      setRunning(false);
    });
  }, [process, rows, running]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      requestRef.current?.abort();
    },
    [],
  );

  const cancel = (id: string) => {
    cancelledRef.current.add(id);
    if (activeIdRef.current === id) {
      controllerRef.current?.abort();
      requestRef.current?.abort();
    }
    update(id, { status: "cancelled", error: undefined });
  };

  const retry = (id: string) => {
    if (activeIdRef.current === id) return;
    cancelledRef.current.delete(id);
    update(id, { status: "queued", error: undefined, progress: 0 });
  };

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  };

  return (
    <section className="file-uploader" aria-label="Project upload panel">
      <label htmlFor="project-upload-input">Upload project files</label>
      <input
        ref={inputRef}
        id="project-upload-input"
        type="file"
        multiple
        accept=".tex,.bib,.sty,.cls,.bst,.tikz,.txt,.eps,.png,.jpg,.jpeg,.pdf,.ttf,.otf,.zip,application/zip"
        onChange={choose}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop files here or choose files"
        className="file-uploader-drop"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        Drop files here or choose files
      </div>
      {(zipRows.length > 0 || rows.length > 0) && (
        <ul className="file-uploader-list" aria-live="polite">
          {zipRows.map((row) => (
            <li key={row.id} className={`upload-row zip ${row.status}`}>
              <span className="upload-row-name">{row.file.name}</span>
              <span
                className="upload-row-status"
                role={row.status === "error" ? "alert" : undefined}
              >
                {row.message}
              </span>
              {row.status === "error" && (
                <button
                  type="button"
                  onClick={() => {
                    setZipRows((current) =>
                      current.map((item) =>
                        item.id === row.id
                          ? { ...item, status: "reading", message: "Reading archive…" }
                          : item,
                      ),
                    );
                    void importZip(row);
                  }}
                >
                  Retry {row.file.name}
                </button>
              )}
            </li>
          ))}
          {rows.map((row) => (
            <li key={row.id}>
              <span>{row.file.name}</span>
              {row.status === "uploading" ? (
                <>
                  <progress
                    aria-label={`${row.file.name} upload progress`}
                    value={row.progress}
                    max={100}
                  />
                  <span>{row.progress}%</span>
                </>
              ) : (
                <span>{statusLabels[row.status]}</span>
              )}
              {row.error && <span role="alert">{row.error}</span>}
              {(["queued", "hashing", "presigning", "uploading"] as UploadStatus[]).includes(
                row.status,
              ) && (
                <button type="button" onClick={() => cancel(row.id)}>
                  Cancel {row.file.name}
                </button>
              )}
              {(row.status === "error" || row.status === "cancelled") && (
                <button
                  type="button"
                  disabled={activeIdRef.current === row.id}
                  onClick={() => retry(row.id)}
                >
                  Retry {row.file.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
