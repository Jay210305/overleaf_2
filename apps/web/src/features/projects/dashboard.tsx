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
}

export function ProjectsDashboard({
  apiUrl = defaultApiUrl,
  initialFilter = "owned",
  csrfToken,
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
    if (internalCsrf) return internalCsrf;
    try {
      const stored = sessionStorage.getItem("csrf_token");
      if (stored) {
        setInternalCsrf(stored);
        return stored;
      }
    } catch {}
    return null;
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

    try {
      let entries = importEntries;
      if (!entries) {
        entries = extractArchive(new Uint8Array(await importFile.arrayBuffer())).entries;
        setImportEntries(entries);
      }

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

      await removePlaceholderMainFile({ apiUrl, projectId: created.id, csrfToken: csrf });
      setImportProgress(`Importing ${entries.length} files…`);
      const result = await importArchiveIntoProject({
        apiUrl,
        projectId: created.id,
        csrfToken: csrf,
        entries,
        onProgress: (progress) => {
          if (progress.phase === "folders") {
            setImportProgress(`Creating folders (${progress.completed}/${progress.total})…`);
          } else if (progress.phase === "uploading") {
            setImportProgress(
              `Uploading ${Math.min(progress.completed + 1, progress.total)}/${
                progress.total
              }${progress.currentPath ? ` · ${progress.currentPath}` : ""}`,
            );
          }
        },
      });

      const mainPath = pickMainDocument(entries);
      if (mainPath) {
        setImportProgress("Selecting the main document…");
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
    }
  }

  async function handleDelete(projectId: string) {
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
    }
  }

  return (
    <main className="dashboard-container" role="region" aria-label="Projects dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Projects</h1>
        </div>
        <div className="dashboard-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowImportModal(true)}
            aria-haspopup="dialog"
          >
            Import ZIP Project
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            aria-haspopup="dialog"
          >
            New Project
          </button>
        </div>
      </header>

      {statusMessage && (
        <div role="status" aria-live="polite" className="status-banner">
          {statusMessage}
        </div>
      )}

      <NotificationList apiUrl={apiUrl} />

      {/* Toolbar: Filters, Search, Sort */}
      <section className="dashboard-toolbar" aria-label="Project list controls">
        <div className="filter-tabs" role="tablist" aria-label="Project filter categories">
          {(["owned", "shared", "recent", "archived", "trashed"] as const).map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={filter === cat}
              className={`tab-btn ${filter === cat ? "active" : ""}`}
              onClick={() => setFilter(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <div className="search-and-sort">
          <div className="search-field">
            <label htmlFor="search-input">Search projects</label>
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
      </section>

      {/* Main Content Area */}
      <section className="projects-content" aria-live="polite">
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
                        {proj.title}
                      </a>
                      {proj.description && <p className="project-desc">{proj.description}</p>}
                    </td>
                    <td>{proj.compiler}</td>
                    <td>{proj.status}</td>
                    <td>{new Date(proj.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Duplicate ${proj.title}`}
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleClone(proj.id)}
                      >
                        Duplicate
                      </button>
                      {filter !== "trashed" && (
                        <button
                          type="button"
                          aria-label={`Delete ${proj.title}`}
                          className="btn btn-danger btn-sm"
                          onClick={() => void handleDelete(proj.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
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
              Upload a <code>.zip</code> archive exported from Overleaf or this workspace. Its
              folders and files are recreated and the first main document is selected automatically.
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
                <label htmlFor="import-project-file">ZIP Archive</label>
                <input
                  id="import-project-file"
                  type="file"
                  accept=".zip,application/zip"
                  onChange={chooseImportFile}
                />
              </div>
              {importProgress && (
                <p role="status" className="import-progress">
                  {importProgress}
                </p>
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
    </main>
  );
}
export default ProjectsDashboard;
