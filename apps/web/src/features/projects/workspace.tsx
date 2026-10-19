import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { parsePublicConfig } from "@latex-collab/config";
import type { CompilationView, ProjectNodeView, ProjectView } from "@latex-collab/contracts";
import { FileTree } from "../files/file-tree.js";
import { FileUploader } from "../files/file-uploader.js";
import { BinaryPreview } from "../files/binary-preview.js";
import { ShareDialog } from "../sharing/share-dialog.js";
import { CommentAnchors } from "../review/comment-anchors.js";
import { ProjectChat } from "../chat/project-chat.js";
import { ReadOnlyTextDocument } from "../visual/mode-switch.js";
import { LiveTextDocument } from "../collab/live-document.js";
import { ProjectSettings } from "./settings.js";
import { GitHubSyncPanel } from "../integrations/github-sync.js";
import { CompileControls } from "../compilation/compile-controls.js";
import { PdfViewer } from "../pdf/pdf-viewer.js";
import { HistoryTimeline } from "../history/timeline.js";
import { VersionCompare } from "../history/version-compare.js";
import { ReferenceSearch } from "../references/search.js";
import { ZoteroLibraryPanel } from "../references/zotero.js";
import { ProjectSearch } from "../search/project-search.js";

const config = parsePublicConfig(import.meta.env);
const defaultApiUrl = config.VITE_API_URL;

export interface ProjectWorkspaceProps {
  projectId?: string | undefined;
  apiUrl?: string | undefined;
  csrfToken?: string | undefined;
  defaultShowCompile?: boolean | undefined;
}

export function ProjectWorkspace({
  projectId: propProjectId,
  apiUrl = defaultApiUrl,
  csrfToken,
  defaultShowCompile = true,
}: ProjectWorkspaceProps) {
  const { id: paramProjectId } = useParams<{ id: string }>();
  const projectId = propProjectId ?? paramProjectId ?? "";

  const [project, setProject] = useState<ProjectView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ProjectNodeView | null>(null);
  const [liveFileId, setLiveFileId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showGitHubSync, setShowGitHubSync] = useState(false);
  const [showPdf, setShowPdf] = useState(defaultShowCompile);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showReferencesModal, setShowReferencesModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [compareBaseNo, setCompareBaseNo] = useState<number | null>(null);
  const [compareTargetNo, setCompareTargetNo] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [latestJob, setLatestJob] = useState<CompilationView | null>(null);
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
            onClick={() => setShowPdf((value) => !value)}
            aria-pressed={showPdf}
          >
            {showPdf ? "Hide PDF" : "Show PDF"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowSearchModal(true)}
            aria-haspopup="dialog"
          >
            Search
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowReferencesModal(true)}
            aria-haspopup="dialog"
          >
            References
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowHistoryModal(true)}
            aria-haspopup="dialog"
          >
            History
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowGitHubSync((value) => !value)}
            aria-expanded={showGitHubSync}
            aria-controls="github-sync-workspace"
          >
            GitHub Sync
          </button>
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
        <>
          {showGitHubSync && (
            <div id="github-sync-workspace">
              <GitHubSyncPanel projectId={projectId} apiUrl={apiUrl} csrfToken={csrfToken} />
            </div>
          )}
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
                onSelectNode={(node) => {
                  setSelectedNode(node);
                  if (node.kind === "FILE" && node.contentKind === "TEXT") {
                    setLiveFileId(node.id);
                  } else {
                    setLiveFileId(null);
                  }
                }}
                refreshVersion={uploadVersion}
              />
            </aside>

            <section className="workspace-content" aria-label="Document view">
              {selectedNode?.kind === "FILE" && selectedNode.contentKind === "TEXT" ? (
                <div className="selected-node-panel">
                  <div className="node-panel-header">
                    <h2>{selectedNode.name}</h2>
                    <div className="node-panel-actions">
                      {liveFileId === selectedNode.id ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => setLiveFileId(null)}
                        >
                          View Read-Only
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => setLiveFileId(selectedNode.id)}
                        >
                          Enter Live Editor
                        </button>
                      )}
                    </div>
                  </div>
                  {liveFileId === selectedNode.id ? (
                    <LiveTextDocument
                      key={selectedNode.id}
                      projectId={projectId}
                      fileId={selectedNode.id}
                      fileName={selectedNode.name}
                      apiUrl={apiUrl}
                      csrfToken={csrfToken}
                      onExit={() => setLiveFileId(null)}
                    />
                  ) : (
                    <ReadOnlyTextDocument
                      key={selectedNode.id}
                      projectId={projectId}
                      fileId={selectedNode.id}
                      apiUrl={apiUrl}
                    />
                  )}
                  <CommentAnchors
                    projectId={projectId}
                    fileId={selectedNode.id}
                    apiUrl={apiUrl}
                    csrfToken={csrfToken}
                  />
                </div>
              ) : selectedNode?.kind === "FILE" && selectedNode.contentKind === "BINARY" ? (
                <div className="selected-node-panel">
                  <h2>{selectedNode.name}</h2>
                  <BinaryPreview
                    projectId={projectId}
                    apiUrl={apiUrl}
                    node={{
                      id: selectedNode.id,
                      name: selectedNode.name,
                      mime: selectedNode.mime,
                      contentKind: selectedNode.contentKind,
                      sizeBytes: selectedNode.sizeBytes,
                    }}
                  />
                </div>
              ) : selectedNode ? (
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
                </div>
              ) : (
                <div className="empty-selection">
                  <p>Select a file in the tree to begin editing or viewing.</p>
                </div>
              )}
              <ProjectChat
                key={projectId}
                projectId={projectId}
                apiUrl={apiUrl}
                csrfToken={csrfToken}
              />
            </section>

            {showPdf && (
              <aside className="workspace-pdf-pane" aria-label="PDF Preview and Compilation">
                <div className="pdf-pane-header">
                  <CompileControls
                    projectId={projectId}
                    defaultCompiler={project?.compiler ?? "pdflatex"}
                    apiBaseUrl={apiUrl}
                    onCompileComplete={(job) => {
                      setLatestJob(job);
                      if (job.status === "succeeded") {
                        setPdfUrl(
                          `${apiUrl}/projects/${projectId}/compilations/${job.id}/artifacts/output.pdf`,
                        );
                      }
                    }}
                  />
                </div>
                <div className="pdf-pane-body">
                  <PdfViewer
                    projectId={projectId}
                    pdfUrl={pdfUrl}
                    lastCompileStatus={
                      latestJob?.status === "cancel_requested"
                        ? "cancelled"
                        : (latestJob?.status ?? null)
                    }
                    onDownload={() => {
                      if (pdfUrl) window.open(pdfUrl, "_blank");
                    }}
                  />
                </div>
              </aside>
            )}
          </div>
        </>
      )}

      {showSettingsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Project Settings"
          className="workspace-modal-overlay"
        >
          <div className="workspace-modal-card">
            <div className="workspace-modal-header">
              <h2>Project Settings</h2>
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

      {showHistoryModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Project History"
          className="workspace-modal-overlay"
        >
          <div className="workspace-modal-card wide">
            <div className="workspace-modal-header">
              <h2>Revision History & Diffs</h2>
              <button type="button" onClick={() => setShowHistoryModal(false)}>
                Close
              </button>
            </div>
            {compareBaseNo !== null && compareTargetNo !== null ? (
              <VersionCompare
                projectId={projectId}
                baseRevisionNo={compareBaseNo}
                targetRevisionNo={compareTargetNo}
                apiUrl={apiUrl}
                onClose={() => {
                  setCompareBaseNo(null);
                  setCompareTargetNo(null);
                }}
              />
            ) : (
              <HistoryTimeline
                projectId={projectId}
                apiUrl={apiUrl}
                csrfToken={csrfToken}
                onCompareRevisions={(base, target) => {
                  setCompareBaseNo(base);
                  setCompareTargetNo(target);
                }}
              />
            )}
          </div>
        </div>
      )}

      {showReferencesModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="References and Citations"
          className="workspace-modal-overlay"
        >
          <div className="workspace-modal-card wide">
            <div className="workspace-modal-header">
              <h2>Academic References & Citations</h2>
              <button type="button" onClick={() => setShowReferencesModal(false)}>
                Close
              </button>
            </div>
            <div className="workspace-references-tabs">
              <section aria-label="BibTeX Search">
                <h3>BibTeX References</h3>
                <ReferenceSearch
                  bibSource=""
                  onSelectKey={(key) => {
                    navigator.clipboard?.writeText?.(key);
                  }}
                  onInsertCitation={(key) => {
                    navigator.clipboard?.writeText?.(`\\cite{${key}}`);
                  }}
                />
              </section>
              <section aria-label="Zotero Integration" style={{ marginTop: "24px" }}>
                <h3>Zotero Sync</h3>
                <ZoteroLibraryPanel
                  projectId={projectId}
                  userRole="OWNER"
                  connected={false}
                />
              </section>
            </div>
          </div>
        </div>
      )}

      {showSearchModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Project Search"
          className="workspace-modal-overlay"
        >
          <div className="workspace-modal-card">
            <div className="workspace-modal-header">
              <h2>Project Search & Replace</h2>
              <button type="button" onClick={() => setShowSearchModal(false)}>
                Close
              </button>
            </div>
            <ProjectSearch
              projectId={projectId}
              currentRevision={project?.currentRevision ?? 1}
              baseUrl={apiUrl}
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
