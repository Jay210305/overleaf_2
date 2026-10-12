import { useCallback, useEffect, useState, type FormEvent } from "react";
import { parsePublicConfig } from "@latex-collab/config";
import {
  projectListViewSchema,
  type ProjectView,
  type Compiler,
} from "@latex-collab/contracts";

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
        <h1>Projects</h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
          aria-haspopup="dialog"
        >
          New Project
        </button>
      </header>

      {statusMessage && (
        <div role="status" aria-live="polite" className="status-banner">
          {statusMessage}
        </div>
      )}

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

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
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
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
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
