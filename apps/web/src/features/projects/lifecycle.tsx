import { useState, type ReactElement } from "react";

export interface PermanentDeleteDialogProps {
  isOpen: boolean;
  projectTitle: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean | undefined;
  error?: string | null | undefined;
}

export function PermanentDeleteDialog({
  isOpen,
  projectTitle,
  onClose,
  onConfirm,
  isDeleting = false,
  error = null,
}: PermanentDeleteDialogProps): ReactElement | null {
  const [typedTitle, setTypedTitle] = useState("");
  const isMatch = typedTitle.trim() === projectTitle.trim();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="perm-delete-title"
      aria-describedby="perm-delete-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <h2 id="perm-delete-title" className="text-xl font-bold text-red-600 dark:text-red-500">
          Permanently Delete Project
        </h2>
        <p id="perm-delete-desc" className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This action <strong>cannot be undone</strong>. All files, revisions, comments, and project settings will be permanently removed.
        </p>

        <div className="mt-4">
          <label htmlFor="confirm-title-input" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Please type <span className="font-semibold underline">{projectTitle}</span> to confirm:
          </label>
          <input
            id="confirm-title-input"
            type="text"
            value={typedTitle}
            onChange={(e) => setTypedTitle(e.target.value)}
            placeholder={projectTitle}
            disabled={isDeleting}
            aria-label="Confirm project title"
            className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {error && (
          <div role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isMatch || isDeleting}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDeleting ? "Deleting..." : "Permanently Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ProjectLifecycleActionsProps {
  status: "active" | "archived" | "trashed";
  isOwner: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onTrash: () => void;
  onRestoreTrash: () => void;
  onRequestPermanentDelete: () => void;
}

export function ProjectLifecycleActions({
  status,
  isOwner,
  onArchive,
  onUnarchive,
  onTrash,
  onRestoreTrash,
  onRequestPermanentDelete,
}: ProjectLifecycleActionsProps): ReactElement | null {
  if (!isOwner) return null;

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Project lifecycle actions">
      {status === "active" && (
        <>
          <button
            type="button"
            onClick={onArchive}
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Archive
          </button>
          <button
            type="button"
            onClick={onTrash}
            className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
          >
            Move to Trash
          </button>
        </>
      )}

      {status === "archived" && (
        <>
          <button
            type="button"
            onClick={onUnarchive}
            className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Unarchive
          </button>
          <button
            type="button"
            onClick={onTrash}
            className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
          >
            Move to Trash
          </button>
        </>
      )}

      {status === "trashed" && (
        <>
          <button
            type="button"
            onClick={onRestoreTrash}
            className="rounded border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400"
          >
            Restore from Trash
          </button>
          <button
            type="button"
            onClick={onRequestPermanentDelete}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Delete Permanently
          </button>
        </>
      )}
    </div>
  );
}
