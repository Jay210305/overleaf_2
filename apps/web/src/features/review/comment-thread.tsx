import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import * as Y from "yjs";
import {
  commentPageSchema,
  sharingMemberPageSchema,
  type CommentView,
  type SharingMemberView,
} from "@latex-collab/contracts";

interface CommentThreadProps {
  projectId: string;
  fileId: string;
  apiUrl: string;
  csrfToken?: string;
}

export function CommentThread({ projectId, fileId, apiUrl, csrfToken }: CommentThreadProps) {
  const base = `${apiUrl}/projects/${projectId}`;
  const document = useRef<Y.Doc | null>(null);
  const [source, setSource] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [body, setBody] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [mentions, setMentions] = useState<string[]>([]);
  const [members, setMembers] = useState<SharingMemberView[]>([]);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [textResponse, commentsResponse, membersResponse] = await Promise.all([
        fetch(`${base}/files/${fileId}/text`, { credentials: "include" }),
        fetch(`${base}/comments?limit=100`, { credentials: "include" }),
        fetch(`${base}/members?limit=100`, { credentials: "include" }),
      ]);
      if (!textResponse.ok || !commentsResponse.ok || !membersResponse.ok)
        throw new Error("Comments are unavailable. Refresh and try again.");
      const state = (await textResponse.json()) as { updateBase64: string };
      const doc = new Y.Doc();
      const binary = atob(state.updateBase64);
      Y.applyUpdate(
        doc,
        Uint8Array.from(binary, (character) => character.charCodeAt(0)),
      );
      document.current?.destroy();
      document.current = doc;
      setSource(doc.getText("content").toString());
      setSelection(null);
      setComments(
        commentPageSchema
          .parse(await commentsResponse.json())
          .items.filter((item) => item.fileId === fileId),
      );
      setMembers(sharingMemberPageSchema.parse(await membersResponse.json()).items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Comments are unavailable.");
    }
  }, [base, fileId]);

  useEffect(() => {
    void load();
    return () => {
      document.current?.destroy();
      document.current = null;
    };
  }, [load]);

  async function csrf() {
    if (csrfToken) return csrfToken;
    const response = await fetch(`${apiUrl}/auth/session`, { credentials: "include" });
    if (!response.ok) throw new Error("Session expired. Sign in and try again.");
    const token = response.headers.get("x-csrf-token");
    if (!token) throw new Error("Session token unavailable.");
    return token;
  }

  async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", payload?: object) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${base}/${path}`, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": await csrf() },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "You cannot change comments with your current role."
            : response.status === 409
              ? "The selected text changed. Select it again and retry."
              : "Comment request failed. Try again.",
        );
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Comment request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    const doc = document.current;
    if (!doc || !selection || selection.start === selection.end || !body.trim()) return;
    const text = doc.getText("content");
    const selectedText = text.toString().slice(selection.start, selection.end);
    const created = await mutate("comments", "POST", {
      fileId,
      anchorStart: Y.relativePositionToJSON(
        Y.createRelativePositionFromTypeIndex(text, selection.start),
      ),
      anchorEnd: Y.relativePositionToJSON(
        Y.createRelativePositionFromTypeIndex(text, selection.end),
      ),
      selectedText,
      body,
      mentions,
    });
    if (created) {
      setBody("");
      setMentions([]);
    }
  }

  async function addReply(event: FormEvent, commentId: string) {
    event.preventDefault();
    const reply = replyBodies[commentId]?.trim();
    if (!reply) return;
    if (await mutate(`comments/${commentId}/replies`, "POST", { body: reply }))
      setReplyBodies((previous) => ({ ...previous, [commentId]: "" }));
  }

  return (
    <section aria-label="File comments" className="comment-thread">
      <h2>Comments</h2>
      <p>Select source text, then add a comment.</p>
      <textarea
        aria-label="Source text for comment selection"
        readOnly
        value={source}
        onSelect={(event) =>
          setSelection({
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          })
        }
      />
      <form
        onSubmit={(event) => {
          void addComment(event);
        }}
      >
        <label htmlFor="comment-body">Comment body</label>
        <textarea
          id="comment-body"
          value={body}
          maxLength={10000}
          onChange={(event) => setBody(event.target.value)}
        />
        <label htmlFor="comment-mention">Mention a member</label>
        <select
          id="comment-mention"
          value={mentions[0] ?? ""}
          onChange={(event) => setMentions(event.target.value ? [event.target.value] : [])}
        >
          <option value="">No mention</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !selection || selection.start === selection.end || !body.trim()}
        >
          Add comment
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void load()} disabled={busy}>
        Refresh comments
      </button>
      <ol>
        {comments.map((comment) => (
          <li key={comment.id}>
            <p>{comment.body}</p>
            <p>
              {comment.detached
                ? "Anchor unavailable: selected range changed."
                : `Selected: ${comment.selectedText}`}
            </p>
            <p>Status: {comment.status}</p>
            {comment.mentions.length > 0 && (
              <p>
                Mentions:{" "}
                {comment.mentions
                  .map((id) => members.find((member) => member.userId === id)?.displayName ?? id)
                  .join(", ")}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void mutate(`comments/${comment.id}`, "PATCH", {
                  status: comment.status === "open" ? "resolved" : "open",
                })
              }
            >
              {comment.status === "open" ? "Resolve" : "Reopen"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void mutate(`comments/${comment.id}`, "DELETE")}
            >
              Delete comment
            </button>
            <ol>
              {comment.replies.map((reply) => (
                <li key={reply.id}>{reply.body}</li>
              ))}
            </ol>
            <form
              onSubmit={(event) => {
                void addReply(event, comment.id);
              }}
            >
              <label htmlFor={`reply-${comment.id}`}>Reply</label>
              <input
                id={`reply-${comment.id}`}
                value={replyBodies[comment.id] ?? ""}
                onChange={(event) =>
                  setReplyBodies((previous) => ({ ...previous, [comment.id]: event.target.value }))
                }
              />
              <button type="submit" disabled={busy || !replyBodies[comment.id]?.trim()}>
                Post reply
              </button>
            </form>
          </li>
        ))}
      </ol>
    </section>
  );
}
