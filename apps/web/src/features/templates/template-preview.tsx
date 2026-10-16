import React, { useEffect, useState } from "react";
import type { TemplateDetailView } from "@latex-collab/contracts";
import type { InstantiatedProject } from "./catalogue.js";

export interface TemplatePreviewProps {
  apiUrl: string;
  templateId: string;
  onInstantiated?: ((project: InstantiatedProject) => void) | undefined;
}

/**
 * Template detail preview. Loads the real versioned manifest plus the main
 * source through the session-authed detail route and renders the file list
 * with hashes alongside the main source as escaped text. Instantiation
 * posts an explicit title and reports the created project; failures surface
 * inline and never report phantom projects.
 */
export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  apiUrl,
  templateId,
  onInstantiated,
}) => {
  const [detail, setDetail] = useState<TemplateDetailView | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setError(null);
    void (async () => {
      try {
        const response = await fetch(`${apiUrl}/templates/${templateId}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) {
          if (!controller.signal.aborted) setError("This template preview is unavailable.");
          return;
        }
        const body = (await response.json()) as TemplateDetailView;
        if (!controller.signal.aborted) setDetail(body);
      } catch {
        if (!controller.signal.aborted) setError("This template preview is unavailable.");
      }
    })();
    return () => controller.abort();
  }, [apiUrl, templateId]);

  const instantiate = async () => {
    if (!detail) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/templates/${detail.id}/instantiate`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() || detail.title }),
      });
      if (!response.ok) {
        setError(`Could not instantiate ${detail.title}.`);
        return;
      }
      const project = (await response.json()) as InstantiatedProject;
      onInstantiated?.(project);
    } catch {
      setError(`Could not instantiate ${detail?.title ?? templateId}.`);
    } finally {
      setPending(false);
    }
  };

  if (error) {
    return (
      <div data-testid="template-preview-error">
        <p>{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div data-testid="template-preview-loading">
        <p>Loading template preview…</p>
      </div>
    );
  }

  const mainSource = detail.contents.find((file) => file.path === detail.mainPath)?.content ?? "";

  return (
    <div data-testid="template-preview">
      <h3>{detail.title}</h3>
      <p>v{detail.version}</p>
      <p>{detail.description}</p>
      <p data-testid="template-manifest-hash">Manifest {detail.manifestHash}</p>
      <ul data-testid="template-file-list">
        {detail.files.map((file) => (
          <li key={file.path}>
            {file.path} · {file.sizeBytes} bytes · {file.sha256.slice(0, 8)}
          </li>
        ))}
      </ul>
      <pre data-testid="template-main-source">{mainSource}</pre>
      <input
        data-testid="template-title-input"
        aria-label={`Project title for ${detail.title}`}
        value={title}
        placeholder={detail.title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button data-testid="template-instantiate" disabled={pending} onClick={() => void instantiate()}>
        {pending ? "Creating…" : "Use template"}
      </button>
    </div>
  );
};
