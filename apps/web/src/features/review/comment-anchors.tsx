import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type SyntheticEvent,
} from "react";
import * as Y from "yjs";
import {
  commentPageSchema,
  sharingMemberPageSchema,
  type CommentView,
  type SharingMemberView,
} from "@latex-collab/contracts";

interface CommentAnchorsProps {
  projectId: string;
  fileId: string;
  apiUrl: string;
  csrfToken?: string | undefined;
}

export function CommentAnchors({ projectId, fileId, apiUrl, csrfToken }: CommentAnchorsProps) {
  const base = `${apiUrl}/projects/${projectId}`;
  const documentRef = useRef<Y.Doc | null>(null);
  const [source, setSource] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [body, setBody] = useState("");
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});
  const [mention, setMention] = useState("");
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
        throw new Error("Comments are unavailable with your current role. Refresh and try again.");
      const state = (await textResponse.json()) as { updateBase64: string };
      const doc = new Y.Doc();
      try {
        // Touch the root first so resolved ranges compare against the live wrapper.
        const text = doc.getText("content");
        const binary = atob(state.updateBase64);
        Y.applyUpdate(
          doc,
          Uint8Array.from(binary, (character) => character.charCodeAt(0)),
        );
        documentRef.current?.destroy();
        documentRef.current = doc;
        setSource(text.toString());
      } catch {
        doc.destroy();
        throw new Error("Comments are unavailable with your current role. Refresh and try again.");
      }
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
      documentRef.current?.destroy();
      documentRef.current = null;
    };
  }, [load]);

  async function csrf() {
    try {
      const stored = sessionStorage.getItem("csrf_token");
      if (stored) return stored;
    } catch {}
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
    const doc = documentRef.current;
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
      mentions: mention ? [mention] : [],
    });
    if (created) {
      setBody("");
      setMention("");
    }
  }

  async function addReply(event: FormEvent, commentId: string) {
    event.preventDefault();
    const reply = replyBodies[commentId]?.trim();
    if (!reply) return;
    if (await mutate(`comments/${commentId}/replies`, "POST", { body: reply }))
      setReplyBodies((previous) => ({ ...previous, [commentId]: "" }));
  }

  function mentionNames(ids: string[]) {
    return ids.map((id) => members.find((member) => member.userId === id)?.displayName ?? id);
  }

  function updateSelection(event: SyntheticEvent<HTMLTextAreaElement>) {
    setSelection({
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    });
  }

  function anchorExcerpt(comment: CommentView) {
    if (comment.detached || comment.start === null || comment.end === null)
      return <p>Anchor unavailable: selected range changed.</p>;
    if (source.slice(comment.start, comment.end) !== comment.selectedText)
      return <p>Anchor unavailable in loaded source. Refresh comments.</p>;
    return (
      <p>
        Anchored range: {source.slice(Math.max(0, comment.start - 20), comment.start)}
        <mark aria-label={`Comment anchor: ${comment.selectedText}`}>
          {source.slice(comment.start, comment.end)}
        </mark>
        {source.slice(comment.end, comment.end + 20)}
      </p>
    );
  }

  return (
    <section aria-label="Comment anchors" className="comment-anchors">
      <h2>Comments</h2>
      <p>Select source text, then add a comment. Anchored ranges stay with their text.</p>
      <textarea
        aria-label="Source text for comment selection"
        readOnly
        value={source}
        onSelect={updateSelection}
        onKeyUp={updateSelection}
        onMouseUp={updateSelection}
      />
      <form
        onSubmit={(event) => {
          void addComment(event);
        }}
      >
        <label htmlFor="comment-anchor-body">Comment body</label>
        <textarea
          id="comment-anchor-body"
          value={body}
          maxLength={10000}
          onChange={(event) => setBody(event.target.value)}
        />
        <label htmlFor="comment-anchor-mention">Mention a member</label>
        <select
          id="comment-anchor-mention"
          value={mention}
          onChange={(event) => setMention(event.target.value)}
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
            {anchorExcerpt(comment)}
            <p>{comment.body}</p>
            <p>Status: {comment.status}</p>
            {comment.mentions.length > 0 && (
              <p>Mentions: {mentionNames(comment.mentions).join(", ")}</p>
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
              {comment.status === "open" ? "Resolve comment" : "Reopen comment"}
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
              <label htmlFor={`reply-${comment.id}`}>Reply to this comment</label>
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
