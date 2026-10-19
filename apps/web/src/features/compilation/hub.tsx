import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { projectListViewSchema, type ProjectView } from "@latex-collab/contracts";

/**
 * Projects-ready compilation overview. Unlike the projects dashboard this view
 * is deliberately read-only: it lists active projects with their TeX engine and
 * opens the workspace compilation pane directly, without duplicated filters or
 * notification noise.
 */

const compilerLabel: Record<string, string> = {
  pdflatex: "pdfLaTeX",
  xelatex: "XeLaTeX",
  lualatex: "LuaLaTeX",
  latex: "LaTeX",
};

const engineNotes: Array<{ id: string; title: string; detail: string }> = [
  { id: "pdflatex", title: "pdfLaTeX", detail: "Fastest for most articles and reports." },
  { id: "xelatex", title: "XeLaTeX", detail: "Unicode and system font support." },
  { id: "lualatex", title: "LuaLaTeX", detail: "Modern OpenType and scripting support." },
];

export interface CompilationHubProps {
  apiUrl: string;
}

type LatestBuild = { status: string; jobId: string };

export function CompilationHub({ apiUrl }: CompilationHubProps) {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<Record<string, LatestBuild>>({});

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`${apiUrl}/projects?filter=recent&order=updatedAt&limit=24`, {
          credentials: "include",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          if (!controller.signal.aborted) {
            setError(
              response.status === 401
                ? "Sign in to see compilation-ready projects."
                : "Projects could not be loaded for compilation.",
            );
            setLoading(false);
          }
          return;
        }
        const parsed = projectListViewSchema.safeParse(await response.json());
        if (!controller.signal.aborted) {
          setProjects(parsed.success ? parsed.data.items : []);
          setLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Projects could not be loaded for compilation.");
          setLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [apiUrl]);

  useEffect(() => {
    if (projects.length === 0) return;
    let active = true;
    void (async () => {
      const entries = await Promise.all(
        projects.map(async (project) => {
          try {
            const response = await fetch(`${apiUrl}/projects/${project.id}/compilations?limit=1`, {
              credentials: "include",
              headers: { accept: "application/json" },
            });
            if (!response.ok) return null;
            const body = (await response.json()) as {
              items?: Array<{ id?: string; status?: string }>;
            };
            const job = body.items?.[0];
            if (!job?.id || !job.status) return null;
            return [project.id, { status: job.status, jobId: job.id }] as const;
          } catch {
            return null;
          }
        }),
      );
      if (!active) return;
      const found: Array<[string, LatestBuild]> = [];
      for (const entry of entries) {
        if (entry) found.push([entry[0], entry[1]]);
      }
      setLatest(Object.fromEntries(found));
    })();
    return () => {
      active = false;
    };
  }, [apiUrl, projects]);

  return (
    <div className="page-column">
      <header className="page-header">
        <p className="eyebrow">TeX Engines &amp; Compilation</p>
        <h1>Project Compilation</h1>
        <p className="section-lead">
          Open any project straight into its compilation pane, inspect build diagnostics, and
          download the generated PDF. Each project keeps its configured engine.
        </p>
      </header>

      <section className="engine-grid" aria-label="Supported TeX engines">
        {engineNotes.map((engine) => (
          <article key={engine.id} className="engine-card">
            <span className={`badge badge-compiler ${engine.id}`}>{engine.title}</span>
            <p>{engine.detail}</p>
          </article>
        ))}
      </section>

      <section className="compilation-list" aria-label="Projects ready to compile">
        <div className="section-title-row">
          <h2>Ready to compile</h2>
          <Link to="/projects" className="link-quiet">
            Manage projects
          </Link>
        </div>

        {loading && <p role="status">Loading projects for compilation…</p>}
        {error && (
          <p role="alert" className="error-state">
            {error}
          </p>
        )}
        {!loading && !error && projects.length === 0 && (
          <p className="empty-state">No active projects yet. Create one to start compiling.</p>
        )}

        {!loading && !error && projects.length > 0 && (
          <ul className="compilation-items">
            {projects.map((project) => (
              <li key={project.id} className="compilation-item">
                <div className="compilation-item-main">
                  <Link to={`/project/${project.id}`} className="project-title-link">
                    {project.title}
                  </Link>
                  <p className="project-meta">
                    <span className={`badge badge-compiler ${project.compiler}`}>
                      {compilerLabel[project.compiler] ?? project.compiler}
                    </span>{" "}
                    <span className={`badge badge-status ${project.status}`}>
                      <span className="status-dot" aria-hidden="true" />
                      {project.status}
                    </span>
                    {latest[project.id] ? (
                      <span
                        className={`badge badge-status build-${latest[project.id]!.status}`}
                        title="Latest build"
                      >
                        <span className="status-dot" aria-hidden="true" />
                        build {latest[project.id]!.status}
                      </span>
                    ) : (
                      <span className="badge badge-status build-none">
                        <span className="status-dot" aria-hidden="true" />
                        no builds yet
                      </span>
                    )}
                    <span className="project-date">
                      Updated {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </p>
                </div>
                <div className="compilation-item-actions">
                  <Link
                    to={`/project/${project.id}/compilation`}
                    className="link-quiet"
                    aria-label={`View build diagnostics for ${project.title}`}
                  >
                    Diagnostics
                  </Link>
                  <Link
                    to={`/project/${project.id}/compilation`}
                    className="btn btn-primary btn-sm"
                  >
                    Open &amp; Compile
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
