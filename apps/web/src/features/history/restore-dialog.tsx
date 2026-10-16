import { useState, useEffect, type ReactElement } from "react";

export interface AffectedFile {
  id: string;
  name: string;
  type: "modified" | "deleted" | "added";
}

export interface RestoreDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  targetRevisionNo: number;
  currentRevisionNo: number;
  targetFile?: { id: string; name: string } | null | undefined;
  affectedFiles?: AffectedFile[] | undefined;
  canRestore?: boolean | undefined;
  error?: string | null | undefined;
  result?: { revisionNo: number; changedCount: number } | null | undefined;
  isRestoring?: boolean | undefined;
}

export function RestoreDialog({
  isOpen,
  onClose,
  onConfirm,
  targetRevisionNo,
  currentRevisionNo,
  targetFile,
  affectedFiles = [],
  canRestore = true,
  error = null,
  result = null,
  isRestoring = false,
}: RestoreDialogProps): ReactElement | null {
  const [internalError, setInternalError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !isRestoring) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isRestoring, onClose]);

  if (!isOpen) {
    return null;
  }

  const displayedError = error ?? internalError;
  const isFileRestore = !!targetFile;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-dialog-title"
      aria-describedby="restore-dialog-desc"
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2
          id="restore-dialog-title"
          className="text-xl font-bold text-zinc-900 dark:text-zinc-100"
        >
          {isFileRestore ? `Restore file "${targetFile.name}"` : "Restore project"}
        </h2>

        <p id="restore-dialog-desc" className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {isFileRestore
            ? `Restoring "${targetFile.name}" to revision v${targetRevisionNo} will create a new revision v${
                currentRevisionNo + 1
              }. Other files and project permissions will remain unchanged.`
            : `Restoring the project to revision v${targetRevisionNo} will create a new revision v${
                currentRevisionNo + 1
              }. Current collaborator permissions and project ownership will remain strictly unchanged.`}
        </p>

        {/* Anchor detachment warning */}
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <strong>Notice:</strong> Any open comments or pending suggestions on affected files will
          become detached or marked conflicted to prevent pointing to incorrect restored text.
        </div>

        {/* Affected files list */}
        {affectedFiles.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Affected Files ({affectedFiles.length})
            </h3>
            <ul
              aria-label="Affected files"
              className="mt-1 max-h-36 overflow-y-auto rounded border border-zinc-200 p-2 text-sm dark:border-zinc-800"
            >
              {affectedFiles.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between py-1 text-zinc-700 dark:text-zinc-300"
                >
                  <span className="font-mono">{file.name}</span>
                  <span
                    className={`text-xs font-medium ${
                      file.type === "added"
                        ? "text-green-600"
                        : file.type === "deleted"
                          ? "text-red-600"
                          : "text-blue-600"
                    }`}
                  >
                    {file.type}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Permission restriction */}
        {!canRestore && (
          <div
            role="alert"
            className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            You do not have permission to restore revisions. Only project owners and editors can
            perform this action.
          </div>
        )}

        {/* Concurrency or runtime error */}
        {displayedError && (
          <div
            role="alert"
            className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {displayedError}
          </div>
        )}

        {/* Success confirmation result */}
        {result && (
          <div
            role="status"
            className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
          >
            Successfully restored to new revision v{result.revisionNo} ({result.changedCount}{" "}
            file(s) changed).
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring}
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                setInternalError(null);
                await onConfirm();
              } catch (err) {
                setInternalError(err instanceof Error ? err.message : "Failed to restore revision");
              }
            }}
            disabled={!canRestore || isRestoring}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRestoring ? "Restoring..." : "Confirm Restore"}
          </button>
        </div>
      </div>
    </div>
  );
}
