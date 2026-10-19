import React, { useEffect, useState } from "react";
import type { TemplateView } from "@latex-collab/contracts";

export interface InstantiatedProject {
  id: string;
  title: string;
  templateId: string;
  templateVersion: string;
  mainFileId: string;
}

export interface TemplateCatalogueProps {
  apiUrl: string;
  onInstantiated?: ((project: InstantiatedProject) => void) | undefined;
}

/**
 * Versioned internal-template catalogue. Lists templates with their
 * versions and file manifests, filters by category, and instantiates with
 * an explicit title. Instantiation always creates a member-free project for
 * the current actor; failures surface inline and never report phantom
 * projects.
 */
export const TemplateCatalogue: React.FC<TemplateCatalogueProps> = ({ apiUrl, onInstantiated }) => {
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [category, setCategory] = useState("");
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const query = category ? `?category=${encodeURIComponent(category)}` : "";
        const response = await fetch(`${apiUrl}/templates${query}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          setError("The template catalogue is unavailable.");
          return;
        }
        const body = (await response.json()) as { templates: TemplateView[] };
        if (!controller.signal.aborted) {
          setTemplates(body.templates ?? []);
          setError(null);
        }
      } catch {
        if (!controller.signal.aborted) setError("The template catalogue is unavailable.");
      }
    })();
    return () => controller.abort();
  }, [apiUrl, category]);

  const instantiate = async (template: TemplateView) => {
    setPending(template.id);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/templates/${template.id}/instantiate`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: titles[template.id]?.trim() || template.title }),
      });
      if (!response.ok) {
        setError(`Could not instantiate ${template.title}.`);
        return;
      }
      const project = (await response.json()) as InstantiatedProject;
      onInstantiated?.(project);
    } catch {
      setError(`Could not instantiate ${template.title}.`);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="template-catalogue" data-testid="template-catalogue">
      <div className="catalogue-toolbar">
        <div className="category-pills" role="group" aria-label="Template categories">
          {[
            { id: "", label: "All templates" },
            { id: "article", label: "Articles" },
            { id: "thesis", label: "Theses" },
          ].map((entry) => (
            <button
              key={entry.id || "all"}
              type="button"
              className={`pill${category === entry.id ? " active" : ""}`}
              aria-pressed={category === entry.id}
              onClick={() => setCategory(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <label className="catalogue-select">
          <span>Category</span>
          <select
            data-testid="template-filter"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filter templates by category"
          >
            <option value="">All</option>
            <option value="article">Article</option>
            <option value="thesis">Thesis</option>
          </select>
        </label>
      </div>
      {error ? (
        <p data-testid="catalogue-error" role="alert" className="error-state">
          {error}
        </p>
      ) : null}
      {templates.length === 0 && !error ? (
        <p role="status" className="empty-state">
          No templates in this category yet.
        </p>
      ) : null}
      <ul className="template-grid">
        {templates.map((template) => (
          <li key={template.id} data-testid="template-card" className="template-card">
            <div className="template-card-head">
              <h3>{template.title}</h3>
              <span className="badge badge-version">v{template.version}</span>
            </div>
            <p className="template-description">{template.description}</p>
            <p className="template-meta">
              {template.files.length} file{template.files.length === 1 ? "" : "s"} ·{" "}
              <code>{template.mainPath}</code>
            </p>
            <div className="template-card-actions">
              <input
                data-testid="template-title-input"
                aria-label={`Project title for ${template.title}`}
                value={titles[template.id] ?? ""}
                placeholder={template.title}
                onChange={(event) =>
                  setTitles((current) => ({ ...current, [template.id]: event.target.value }))
                }
              />
              <button
                type="button"
                data-testid="template-instantiate"
                className="btn btn-primary btn-sm"
                disabled={pending === template.id}
                onClick={() => void instantiate(template)}
              >
                {pending === template.id ? "Creating…" : "Use template"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
