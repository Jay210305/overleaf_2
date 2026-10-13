import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { parsePublicConfig } from "@latex-collab/config";
import {
  treeViewSchema,
  type ProjectNodeView,
  type TreeView,
} from "@latex-collab/contracts";

const config = parsePublicConfig(import.meta.env);
const defaultApiUrl = config.VITE_API_URL;

export type DialogKind = "create-file" | "create-folder" | "rename" | "move" | "delete";

export interface FileTreeProps {
  projectId: string;
  apiUrl?: string | undefined;
  csrfToken?: string | undefined;
  selectedNodeId?: string | null | undefined;
  onSelectNode?: ((node: ProjectNodeView) => void) | undefined;
  refreshVersion?: number | undefined;
}

export function FileTree({
  projectId,
  apiUrl = defaultApiUrl,
  csrfToken,
  selectedNodeId,
  onSelectNode,
  refreshVersion,
}: FileTreeProps) {
  const [nodes, setNodes] = useState<ProjectNodeView[]>([]);
  const [treeVersion, setTreeVersion] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Active dialog
  const [activeDialog, setActiveDialog] = useState<DialogKind | null>(null);
  const [targetNode, setTargetNode] = useState<ProjectNodeView | null>(null);
  const [dialogInputName, setDialogInputName] = useState<string>("");
  const [dialogTargetParentId, setDialogTargetParentId] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
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

  const treeContainerRef = useRef<HTMLDivElement>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/nodes`, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError("Your session has expired. Please sign in again.");
        } else if (res.status === 403 || res.status === 404) {
          setError("Project or nodes not found or access denied.");
        } else {
          setError("Failed to load project files.");
        }
        setNodes([]);
        return;
      }

      const json = await res.json();
      const parsed = treeViewSchema.safeParse(json);
      if (parsed.success) {
        setNodes(parsed.data.items);
        setTreeVersion(parsed.data.treeVersion);
      } else {
        const fallback = json as TreeView;
        setNodes(fallback.items ?? []);
        setTreeVersion(fallback.treeVersion ?? 0);
      }
    } catch {
      setError("Network error while loading file tree.");
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, projectId]);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree, refreshVersion]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const openCreateDialog = (kind: "create-file" | "create-folder", parentId: string | null = null) => {
    setActiveDialog(kind);
    setDialogInputName("");
    setDialogTargetParentId(parentId);
    setDialogError(null);
  };

  const openRenameDialog = (node: ProjectNodeView) => {
    setActiveDialog("rename");
    setTargetNode(node);
    setDialogInputName(node.name);
    setDialogError(null);
  };

  const openMoveDialog = (node: ProjectNodeView) => {
    setActiveDialog("move");
    setTargetNode(node);
    setDialogTargetParentId(node.parentId);
    setDialogError(null);
  };

  const openDeleteDialog = (node: ProjectNodeView) => {
    setActiveDialog("delete");
    setTargetNode(node);
    setDialogError(null);
  };

  const closeDialog = () => {
    setActiveDialog(null);
    setTargetNode(null);
    setDialogInputName("");
    setDialogTargetParentId(null);
    setDialogError(null);
    setIsSubmitting(false);
  };

  const handleCreateSubmit = async (e: FormEvent, kind: "FILE" | "FOLDER") => {
    e.preventDefault();
    const trimmed = dialogInputName.trim();
    if (!trimmed) {
      setDialogError("Name cannot be empty.");
      return;
    }
    if (trimmed.includes("/") || trimmed.includes("\\") || trimmed === "." || trimmed === "..") {
      setDialogError("Invalid name: path traversal characters are not permitted.");
      return;
    }

    setIsSubmitting(true);
    setDialogError(null);

    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/nodes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
          "if-match": `"${treeVersion}"`,
        },
        credentials: "include",
        body: JSON.stringify({
          name: trimmed,
          parentId: dialogTargetParentId,
          kind,
          mime: kind === "FILE" ? (trimmed.endsWith(".tex") ? "application/x-tex" : "text/plain") : "application/octet-stream",
          contentKind: kind === "FILE" ? "TEXT" : "BINARY",
        }),
      });

      if (!res.ok) {
        if (res.status === 409) {
          setDialogError(`A file or folder with name "${trimmed}" already exists.`);
        } else if (res.status === 412) {
          setDialogError("Tree state changed concurrently. Please refresh.");
        } else if (res.status === 403) {
          setDialogError("Permission denied: you cannot edit this project.");
        } else {
          setDialogError("Failed to create node. Please verify the name.");
        }
        await fetchTree(); // Refresh to prevent phantom nodes
        return;
      }

      const createdNode = (await res.json()) as ProjectNodeView;
      setStatusMessage(`Created ${trimmed}`);
      closeDialog();
      await fetchTree();

      // If created inside a folder, ensure folder is expanded
      if (dialogTargetParentId) {
        setExpandedFolders((prev) => new Set([...prev, dialogTargetParentId]));
      }
      if (onSelectNode) {
        onSelectNode(createdNode);
      }
    } catch {
      setDialogError("Network error. Please try again.");
      await fetchTree();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRenameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetNode) return;
    const trimmed = dialogInputName.trim();
    if (!trimmed) {
      setDialogError("Name cannot be empty.");
      return;
    }
    if (trimmed === targetNode.name) {
      closeDialog();
      return;
    }

    setIsSubmitting(true);
    setDialogError(null);

    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/nodes/${targetNode.id}/rename`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
          "if-match": `"${treeVersion}"`,
        },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });

      if (!res.ok) {
        if (res.status === 409) {
          setDialogError(`A sibling with name "${trimmed}" already exists.`);
        } else if (res.status === 412) {
          setDialogError("Version mismatch. Please refresh.");
        } else if (res.status === 403) {
          setDialogError("Permission denied.");
        } else {
          setDialogError("Failed to rename node.");
        }
        await fetchTree();
        return;
      }

      setStatusMessage(`Renamed to ${trimmed}`);
      closeDialog();
      await fetchTree();
    } catch {
      setDialogError("Network error. Please try again.");
      await fetchTree();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMoveSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetNode) return;

    setIsSubmitting(true);
    setDialogError(null);

    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/nodes/${targetNode.id}/move`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
          "if-match": `"${treeVersion}"`,
        },
        credentials: "include",
        body: JSON.stringify({ targetParentId: dialogTargetParentId }),
      });

      if (!res.ok) {
        if (res.status === 400) {
          setDialogError("Invalid destination: cannot move into self or descendant.");
        } else if (res.status === 409) {
          setDialogError("Name collision at destination.");
        } else if (res.status === 412) {
          setDialogError("Tree modified concurrently. Please refresh.");
        } else {
          setDialogError("Failed to move node.");
        }
        await fetchTree();
        return;
      }

      setStatusMessage(`Moved ${targetNode.name}`);
      closeDialog();
      await fetchTree();
    } catch {
      setDialogError("Network error. Please try again.");
      await fetchTree();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetNode) return;

    setIsSubmitting(true);
    setDialogError(null);

    try {
      const csrf = await getCsrfToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/nodes/${targetNode.id}`, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
          "if-match": `"${treeVersion}"`,
        },
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 412) {
          setDialogError("Version mismatch. Please refresh.");
        } else if (res.status === 403) {
          setDialogError("Permission denied.");
        } else {
          setDialogError("Failed to delete node.");
        }
        await fetchTree();
        return;
      }

      setStatusMessage(`Deleted ${targetNode.name}`);
      closeDialog();
      await fetchTree();
    } catch {
      setDialogError("Network error. Please try again.");
      await fetchTree();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Keyboard navigation within the tree
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (nodes.length === 0) return;

    // Build visible nodes list in traversal order
    const visible: ProjectNodeView[] = [];
    const traverse = (parentId: string | null) => {
      const children = nodes.filter((n) => n.parentId === parentId);
      for (const child of children) {
        visible.push(child);
        if (child.kind === "FOLDER" && expandedFolders.has(child.id)) {
          traverse(child.id);
        }
      }
    };
    traverse(null);

    const currentIndex = visible.findIndex((n) => n.id === focusedNodeId);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = currentIndex < visible.length - 1 ? currentIndex + 1 : 0;
      setFocusedNodeId(visible[nextIndex]?.id ?? null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : visible.length - 1;
      setFocusedNodeId(visible[prevIndex]?.id ?? null);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const current = visible[currentIndex];
      if (current && current.kind === "FOLDER") {
        if (!expandedFolders.has(current.id)) {
          toggleFolder(current.id);
        } else {
          const next = visible[currentIndex + 1];
          if (next && next.parentId === current.id) {
            setFocusedNodeId(next.id);
          }
        }
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const current = visible[currentIndex];
      if (current && current.kind === "FOLDER" && expandedFolders.has(current.id)) {
        toggleFolder(current.id);
      } else if (current && current.parentId) {
        setFocusedNodeId(current.parentId);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const current = visible[currentIndex];
      if (current) {
        if (current.kind === "FOLDER") {
          toggleFolder(current.id);
        }
        if (onSelectNode) {
          onSelectNode(current);
        }
      }
    }
  };

  // Available folder options for move dialog
  const availableFolders = nodes.filter(
    (n) => n.kind === "FOLDER" && (!targetNode || n.id !== targetNode.id),
  );

  // Recursive tree node renderer
  const renderTreeNodes = (parentId: string | null, level: number = 1): ReactNode[] => {
    const children = nodes.filter((n) => n.parentId === parentId);
    return children.map((node) => {
      const isFolder = node.kind === "FOLDER";
      const isExpanded = expandedFolders.has(node.id);
      const isSelected = selectedNodeId === node.id;
      const isFocused = (focusedNodeId ?? nodes[0]?.id) === node.id;

      return (
        <div key={node.id} role="none">
          <div
            role="treeitem"
            id={`node-${node.id}`}
            aria-selected={isSelected}
            aria-expanded={isFolder ? isExpanded : undefined}
            aria-level={level}
            aria-label={`${node.name} (${isFolder ? "folder" : "file"})`}
            tabIndex={isFocused ? 0 : -1}
            onClick={() => {
              setFocusedNodeId(node.id);
              if (isFolder) toggleFolder(node.id);
              if (onSelectNode) onSelectNode(node);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "4px 8px",
              paddingLeft: `${level * 16}px`,
              background: isSelected ? "#e0e7ff" : "transparent",
              cursor: "pointer",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span>{isFolder ? (isExpanded ? "📂" : "📁") : "📄"}</span>
              <span style={{ fontWeight: isFolder ? 600 : 400 }}>{node.name}</span>
            </span>

            {/* Actions Context Menu Buttons */}
            <span
              role="group"
              aria-label={`Actions for ${node.name}`}
              style={{ display: "flex", gap: "4px" }}
              onClick={(e) => e.stopPropagation()}
            >
              {isFolder && (
                <button
                  type="button"
                  aria-label={`Add file to ${node.name}`}
                  onClick={() => openCreateDialog("create-file", node.id)}
                  style={{ minWidth: "24px", minHeight: "24px", padding: "2px", fontSize: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  +📄
                </button>
              )}
              {isFolder && (
                <button
                  type="button"
                  aria-label={`Add folder to ${node.name}`}
                  onClick={() => openCreateDialog("create-folder", node.id)}
                  style={{ minWidth: "24px", minHeight: "24px", padding: "2px", fontSize: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  +📁
                </button>
              )}
              <button
                type="button"
                aria-label={`Rename ${node.name}`}
                onClick={() => openRenameDialog(node)}
                style={{ minWidth: "24px", minHeight: "24px", padding: "2px", fontSize: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                ✏️
              </button>
              <button
                type="button"
                aria-label={`Move ${node.name}`}
                onClick={() => openMoveDialog(node)}
                style={{ minWidth: "24px", minHeight: "24px", padding: "2px", fontSize: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                📦
              </button>
              <button
                type="button"
                aria-label={`Delete ${node.name}`}
                onClick={() => openDeleteDialog(node)}
                style={{ minWidth: "24px", minHeight: "24px", padding: "2px", fontSize: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                🗑️
              </button>
            </span>
          </div>

          {isFolder && isExpanded && (
            <div role="group" aria-label={`${node.name} contents`}>
              {renderTreeNodes(node.id, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <section
      role="region"
      aria-label="File tree panel"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Header and Toolbar */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>Project Files</h2>
        <div role="toolbar" aria-label="File tree toolbar" style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            aria-label="New file"
            onClick={() => openCreateDialog("create-file", null)}
            style={{ fontSize: "12px", padding: "4px 8px" }}
          >
            New File
          </button>
          <button
            type="button"
            aria-label="New folder"
            onClick={() => openCreateDialog("create-folder", null)}
            style={{ fontSize: "12px", padding: "4px 8px" }}
          >
            New Folder
          </button>
        </div>
      </header>

      {/* Breadcrumb / Path status */}
      <nav role="navigation" aria-label="File path breadcrumb" style={{ padding: "4px 12px", fontSize: "12px", color: "#6b7280" }}>
        <span>Project Root</span>
        {selectedNodeId && nodes.find((n) => n.id === selectedNodeId) && (
          <span> / {nodes.find((n) => n.id === selectedNodeId)!.name}</span>
        )}
      </nav>

      {/* Live announcements */}
      <div role="status" aria-live="polite" style={{ position: "absolute", left: "-9999px" }}>
        {statusMessage}
      </div>

      {/* Tree Content */}
      <div
        ref={treeContainerRef}
        role="tree"
        aria-label="Project files tree"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 0",
          outline: "none",
        }}
      >
        {loading && <div style={{ padding: "12px", color: "#6b7280" }}>Loading files...</div>}
        {error && (
          <div role="alert" style={{ padding: "12px", color: "#dc2626" }}>
            {error}
          </div>
        )}
        {!loading && !error && nodes.length === 0 && (
          <div style={{ padding: "12px", color: "#6b7280" }}>No files in project.</div>
        )}
        {!loading && !error && renderTreeNodes(null, 1)}
      </div>

      {/* Modals & Dialogs */}
      {activeDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "20px",
              borderRadius: "8px",
              width: "360px",
              maxWidth: "90%",
            }}
          >
            <h3 id="dialog-title" style={{ marginTop: 0 }}>
              {activeDialog === "create-file" && "New File"}
              {activeDialog === "create-folder" && "New Folder"}
              {activeDialog === "rename" && `Rename "${targetNode?.name}"`}
              {activeDialog === "move" && `Move "${targetNode?.name}"`}
              {activeDialog === "delete" && `Delete "${targetNode?.name}"?`}
            </h3>

            {dialogError && (
              <div role="alert" style={{ color: "#dc2626", marginBottom: "12px", fontSize: "13px" }}>
                {dialogError}
              </div>
            )}

            {(activeDialog === "create-file" || activeDialog === "create-folder") && (
              <form
                onSubmit={(e) =>
                  handleCreateSubmit(e, activeDialog === "create-file" ? "FILE" : "FOLDER")
                }
              >
                <div style={{ marginBottom: "12px" }}>
                  <label htmlFor="node-name-input" style={{ display: "block", marginBottom: "4px", fontSize: "13px" }}>
                    Name:
                  </label>
                  <input
                    id="node-name-input"
                    type="text"
                    value={dialogInputName}
                    onChange={(e) => setDialogInputName(e.target.value)}
                    autoFocus
                    required
                    style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button type="button" onClick={closeDialog} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Create"}
                  </button>
                </div>
              </form>
            )}

            {activeDialog === "rename" && (
              <form onSubmit={handleRenameSubmit}>
                <div style={{ marginBottom: "12px" }}>
                  <label htmlFor="rename-input" style={{ display: "block", marginBottom: "4px", fontSize: "13px" }}>
                    New name:
                  </label>
                  <input
                    id="rename-input"
                    type="text"
                    value={dialogInputName}
                    onChange={(e) => setDialogInputName(e.target.value)}
                    autoFocus
                    required
                    style={{ width: "100%", padding: "6px", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button type="button" onClick={closeDialog} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Renaming..." : "Rename"}
                  </button>
                </div>
              </form>
            )}

            {activeDialog === "move" && (
              <form onSubmit={handleMoveSubmit}>
                <div style={{ marginBottom: "12px" }}>
                  <label htmlFor="move-dest-select" style={{ display: "block", marginBottom: "4px", fontSize: "13px" }}>
                    Destination folder:
                  </label>
                  <select
                    id="move-dest-select"
                    value={dialogTargetParentId ?? "ROOT"}
                    onChange={(e) =>
                      setDialogTargetParentId(e.target.value === "ROOT" ? null : e.target.value)
                    }
                    style={{ width: "100%", padding: "6px" }}
                  >
                    <option value="ROOT">/ (Root folder)</option>
                    {availableFolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        /{f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button type="button" onClick={closeDialog} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Moving..." : "Move"}
                  </button>
                </div>
              </form>
            )}

            {activeDialog === "delete" && (
              <form onSubmit={handleDeleteSubmit}>
                <p style={{ fontSize: "13px", color: "#4b5563" }}>
                  Are you sure you want to delete this {targetNode?.kind.toLowerCase()}? This action can be undone only by restoring a revision.
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button type="button" onClick={closeDialog} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} style={{ backgroundColor: "#dc2626", color: "#fff" }}>
                    {isSubmitting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
