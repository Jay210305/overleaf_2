import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { parsePublicConfig } from "@latex-collab/config";
import {
  projectListViewSchema,
  treeViewSchema,
  type ProjectView,
  type Compiler,
} from "@latex-collab/contracts";
import { NotificationList } from "../notifications/list.js";
import {
  downloadProjectArchive,
  extractArchive,
  findNodeIdByPath,
  importArchiveIntoProject,
  pickMainDocument,
  removePlaceholderMainFile,
  setMainDocument,
  type ZipFileEntry,
} from "../files/zip.js";

const config = parsePublicConfig(import.meta.env);
const defaultApiUrl = config.VITE_API_URL;

export type DashboardFilter = "owned" | "shared" | "recent" | "archived" | "trashed";
export type DashboardOrder = "updatedAt" | "owner";

export interface DashboardProps {
  apiUrl?: string;
  initialFilter?: DashboardFilter;
  csrfToken?: string;
  /** Embedded variant used by the home hub: no page header or sidebar. */
  compact?: boolean;
}

const filters: Array<{ id: DashboardFilter; label: string }> = [
  { id: "owned", label: "All / Owned" },
  { id: "shared", label: "Shared" },
  { id: "recent", label: "Recent" },
  { id: "archived", label: "Archived" },
  { id: "trashed", label: "Trashed" },
];

const compilerLabel: Record<Compiler, string> = {
  pdflatex: "pdfLaTeX",
  xelatex: "XeLaTeX",
  lualatex: "LuaLaTeX",
  latex: "LaTeX",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ProjectIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M6 2h8l5 5v15H6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14 2v5h5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 13h6M9 17h4" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function ProjectsDashboard({
  apiUrl = defaultApiUrl,
  initialFilter = "owned",
  csrfToken,
  compact = false,
}: DashboardProps) {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>(initialFilter);
  const [order, setOrder] = useState<DashboardOrder>("updatedAt");
  const [search, setSearch] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);
  const [busyProject, setBusyProject] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createCompiler, setCreateCompiler] = useState<Compiler>("pdflatex");
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ZIP import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTitle, setImportTitle] = useState("");
  const [importCompiler, setImportCompiler] = useState<Compiler>("pdflatex");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importEntries, setImportEntries] = useState<ZipFileEntry[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importPercent, setImportPercent] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

  // Action status message
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [internalCsrf, setInternalCsrf] = useState<string | null>(() => {
    if (csrfToken) return csrfToken;
    try {
      return sessionStorage.getItem("csrf_token");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (csrfToken) {
      setInternalCsrf(csrfToken);
      try {
        sessionStorage.setItem("csrf_token", csrfToken);
      } catch {}
    }
  }, [csrfToken]);

  const getCsrfToken = useCallback(async (): Promise<string | null> => {
    // Session reads rotate the CSRF hash, so always prefer the freshest token
    // stored by the session probe instead of a value captured at mount.
    try {
      const stored = sessionStorage.getItem("csrf_token");
      if (stored) {
        setInternalCsrf(stored);
        return stored;
      }
    } catch {}
    return internalCsrf;
  }, [internalCsrf]);

  const fetchProjects = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("filter", filter);
        params.set("order", order);
        params.set("limit", "10");
        if (search.trim()) {
          params.set("q", search.trim());
        }
        if (cursor) {
          params.set("cursor", cursor);
        }

        const res = await fetch(`${apiUrl}/projects?${params.toString()}`, {
          method: "GET",
          headers: {
            accept: "application/json",
          },
          credentials: "include",
        });

        if (!res.ok) {
          if (res.status === 401) {
            setError("Your session has expired. Please sign in again.");
          } else if (res.status === 403) {
            setError("Access denied.");
          } else {
            setError("Failed to load projects. Please try again.");
          }
          setProjects([]);
          setNextCursor(null);
          return;
        }

        const json = await res.json();
        const parsed = projectListViewSchema.safeParse(json);
        if (parsed.success) {
          setProjects(parsed.data.items);
          setNextCursor(parsed.data.nextCursor);
        } else {
          setProjects(json.items ?? []);
          setNextCursor(json.nextCursor ?? null);
        }
      } catch {
        setError("Network error while loading projects.");
        setProjects([]);
        setNextCursor(null);
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, filter, order, search],
  );

  useEffect(() => {
    setCurrentCursor(undefined);
    setCursorStack([]);
    void fetchProjects();
  }, [filter, order, search, fetchProjects]);

  function handleNextPage() {
    if (!nextCursor) return;
    setCursorStack((prev) => (currentCursor ? [...prev, currentCursor] : [...prev, ""]));
    setCurrentCursor(nextCursor);
    void fetchProjects(nextCursor);
  }

  function handlePrevPage() {
    if (cursorStack.length === 0) return;
    const previousCursor = cursorStack[cursorStack.length - 1];
    setCursorStack((prev) => prev.slice(0, -1));
    const target = previousCursor === "" ? undefined : previousCursor;
    setCurrentCursor(target);
    void fetchProjects(target);
  }

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!createTitle.trim()) {
      setCreateError("Title is required.");
      return;
    }
    setIsSubmitting(true);
    setCreateError(null);

    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`${apiUrl}/projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          title: createTitle.trim(),
          description: createDescription.trim() || undefined,
          compiler: createCompiler,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setCreateError(errJson.detail ?? "Failed to create project.");
        return;
      }

      setCreateTitle("");
      setCreateDescription("");
      setShowCreateModal(false);
      setStatusMessage("Project created successfully.");
      void fetchProjects(currentCursor);
    } catch {
      setCreateError("Network error while creating project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleImportArchive(event: FormEvent) {
    event.preventDefault();
    if (!importFile || isImporting) {
      setImportError("Choose a .zip archive to import.");
      return;
    }
    const title = importTitle.trim() || importFile.name.replace(/\.zip$/i, "").trim();
    if (!title) {
      setImportError("Give the imported project a title.");
      return;
    }
    setIsImporting(true);
    setImportError(null);
    setImportProgress("Reading archive…");
    setImportPercent(5);

    try {
      let entries = importEntries;
      if (!entries) {
        entries = extractArchive(new Uint8Array(await importFile.arrayBuffer())).entries;
        setImportEntries(entries);
      }
      setImportPercent(15);

      setImportProgress("Creating project…");
      const csrf = await getCsrfToken();
      const createResponse = await fetch(`${apiUrl}/projects`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ title, compiler: importCompiler }),
      });
      if (!createResponse.ok) {
        const detail = (await createResponse.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          detail?.detail ?? `Could not create the project (${createResponse.status}).`,
        );
      }
      const created = (await createResponse.json()) as ProjectView;

      // A default `main.tex` is created with the project. Only remove it when the
      // archive supplies its own root `main.tex`; otherwise it stays as a safe
      // fallback until the imported main document is selected.
      const replacesPlaceholder = entries.some((entry) => entry.path === "main.tex");
      if (replacesPlaceholder) {
        await removePlaceholderMainFile({ apiUrl, projectId: created.id, csrfToken: csrf });
      }
      setImportProgress(`Extracting and uploading 0 of ${entries.length} files…`);
      const result = await importArchiveIntoProject({
        apiUrl,
        projectId: created.id,
        csrfToken: csrf,
        entries,
        onProgress: (progress) => {
          if (progress.phase === "folders") {
            setImportPercent(
              15 + Math.round((progress.completed / Math.max(1, progress.total)) * 10),
            );
            setImportProgress(`Creating folders (${progress.completed}/${progress.total})…`);
          } else if (progress.phase === "uploading") {
            const ratio = progress.completed / Math.max(1, progress.total);
            setImportPercent(25 + Math.round(ratio * 70));
            setImportProgress(
              `Extracting and uploading ${progress.completed} of ${progress.total} files…${
                progress.currentPath ? ` (${progress.currentPath})` : ""
              }`,
            );
          }
        },
      });

      // Main-document selection is best effort: the files are already imported,
      // so a failure here must not turn the whole import into an error.
      const mainPath = pickMainDocument(entries);
      if (mainPath) {
        setImportProgress("Selecting the main document…");
        try {
          const treeResponse = await fetch(`${apiUrl}/projects/${created.id}/nodes`, {
            credentials: "include",
            headers: { accept: "application/json" },
          });
          if (treeResponse.ok) {
            const parsedTree = treeViewSchema.safeParse(await treeResponse.json());
            const mainFileId = parsedTree.success
              ? findNodeIdByPath(parsedTree.data.items, mainPath)
              : null;
            if (mainFileId) {
              await setMainDocument({
                apiUrl,
                projectId: created.id,
                csrfToken: csrf,
                fileId: mainFileId,
              });
            }
          }
        } catch {
          // Ignore: the project keeps its placeholder main document.
        }
      }

      if (!replacesPlaceholder) {
        try {
          await removePlaceholderMainFile({ apiUrl, projectId: created.id, csrfToken: csrf });
        } catch {
          // A leftover empty placeholder is harmless once the main file is set.
        }
      }

      setImportPercent(100);

      if (result.failed.length > 0) {
        const preview = result.failed
          .slice(0, 3)
          .map((failure) => `${failure.path} (${failure.message})`)
          .join("; ");
        const more = result.failed.length > 3 ? ` and ${result.failed.length - 3} more` : "";
        setImportError(
          `Imported ${result.uploaded} file${result.uploaded === 1 ? "" : "s"}, but ${
            result.failed.length
          } could not be uploaded: ${preview}${more}.`,
        );
        setImportProgress(null);
        return;
      }

      setStatusMessage(
        `Imported ${result.uploaded} file${result.uploaded === 1 ? "" : "s"} into “${created.title}”.`,
      );
      setShowImportModal(false);
      setImportFile(null);
      setImportEntries(null);
      setImportTitle("");
      // The dashboard can render without a router in unit tests, so navigate
      // with the browser history API instead of a router hook.
      window.location.assign(`/project/${created.id}`);
    } catch (cause) {
      setImportError(
        cause instanceof Error ? cause.message : "The ZIP archive could not be imported.",
      );
    } finally {
      setIsImporting(false);
      setImportProgress(null);
      setImportPercent(0);
    }
  }

  function chooseImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImportFile(file);
    setImportEntries(null);
    setImportError(null);
    if (file) {
      const base = file.name
        .replace(/\.zip$/i, "")
        .replace(/[-_]+/g, " ")
        .trim();
      if (base && !importTitle.trim()) setImportTitle(base);
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setImportError("Choose a .zip archive.");
      }
    }
    event.target.value = "";
  }

  async function handleClone(projectId: string) {
    setBusyProject(projectId);
    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/clone`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `clone-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        credentials: "include",
      });
      if (res.ok) {
        setStatusMessage("Project duplicated successfully.");
        void fetchProjects(currentCursor);
      } else {
        setError("Failed to duplicate project.");
      }
    } catch {
      setError("Network error while duplicating project.");
    } finally {
      setBusyProject(null);
    }
  }

  async function handleArchive(projectId: string) {
    setBusyProject(projectId);
    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ status: "archived" }),
      });
      if (res.ok) {
        setStatusMessage("Project archived.");
        void fetchProjects(currentCursor);
      } else {
        setError("Failed to archive project.");
      }
    } catch {
      setError("Network error while archiving project.");
    } finally {
      setBusyProject(null);
    }
  }

  async function handleDelete(projectId: string) {
    setBusyProject(projectId);
    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}`, {
        method: "DELETE",
        headers: {
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        credentials: "include",
      });
      if (res.ok) {
        setStatusMessage("Project deleted successfully.");
        void fetchProjects(currentCursor);
      } else {
        setError("Failed to delete project.");
      }
    } catch {
      setError("Network error while deleting project.");
    } finally {
      setBusyProject(null);
    }
  }

  async function handleDownload(project: ProjectView) {
    setBusyProject(project.id);
    try {
      const result = await downloadProjectArchive({
        apiUrl,
        projectId: project.id,
        projectTitle: project.title,
      });
      setStatusMessage(`Downloaded ${result.fileCount} files as ${result.fileName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project ZIP could not be downloaded.");
    } finally {
      setBusyProject(null);
    }
  }

  return (
    <div className="dashboard-container" role="region" aria-label="Projects dashboard">
      {!compact && (
        <header className="dashboard-header">
          <div className="dashboard-heading">
            <p className="eyebrow">Workspace</p>
            <h1>Projects</h1>
            <p className="section-lead">
              Create, import, and organize your academic writing projects. Every project keeps its
              compiler, revision history, and collaborator access in one place.
            </p>
          </div>
        </header>
      )}

      {statusMessage && (
        <div role="status" aria-live="polite" className="status-banner">
          {statusMessage}
        </div>
      )}

      <div className={`dashboard-layout${compact ? " is-compact" : ""}`}>
        {!compact && (
          <aside className="dashboard-sidebar" aria-label="Project navigation">
            <div className="sidebar-actions">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => setShowCreateModal(true)}
                aria-haspopup="dialog"
              >
                <span aria-hidden="true">+</span> New Project
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => setShowImportModal(true)}
                aria-haspopup="dialog"
              >
                Import ZIP Project
              </button>
            </div>

            <nav className="filter-tabs" role="tablist" aria-label="Project filter categories">
              {filters.map((entry) => (
                <button
                  key={entry.id}
                  role="tab"
                  aria-selected={filter === entry.id}
                  className={`tab-btn ${filter === entry.id ? "active" : ""}`}
                  onClick={() => setFilter(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </nav>

            <details className="sidebar-notifications" open>
              <summary>Notifications</summary>
              <div className="sidebar-notifications-body">
                <NotificationList apiUrl={apiUrl} />
              </div>
            </details>
          </aside>
        )}

        <section className="projects-content" aria-live="polite" aria-label="Project list">
          <div className="projects-toolbar">
            <div className="search-field">
              <label htmlFor="search-input" className="sr-only">
                Search projects
              </label>
              <input
                id="search-input"
                type="search"
                placeholder="Search by title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="sort-field">
              <label htmlFor="sort-select">Sort by</label>
              <select
                id="sort-select"
                value={order}
                onChange={(e) => setOrder(e.target.value as DashboardOrder)}
              >
                <option value="updatedAt">Last Modified</option>
                <option value="owner">Owner</option>
              </select>
            </div>
          </div>

          {loading && (
            <div role="status" className="loading-state">
              <p>Loading projects...</p>
            </div>
          )}

          {error && (
            <div role="alert" className="error-state">
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && projects.length === 0 && (
            <div role="status" className="empty-state">
              <p>No projects found.</p>
            </div>
          )}

          {!loading && !error && projects.length > 0 && (
            <div className="table-responsive">
              <table className="projects-table" aria-label="Projects list">
                <thead>
                  <tr>
                    <th scope="col">Title</th>
                    <th scope="col">Compiler</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last Modified</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((proj) => (
                    <tr key={proj.id}>
                      <td>
                        <a href={`/project/${proj.id}`} className="project-title-link">
                          <ProjectIcon />
                          <span>{proj.title}</span>
                        </a>
                        {proj.description && <p className="project-desc">{proj.description}</p>}
                      </td>
                      <td>
                        <span className={`badge badge-compiler ${proj.compiler}`}>
                          {compilerLabel[proj.compiler] ?? proj.compiler}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-status ${proj.status}`}>
                          <span className="status-dot" aria-hidden="true" />
                          {proj.status}
                        </span>
                      </td>
                      <td className="project-date">{formatDate(proj.updatedAt)}</td>
                      <td>
                        <div className="project-actions">
                          <a
                            className="btn btn-secondary btn-sm"
                            href={`/project/${proj.id}`}
                            title={proj.title}
                          >
                            Open
                          </a>
                          <button
                            type="button"
                            aria-label={`Download ZIP ${proj.title}`}
                            className="btn btn-secondary btn-sm"
                            disabled={busyProject === proj.id}
                            onClick={() => void handleDownload(proj)}
                          >
                            Download ZIP
                          </button>
                          <button
                            type="button"
                            aria-label={`Duplicate ${proj.title}`}
                            className="btn btn-secondary btn-sm"
                            disabled={busyProject === proj.id}
                            onClick={() => void handleClone(proj.id)}
                          >
                            Duplicate
                          </button>
                          {proj.status === "active" && filter !== "archived" && (
                            <button
                              type="button"
                              aria-label={`Archive ${proj.title}`}
                              className="btn btn-secondary btn-sm"
                              disabled={busyProject === proj.id}
                              onClick={() => void handleArchive(proj.id)}
                            >
                              Archive
                            </button>
                          )}
                          {filter !== "trashed" && (
                            <button
                              type="button"
                              aria-label={`Delete ${proj.title}`}
                              className="btn btn-danger btn-sm"
                              disabled={busyProject === proj.id}
                              onClick={() => void handleDelete(proj.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && projects.length > 0 && (
            <nav className="pagination-nav" aria-label="Pagination">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={cursorStack.length === 0}
                onClick={handlePrevPage}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="pagination-page">Page {cursorStack.length + 1}</span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!nextCursor}
                onClick={handleNextPage}
                aria-label="Next page"
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </div>

      {/* Import ZIP Project Modal */}
      {showImportModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-modal-title"
        >
          <div className="modal-dialog import-modal">
            <h2 id="import-modal-title">Import ZIP Project</h2>
            <p className="modal-subtitle">
              Upload a <code>.zip</code> archive exported from Overleaf or this workspace. Folders,
              images, and bibliographies are recreated and a main document is selected
              automatically.
            </p>
            <form onSubmit={(e) => void handleImportArchive(e)}>
              {importError && (
                <div role="alert" className="modal-error">
                  {importError}
                </div>
              )}
              <div className="form-group">
                <label htmlFor="import-project-title">Project Title</label>
                <input
                  id="import-project-title"
                  type="text"
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                  placeholder="My imported paper"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="import-project-compiler">Compiler Engine</label>
                <select
                  id="import-project-compiler"
                  value={importCompiler}
                  onChange={(e) => setImportCompiler(e.target.value as Compiler)}
                >
                  <option value="pdflatex">pdfLaTeX</option>
                  <option value="xelatex">XeLaTeX</option>
                  <option value="lualatex">LuaLaTeX</option>
                  <option value="latex">LaTeX</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="import-project-file" className="file-drop">
                  <span className="file-drop-title">
                    {importFile ? importFile.name : "Choose a .zip archive"}
                  </span>
                  <span className="file-drop-hint">
                    Drag the file onto this field or click to browse. Up to 200 MiB.
                  </span>
                  <input
                    id="import-project-file"
                    type="file"
                    accept=".zip,application/zip"
                    onChange={chooseImportFile}
                  />
                </label>
              </div>
              {importProgress && (
                <div role="status" className="import-progress" aria-live="polite">
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.max(3, Math.min(100, importPercent))}%` }}
                    />
                  </div>
                  <p>{importProgress}</p>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowImportModal(false)}
                  disabled={isImporting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isImporting || !importFile}
                >
                  {isImporting ? "Importing…" : "Import Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="modal-dialog">
            <h2 id="modal-title">Create New Project</h2>
            <form onSubmit={(e) => void handleCreateProject(e)}>
              {createError && (
                <div role="alert" className="modal-error">
                  {createError}
                </div>
              )}
              <div className="form-group">
                <label htmlFor="modal-project-title">Project Title *</label>
                <input
                  id="modal-project-title"
                  type="text"
                  required
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="modal-project-desc">Description (Optional)</label>
                <textarea
                  id="modal-project-desc"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="modal-project-compiler">Compiler Engine</label>
                <select
                  id="modal-project-compiler"
                  value={createCompiler}
                  onChange={(e) => setCreateCompiler(e.target.value as Compiler)}
                >
                  <option value="pdflatex">pdfLaTeX</option>
                  <option value="xelatex">XeLaTeX</option>
                  <option value="lualatex">LuaLaTeX</option>
                  <option value="latex">LaTeX</option>
                </select>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
export default ProjectsDashboard;
