import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { parsePublicConfig } from "@latex-collab/config";
import type { ProjectNodeView, ProjectView } from "@latex-collab/contracts";
import { FileTree } from "../files/file-tree.js";
import { FileUploader } from "../files/file-uploader.js";
import { ShareDialog } from "../sharing/share-dialog.js";
import { CommentAnchors } from "../review/comment-anchors.js";
import { ProjectSettings } from "./settings.js";

const config = parsePublicConfig(import.meta.env);
const defaultApiUrl = config.VITE_API_URL;

export interface ProjectWorkspaceProps {
  projectId?: string | undefined;
  apiUrl?: string | undefined;
  csrfToken?: string | undefined;
}

export function ProjectWorkspace({
  projectId: propProjectId,
  apiUrl = defaultApiUrl,
  csrfToken,
}: ProjectWorkspaceProps) {
  const { id: paramProjectId } = useParams<{ id: string }>();
  const projectId = propProjectId ?? paramProjectId ?? "";

  const [project, setProject] = useState<ProjectView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ProjectNodeView | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [uploadVersion, setUploadVersion] = useState(0);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}`, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          setError("Please sign in to view this project.");
        } else if (res.status === 403 || res.status === 404) {
          setError("Project not found or access denied.");
        } else {
          setError(`Error loading project (${res.status}).`);
        }
        return;
      }
      const data = (await res.json()) as ProjectView;
      setProject(data);
    } catch {
      setError("Network error loading project.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, projectId]);

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  if (!projectId) {
    return (
      <div role="region" aria-label="Project workspace error">
        <p role="alert">Missing project identifier.</p>
        <Link to="/dashboard">Return to dashboard</Link>
      </div>
    );
  }

  return (
    <div className="project-workspace" role="region" aria-label="Project workspace">
      <header className="workspace-header">
        <nav aria-label="Workspace breadcrumbs">
          <Link to="/dashboard">Projects</Link>
          <span aria-hidden="true"> / </span>
          <span>{project ? project.title : "Loading…"}</span>
        </nav>
        <div className="workspace-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowShareDialog(true)}
            aria-haspopup="dialog"
            aria-label="Share project"
          >
            Share
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowSettingsModal(true)}
            aria-haspopup="dialog"
            aria-label="Open project settings"
          >
            Project Settings
          </button>
        </div>
      </header>

      {loading && (
        <div role="status" aria-live="polite">
          <p>Loading project workspace…</p>
        </div>
      )}

      {error && (
        <div role="alert" className="error-banner">
          <p>{error}</p>
          <Link to="/dashboard">Return to dashboard</Link>
        </div>
      )}

      {!loading && !error && (
        <div className="workspace-layout">
          <aside className="workspace-sidebar" aria-label="Project files">
            <FileUploader
              projectId={projectId}
              apiUrl={apiUrl}
              csrfToken={csrfToken}
              onUploaded={() => setUploadVersion((value) => value + 1)}
            />
            <FileTree
              projectId={projectId}
              apiUrl={apiUrl}
              csrfToken={csrfToken}
              selectedNodeId={selectedNode?.id}
              onSelectNode={(node) => setSelectedNode(node)}
              refreshVersion={uploadVersion}
            />
          </aside>

          <section className="workspace-content" aria-label="Document view">
            {selectedNode ? (
              <div className="selected-node-panel">
                <h2>{selectedNode.name}</h2>
                <dl>
                  <dt>Kind</dt>
                  <dd>{selectedNode.kind}</dd>
                  <dt>MIME</dt>
                  <dd>{selectedNode.mime}</dd>
                  <dt>Content Kind</dt>
                  <dd>{selectedNode.contentKind}</dd>
                  <dt>Size</dt>
                  <dd>{selectedNode.sizeBytes} bytes</dd>
                </dl>
                {selectedNode.kind === "FILE" && selectedNode.contentKind === "TEXT" && (
                  <CommentAnchors
                    projectId={projectId}
                    fileId={selectedNode.id}
                    apiUrl={apiUrl}
                    csrfToken={csrfToken}
                  />
                )}
              </div>
            ) : (
              <div className="empty-selection">
                <p>Select a file in the tree to view details.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {showSettingsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Project Settings"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "#fff",
              padding: "24px",
              borderRadius: "8px",
              maxWidth: "600px",
              width: "90%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "16px",
              }}
            >
              <h2 style={{ margin: 0 }}>Project Settings</h2>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  void fetchProject();
                }}
              >
                Close
              </button>
            </div>
            <ProjectSettings
              projectId={projectId}
              apiUrl={apiUrl}
              csrfToken={csrfToken}
              onSaved={() => {
                setShowSettingsModal(false);
                void fetchProject();
              }}
            />
          </div>
        </div>
      )}
      {showShareDialog && (
        <ShareDialog
          projectId={projectId}
          apiUrl={apiUrl}
          csrfToken={csrfToken}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </div>
  );
}
