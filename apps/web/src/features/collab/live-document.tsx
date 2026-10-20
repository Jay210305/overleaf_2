import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { durableAckSchema, ticketViewSchema } from "@latex-collab/contracts";
import {
  applyFigureCaptionPatch,
  applyFigureLabelPatch,
  applyFormulaPatch,
  applyHeadingPatch,
  applyListItemPatch,
  applyParagraphPatch,
  applyTableCellPatch,
  parseVisualAst,
} from "@latex-collab/editor";
import type { VisualPatchResult } from "@latex-collab/contracts";
import { LatexCodeEditor } from "../editor/latex-code-editor.js";
import { AcademicVisualNodesView } from "../visual/academic-nodes.js";
import { BasicVisualNodesView } from "../visual/basic-nodes.js";
import { VisualLiteralFallback } from "../visual/fallback-node.js";
import { EditorModeSwitch } from "../visual/mode-switch.js";

type SaveStatus = "saved" | "saving" | "offline" | "error";

function fromBase64(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(""));
}

function covers(server: Uint8Array, local: Uint8Array): boolean {
  const serverClocks = Y.decodeStateVector(server);
  for (const [clientId, clock] of Y.decodeStateVector(local)) {
    if ((serverClocks.get(clientId) ?? 0) < clock) return false;
  }
  return true;
}

export interface LiveTextDocumentProps {
  projectId: string;
  fileId: string;
  fileName: string;
  apiUrl: string;
  csrfToken?: string | undefined;
  onExit?: (() => void) | undefined;
}

export function LiveTextDocument({
  projectId,
  fileId,
  fileName,
  apiUrl,
  csrfToken,
  onExit,
}: LiveTextDocumentProps) {
  const doc = useMemo(() => new Y.Doc(), [projectId, fileId]);
  const yText = doc.getText("content");
  const [ready, setReady] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [mode, setMode] = useState<"code" | "visual">("code");
  const [status, setStatus] = useState<SaveStatus>("offline");
  const [message, setMessage] = useState<string | null>(null);
  const [sourceVersion, setSourceVersion] = useState(0);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let connected = false;
    const pending: Array<{ update: Uint8Array; vector: Uint8Array }> = [];
    const textObserver = () => setSourceVersion((version) => version + 1);
    yText.observe(textObserver);

    const send = (update: Uint8Array) => {
      if (connected && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "sync.update", updateBase64: toBase64(update) }));
      }
    };
    const updateObserver = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      pending.push({ update, vector: Y.encodeStateVector(doc) });
      setStatus("saving");
      send(update);
    };
    doc.on("update", updateObserver);

    const connect = async () => {
      try {
        const token = csrfToken ?? sessionStorage.getItem("csrf_token") ?? "";
        const requestTicket = async (action: "write" | "read") =>
          fetch(`${apiUrl}/projects/${projectId}/collab-ticket`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-csrf-token": token },
            credentials: "include",
            body: JSON.stringify({ fileId, action }),
          });
        let action: "write" | "read" = "write";
        let response = await requestTicket(action);
        if (response.status === 403) {
          action = "read";
          response = await requestTicket(action);
        }
        if (!response.ok) throw new Error("Collaboration access unavailable.");
        const ticket = ticketViewSchema.parse(await response.json()).ticket;
        if (stopped) return;

        const url = new URL(apiUrl);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.pathname = "/";
        socket = new WebSocket(url);
        socket.onopen = () => {
          socket?.send(JSON.stringify({ type: "auth", ticket, projectId, fileId }));
        };
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data)) as Record<string, unknown>;
            if (
              data.type === "auth.ok" &&
              data.fileId === fileId &&
              typeof data.updateBase64 === "string"
            ) {
              Y.applyUpdate(doc, fromBase64(data.updateBase64), "remote");
              connected = true;
              retryCount = 0;
              setCanEdit(action === "write" && data.action === "write");
              setReady(true);
              setMessage(null);
              for (const item of pending) send(item.update);
              setStatus(pending.length ? "saving" : "saved");
            } else if (data.type === "sync.update" && typeof data.updateBase64 === "string") {
              Y.applyUpdate(doc, fromBase64(data.updateBase64), "remote");
            } else if (data.type === "text.durable_ack") {
              const parsed = durableAckSchema.safeParse(data);
              if (!parsed.success || parsed.data.fileId !== fileId) return;
              const serverVector = fromBase64(parsed.data.stateVectorBase64);
              for (let i = pending.length - 1; i >= 0; i--) {
                if (covers(serverVector, pending[i]!.vector)) pending.splice(i, 1);
              }
              setStatus(pending.length ? "saving" : "saved");
            } else if (data.type === "error") {
              setStatus("error");
              setMessage("Collaboration update was not saved. Reconnecting…");
              socket?.close();
            }
          } catch {
            setStatus("error");
            setMessage("Collaboration response could not be read.");
          }
        };
        socket.onclose = (event) => {
          connected = false;
          if (stopped) return;
          setReady(false);
          setCanEdit(false);
          setStatus("offline");
          if (event.code === 4403 || event.code === 4404) {
            setMessage("Collaboration access ended.");
            return;
          }
          retryTimer = setTimeout(() => void connect(), Math.min(500 * 2 ** retryCount++, 5000));
        };
      } catch {
        if (stopped) return;
        setReady(false);
        setStatus("offline");
        setMessage("Collaboration access unavailable. Retrying…");
        retryTimer = setTimeout(() => void connect(), Math.min(500 * 2 ** retryCount++, 5000));
      }
    };
    void connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
      doc.off("update", updateObserver);
      yText.unobserve(textObserver);
    };
  }, [apiUrl, csrfToken, doc, fileId, projectId, yText]);

  const source = yText.toString();
  const ast = useMemo(() => parseVisualAst(source), [source, sourceVersion]);
  const [conflict, setConflict] = useState<string | null>(null);
  const recordPatch = (result: VisualPatchResult) =>
    setConflict(
      result.success ? null : "The source changed. Review the latest fragment and retry.",
    );
  const changeHeading = (nodeId: string, title: string, expectedHash: string) => {
    const node = ast.nodes.find((item) => item.id === nodeId);
    if (!node || node.kind !== "heading") return;
    recordPatch(
      applyHeadingPatch(yText, {
        fileId,
        headingNode: node,
        newTitle: title,
        expectedTitleHash: expectedHash,
      }),
    );
  };
  const changeParagraph = (nodeId: string, value: string, hash: string) => {
    const node = ast.nodes.find((item) => item.id === nodeId);
    if (node?.kind === "paragraph")
      recordPatch(
        applyParagraphPatch(yText, {
          fileId,
          paragraphNode: node,
          newText: value,
          expectedParagraphHash: hash,
        }),
      );
  };
  const changeListItem = (nodeId: string, index: number, value: string, hash: string) => {
    const node = ast.nodes.find((item) => item.id === nodeId);
    if (node?.kind === "list")
      recordPatch(
        applyListItemPatch(yText, {
          fileId,
          listNode: node,
          itemIndex: index,
          newContent: value,
          expectedItemHash: hash,
        }),
      );
  };
  const changeFormula = (nodeId: string, value: string, hash: string) => {
    const node = ast.nodes.find((item) => item.id === nodeId);
    if (node?.kind === "mathDisplay")
      recordPatch(
        applyFormulaPatch(yText, {
          fileId,
          mathNode: node,
          newFormula: value,
          expectedFormulaHash: hash,
        }),
      );
  };
  const changeCell = (nodeId: string, row: number, col: number, value: string, hash: string) => {
    const node = ast.nodes.find((item) => item.id === nodeId);
    if (node?.kind === "table")
      recordPatch(
        applyTableCellPatch(yText, {
          fileId,
          tableNode: node,
          rowIndex: row,
          colIndex: col,
          newContent: value,
          expectedCellHash: hash,
        }),
      );
  };
  const changeFigure = (
    nodeId: string,
    value: string,
    hash: string,
    field: "caption" | "label",
  ) => {
    const node = ast.nodes.find((item) => item.id === nodeId);
    if (node?.kind !== "figure") return;
    recordPatch(
      field === "caption"
        ? applyFigureCaptionPatch(yText, {
            fileId,
            figureNode: node,
            newCaption: value,
            expectedCaptionHash: hash,
          })
        : applyFigureLabelPatch(yText, {
            fileId,
            figureNode: node,
            newLabel: value,
            expectedLabelHash: hash,
          }),
    );
  };

  return (
    <section aria-label="Live document" data-testid="live-document">
      <div className="live-document-status">
        <span>{ready ? (canEdit ? "Editing" : "Read-only") : "Connecting to editor"}</span>
        <span role="status" data-testid="live-save-status">
          {ready || status === "offline" || status === "error" ? status : "connecting"}
        </span>
        <button type="button" onClick={onExit}>
          Close live editor
        </button>
      </div>
      {message && <p role="alert">{message}</p>}
      {conflict && <p role="alert">{conflict}</p>}
      {ready && (
        <>
          <EditorModeSwitch mode={mode} onSelectMode={setMode} hasErrors={ast.hasErrors} />
          {mode === "code" ? (
            <LatexCodeEditor
              projectId={projectId}
              fileId={fileId}
              fileName={fileName}
              yText={yText}
              readOnly={!canEdit}
              saveStatus={status}
              theme="dark"
            />
          ) : (
            <div data-testid="live-visual-document">
              {ast.nodes.map((node) => {
                if (node.kind === "heading" || node.kind === "paragraph" || node.kind === "list") {
                  return (
                    <BasicVisualNodesView
                      key={node.id}
                      nodes={[node]}
                      readOnly={!canEdit}
                      onHeadingChange={changeHeading}
                      onParagraphChange={changeParagraph}
                      onListItemChange={changeListItem}
                    />
                  );
                }
                if (node.kind === "literalFallback")
                  return <VisualLiteralFallback key={node.id} node={node} readOnly />;
                if (
                  node.kind === "mathDisplay" ||
                  node.kind === "figure" ||
                  node.kind === "table"
                ) {
                  return (
                    <AcademicVisualNodesView
                      key={node.id}
                      nodes={[node]}
                      projectId={projectId}
                      fileId={fileId}
                      apiUrl={apiUrl}
                      readOnly={!canEdit}
                      onFormulaChange={changeFormula}
                      onCellChange={changeCell}
                      onCaptionChange={(id, value, hash) =>
                        changeFigure(id, value, hash, "caption")
                      }
                      onLabelChange={(id, value, hash) => changeFigure(id, value, hash, "label")}
                    />
                  );
                }
                return null;
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
