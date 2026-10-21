import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import * as Y from "yjs";
import { parsePublicConfig } from "@latex-collab/config";
import { treeViewSchema, type ProjectNodeView, type TreeView } from "@latex-collab/contracts";

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
  onRequestUpload?: (() => void) | undefined;
  onRequestDownloadZip?: (() => void) | undefined;
  downloadingZip?: boolean | undefined;
  /** Node id of the .tex root used by the compiler. */
  mainFileId?: string | null | undefined;
  onSetMainFile?: ((node: ProjectNodeView) => void) | undefined;
}

type IconName =
  | "more"
  | "star"
  | "copy"
  | "chevron-right"
  | "chevron-down"
  | "file"
  | "folder"
  | "folder-open"
  | "file-plus"
  | "folder-plus"
  | "upload"
  | "download"
  | "pencil"
  | "move"
  | "trash";

const iconPaths: Record<IconName, string> = {
  more: "M12 6h.01M12 12h.01M12 18h.01",
  star: "M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.3l6-.8z",
  copy: "M9 9h10v12H9zM5 3h10v4M5 3v12h4",
  "chevron-right": "M9 18l6-6-6-6",
  "chevron-down": "M6 9l6 6 6-6",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  "folder-open": "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3zM3 10h18l-2 9H5z",
  "file-plus": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 12v6M9 15h6",
  "folder-plus":
    "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v6M9 14h6",
  upload: "M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  download: "M12 4v12M7 11l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  pencil: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  move: "M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6",
};

function TreeIcon({ name, className = "tree-icon" }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function FileTree({
  projectId,
  apiUrl = defaultApiUrl,
  csrfToken,
  selectedNodeId,
  onSelectNode,
  refreshVersion,
  onRequestUpload,
  onRequestDownloadZip,
  downloadingZip = false,
  mainFileId = null,
  onSetMainFile,
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
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [rowBusyNodeId, setRowBusyNodeId] = useState<string | null>(null);
  const menuTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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

  const treeContainerRef = useRef<HTMLDivElement>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/nodes`, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "include",
        // Tree versions change on every mutation; never serve a cached listing.
        cache: "no-store",
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

  const openCreateDialog = (
    kind: "create-file" | "create-folder",
    parentId: string | null = null,
  ) => {
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
          mime:
            kind === "FILE"
              ? trimmed.endsWith(".tex")
                ? "application/x-tex"
                : "text/plain"
              : "application/octet-stream",
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

  const moveNode = useCallback(
    async (node: ProjectNodeView, targetParentId: string | null): Promise<string | null> => {
      const csrf = await getCsrfToken();
      const res = await fetch(`${apiUrl}/projects/${projectId}/nodes/${node.id}/move`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
          "if-match": `"${treeVersion}"`,
        },
        credentials: "include",
        body: JSON.stringify({ targetParentId }),
      });
      if (res.ok) return null;
      if (res.status === 400) return "Invalid destination: cannot move into self or descendant.";
      if (res.status === 409) return "Name collision at destination.";
      if (res.status === 412) return "Tree modified concurrently. Please refresh.";
      return "Failed to move node.";
    },
    [apiUrl, getCsrfToken, projectId, treeVersion],
  );

  const handleMoveSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetNode) return;

    setIsSubmitting(true);
    setDialogError(null);

    try {
      const failure = await moveNode(targetNode, dialogTargetParentId);
      if (failure) {
        setDialogError(failure);
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

  /** Is `candidateFolderId` inside the subtree of `node`? */
  const isDescendant = (node: ProjectNodeView, candidateFolderId: string): boolean => {
    let current = nodes.find((item) => item.id === candidateFolderId);
    while (current) {
      if (current.id === node.id) return true;
      const parentId: string | null = current.parentId;
      current = parentId ? nodes.find((item) => item.id === parentId) : undefined;
    }
    return false;
  };

  const canDropInto = (dragged: ProjectNodeView, folderId: string): boolean => {
    if (dragged.id === folderId) return false;
    if (dragged.kind === "FOLDER" && isDescendant(dragged, folderId)) return false;
    return true;
  };

  const handleRowDrop = (target: ProjectNodeView | null) => {
    const dragged = nodes.find((node) => node.id === draggingNodeId);
    setDraggingNodeId(null);
    setDropTargetId(null);
    if (!dragged) return;
    const targetParentId = target ? target.id : null;
    if (dragged.parentId === targetParentId) return;
    if (target && !canDropInto(dragged, target.id)) {
      setStatusMessage("A folder cannot be moved inside itself.");
      return;
    }
    setRowBusyNodeId(dragged.id);
    void (async () => {
      try {
        const failure = await moveNode(dragged, targetParentId);
        setStatusMessage(failure ?? `Moved ${dragged.name}`);
        await fetchTree();
        if (target) setExpandedFolders((previous) => new Set([...previous, target.id]));
      } catch {
        setStatusMessage("Network error while moving the item.");
        await fetchTree();
      } finally {
        setRowBusyNodeId(null);
      }
    })();
  };

  const uniqueCopyName = (node: ProjectNodeView): string => {
    const siblings = nodes.filter((item) => item.parentId === node.parentId);
    const dot = node.name.lastIndexOf(".");
    const stem = dot > 0 ? node.name.slice(0, dot) : node.name;
    const extension = dot > 0 ? node.name.slice(dot) : "";
    let candidate = `${stem}-copy${extension}`;
    let counter = 2;
    while (siblings.some((item) => item.name === candidate)) {
      candidate = `${stem}-copy-${counter}${extension}`;
      counter += 1;
    }
    return candidate;
  };

  const downloadNode = async (node: ProjectNodeView) => {
    if (node.kind !== "FILE") return;
    try {
      if (node.contentKind === "BINARY") {
        window.open(`${apiUrl}/projects/${projectId}/files/${node.id}/download`, "_blank");
        return;
      }
      const response = await fetch(`${apiUrl}/projects/${projectId}/files/${node.id}/text`, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(String(response.status));
      const state = (await response.json()) as { updateBase64: string };
      const sourceDocument = new Y.Doc();
      Y.applyUpdate(
        sourceDocument,
        Uint8Array.from(atob(state.updateBase64), (char) => char.charCodeAt(0)),
      );
      const blob = new Blob([sourceDocument.getText("content").toString()], {
        type: node.mime || "text/plain",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = node.name;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`Downloaded ${node.name}`);
    } catch {
      setStatusMessage(`Could not download ${node.name}.`);
    }
  };

  const duplicateNode = async (node: ProjectNodeView) => {
    setRowBusyNodeId(node.id);
    try {
      const copyName = uniqueCopyName(node);
      const csrf = await getCsrfToken();
      const created = await fetch(`${apiUrl}/projects/${projectId}/nodes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
          "if-match": `"${treeVersion}"`,
        },
        credentials: "include",
        body: JSON.stringify({
          name: copyName,
          parentId: node.parentId,
          kind: "FILE",
          mime: node.mime,
          contentKind: "TEXT",
        }),
      });
      if (!created.ok) {
        setStatusMessage(`Could not duplicate ${node.name}.`);
        await fetchTree();
        return;
      }
      const copy = (await created.json()) as ProjectNodeView;
      const sourceResponse = await fetch(`${apiUrl}/projects/${projectId}/files/${node.id}/text`, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!sourceResponse.ok) throw new Error("source unreadable");
      const sourceState = (await sourceResponse.json()) as { updateBase64: string };
      const sourceDoc = new Y.Doc();
      Y.applyUpdate(
        sourceDoc,
        Uint8Array.from(atob(sourceState.updateBase64), (char) => char.charCodeAt(0)),
      );
      const copyDoc = new Y.Doc();
      copyDoc.getText("content").insert(0, sourceDoc.getText("content").toString());
      const update = Y.encodeStateAsUpdate(copyDoc);
      const emptyVector = Y.encodeStateVector(new Y.Doc());
      const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
      const written = await fetch(`${apiUrl}/projects/${projectId}/files/${copy.id}/text`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          updateBase64: base64(update),
          baseStateVectorBase64: base64(emptyVector),
        }),
      });
      setStatusMessage(
        written.ok ? `Duplicated ${node.name}` : `Created ${copyName} without content.`,
      );
      await fetchTree();
    } catch {
      setStatusMessage(`Could not duplicate ${node.name}.`);
      await fetchTree();
    } finally {
      setRowBusyNodeId(null);
    }
  };

  const closeMenu = (restoreFocus: boolean) => {
    const nodeId = openMenuNodeId;
    setOpenMenuNodeId(null);
    if (restoreFocus && nodeId) menuTriggerRefs.current.get(nodeId)?.focus();
  };

  useEffect(() => {
    if (!openMenuNodeId) return;
    const menuNodeId = openMenuNodeId;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".file-tree-row-menu")) return;
      setOpenMenuNodeId(null);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenMenuNodeId(null);
      menuTriggerRefs.current.get(menuNodeId)?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuNodeId]);

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
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", node.id);
              setDraggingNodeId(node.id);
              setOpenMenuNodeId(null);
            }}
            onDragEnd={() => {
              setDraggingNodeId(null);
              setDropTargetId(null);
            }}
            onDragOver={(event) => {
              if (!draggingNodeId) return;
              const dragged = nodes.find((item) => item.id === draggingNodeId);
              if (!dragged) return;
              if (isFolder) {
                if (!canDropInto(dragged, node.id)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dropTargetId !== node.id) setDropTargetId(node.id);
              }
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              if (dropTargetId === node.id) setDropTargetId(null);
            }}
            onDrop={(event) => {
              if (!isFolder) return;
              event.preventDefault();
              event.stopPropagation();
              handleRowDrop(node);
            }}
            onClick={() => {
              setFocusedNodeId(node.id);
              if (isFolder) toggleFolder(node.id);
              if (onSelectNode) onSelectNode(node);
            }}
            className={[
              "file-tree-row",
              isSelected ? "selected" : "",
              isFolder ? "is-folder" : "",
              draggingNodeId === node.id ? "dragging" : "",
              dropTargetId === node.id ? "drop-target" : "",
              rowBusyNodeId === node.id ? "busy" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ paddingLeft: `${level * 14 + 6}px` }}
          >
            <span className="file-tree-label">
              {isFolder ? (
                <TreeIcon
                  name={isExpanded ? "chevron-down" : "chevron-right"}
                  className="tree-chevron"
                />
              ) : (
                <span className="tree-chevron-spacer" aria-hidden="true" />
              )}
              <TreeIcon
                name={isFolder ? (isExpanded ? "folder-open" : "folder") : "file"}
                className={isFolder ? "tree-icon folder" : "tree-icon"}
              />
              <span className="file-tree-name" title={node.name}>
                {node.name}
              </span>
              {node.id === mainFileId && (
                <span className="file-tree-main-badge" title="Compiled main document">
                  Main
                </span>
              )}
            </span>

            <span className="file-tree-actions">
              <button
                type="button"
                ref={(element) => {
                  if (element) menuTriggerRefs.current.set(node.id, element);
                  else menuTriggerRefs.current.delete(node.id);
                }}
                aria-label={`Actions for ${node.name}`}
                aria-haspopup="menu"
                aria-expanded={openMenuNodeId === node.id}
                title="More actions"
                className="tree-row-action tree-menu-trigger"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpenMenuNodeId((current) => (current === node.id ? null : node.id));
                }}
              >
                <TreeIcon name="more" className="tree-menu-dots" />
              </button>

              {openMenuNodeId === node.id && (
                <div
                  role="menu"
                  aria-label={`Actions menu for ${node.name}`}
                  className="file-tree-row-menu"
                  onClick={(event) => event.stopPropagation()}
                >
                  {isFolder && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        className="tree-menu-item"
                        aria-label={`Add file to ${node.name}`}
                        onClick={() => {
                          closeMenu(false);
                          openCreateDialog("create-file", node.id);
                        }}
                      >
                        New file
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="tree-menu-item"
                        aria-label={`Add folder to ${node.name}`}
                        onClick={() => {
                          closeMenu(false);
                          openCreateDialog("create-folder", node.id);
                        }}
                      >
                        New folder
                      </button>
                      <hr className="tree-menu-separator" />
                    </>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    className="tree-menu-item"
                    aria-label={`Rename ${node.name}`}
                    onClick={() => {
                      closeMenu(false);
                      openRenameDialog(node);
                    }}
                  >
                    Rename
                  </button>
                  {node.kind === "FILE" && (
                    <button
                      type="button"
                      role="menuitem"
                      className="tree-menu-item"
                      aria-label={`Download ${node.name}`}
                      onClick={() => {
                        closeMenu(false);
                        void downloadNode(node);
                      }}
                    >
                      Download
                    </button>
                  )}
                  {node.kind === "FILE" && (
                    <button
                      type="button"
                      role="menuitem"
                      className="tree-menu-item"
                      aria-label={`Duplicate ${node.name}`}
                      disabled={node.contentKind !== "TEXT"}
                      title={
                        node.contentKind === "TEXT"
                          ? "Create a copy in the same folder"
                          : "Only text files can be duplicated"
                      }
                      onClick={() => {
                        closeMenu(false);
                        void duplicateNode(node);
                      }}
                    >
                      Duplicate
                    </button>
                  )}
                  {node.kind === "FILE" &&
                    node.name.toLowerCase().endsWith(".tex") &&
                    onSetMainFile && (
                      <button
                        type="button"
                        role="menuitem"
                        className="tree-menu-item"
                        aria-label={`Set ${node.name} as main document`}
                        disabled={node.id === mainFileId}
                        onClick={() => {
                          closeMenu(false);
                          onSetMainFile(node);
                        }}
                      >
                        <TreeIcon name="star" className="tree-menu-icon" />
                        {node.id === mainFileId ? "Main document" : "Set as main document"}
                      </button>
                    )}
                  <button
                    type="button"
                    role="menuitem"
                    className="tree-menu-item"
                    aria-label={`Move ${node.name}`}
                    onClick={() => {
                      closeMenu(false);
                      openMoveDialog(node);
                    }}
                  >
                    Move to…
                  </button>
                  <hr className="tree-menu-separator" />
                  <button
                    type="button"
                    role="menuitem"
                    className="tree-menu-item danger"
                    aria-label={`Delete ${node.name}`}
                    onClick={() => {
                      closeMenu(false);
                      openDeleteDialog(node);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
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
    <section role="region" aria-label="File tree panel" className="file-tree">
      {/* Compact header with file operations */}
      <header className="file-tree-header">
        <div className="file-tree-title-row">
          <h2>Project Files</h2>
          <span className="file-tree-count" aria-hidden="true">
            {nodes.length}
          </span>
        </div>
        <div role="toolbar" aria-label="File tree toolbar" className="file-tree-toolbar">
          <button
            type="button"
            aria-label="New file"
            title="New file"
            onClick={() => openCreateDialog("create-file", null)}
            className="tree-tool-btn"
          >
            <TreeIcon name="file-plus" />
          </button>
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            onClick={() => openCreateDialog("create-folder", null)}
            className="tree-tool-btn"
          >
            <TreeIcon name="folder-plus" />
          </button>
          {onRequestUpload && (
            <button
              type="button"
              aria-label="Upload files"
              title="Upload files or a ZIP archive"
              onClick={onRequestUpload}
              className="tree-tool-btn"
            >
              <TreeIcon name="upload" />
            </button>
          )}
          {onRequestDownloadZip && (
            <button
              type="button"
              aria-label="Download project ZIP"
              title="Download the project as a ZIP archive"
              onClick={onRequestDownloadZip}
              disabled={downloadingZip}
              className="tree-tool-btn"
            >
              <TreeIcon name="download" />
            </button>
          )}
        </div>
      </header>

      {/* Breadcrumb / Path status */}
      <nav role="navigation" aria-label="File path breadcrumb" className="file-tree-breadcrumb">
        <TreeIcon name="folder-open" />
        <span>Project Root</span>
        {selectedNodeId && nodes.find((n) => n.id === selectedNodeId) && (
          <span className="file-tree-breadcrumb-current">
            / {nodes.find((n) => n.id === selectedNodeId)!.name}
          </span>
        )}
      </nav>

      {/* Live announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      {/* Tree Content */}
      <div
        ref={treeContainerRef}
        role="tree"
        aria-label="Project files tree"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => {
          if (!draggingNodeId) return;
          const dragged = nodes.find((item) => item.id === draggingNodeId);
          if (!dragged || dragged.parentId === null) return;
          event.preventDefault();
          if (dropTargetId !== "__root__") setDropTargetId("__root__");
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (dropTargetId === "__root__") setDropTargetId(null);
        }}
        onDrop={(event) => {
          if (!draggingNodeId) return;
          event.preventDefault();
          handleRowDrop(null);
        }}
        className={`file-tree-scroll${dropTargetId === "__root__" ? " drop-target-root" : ""}`}
      >
        {loading && <div className="file-tree-empty">Loading files...</div>}
        {error && (
          <div role="alert" className="file-tree-error">
            {error}
          </div>
        )}
        {!loading && !error && nodes.length === 0 && (
          <div className="file-tree-empty">
            <p>No files in project.</p>
            <p className="file-tree-empty-hint">Create a file or drop sources here to start.</p>
          </div>
        )}
        {!loading && !error && renderTreeNodes(null, 1)}
        {draggingNodeId && (
          <p className="file-tree-drop-hint" aria-hidden="true">
            Drop on a folder, or here to move to the project root.
          </p>
        )}
      </div>

      {/* Modals & Dialogs */}
      {activeDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          className="tree-dialog-overlay"
        >
          <div className="tree-dialog-card">
            <h3 id="dialog-title">
              {activeDialog === "create-file" && "New File"}
              {activeDialog === "create-folder" && "New Folder"}
              {activeDialog === "rename" && `Rename "${targetNode?.name}"`}
              {activeDialog === "move" && `Move "${targetNode?.name}"`}
              {activeDialog === "delete" && `Delete "${targetNode?.name}"?`}
            </h3>

            {dialogError && (
              <div role="alert" className="tree-dialog-error">
                {dialogError}
              </div>
            )}

            {(activeDialog === "create-file" || activeDialog === "create-folder") && (
              <form
                onSubmit={(e) =>
                  handleCreateSubmit(e, activeDialog === "create-file" ? "FILE" : "FOLDER")
                }
              >
                <div className="tree-dialog-field">
                  <label htmlFor="node-name-input">Name:</label>
                  <input
                    id="node-name-input"
                    type="text"
                    value={dialogInputName}
                    onChange={(e) => setDialogInputName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div className="tree-dialog-actions">
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
                <div className="tree-dialog-field">
                  <label htmlFor="rename-input">New name:</label>
                  <input
                    id="rename-input"
                    type="text"
                    value={dialogInputName}
                    onChange={(e) => setDialogInputName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div className="tree-dialog-actions">
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
                <div className="tree-dialog-field">
                  <label htmlFor="move-dest-select">Destination folder:</label>
                  <select
                    id="move-dest-select"
                    value={dialogTargetParentId ?? "ROOT"}
                    onChange={(e) =>
                      setDialogTargetParentId(e.target.value === "ROOT" ? null : e.target.value)
                    }
                  >
                    <option value="ROOT">/ (Root folder)</option>
                    {availableFolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        /{f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="tree-dialog-actions">
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
                <p className="tree-dialog-note">
                  Are you sure you want to delete this {targetNode?.kind.toLowerCase()}? This action
                  can be undone only by restoring a revision.
                </p>
                <div className="tree-dialog-actions">
                  <button type="button" onClick={closeDialog} disabled={isSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting} className="tree-dialog-danger">
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
