import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  chatMessagePageSchema,
  eventEnvelopeSchema,
  type ChatMessageView,
} from "@latex-collab/contracts";

interface ProjectChatProps {
  projectId: string;
  apiUrl: string;
  csrfToken?: string | undefined;
}

export function ProjectChat({ projectId, apiUrl, csrfToken }: ProjectChatProps) {
  const base = `${apiUrl}/projects/${projectId}/chat`;
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const olderLoaded = useRef(false);

  const loadLatest = useCallback(async () => {
    try {
      const response = await fetch(`${base}/messages?limit=20`, { credentials: "include" });
      if (!response.ok)
        throw new Error("Chat is unavailable with your current role. Refresh and try again.");
      const page = chatMessagePageSchema.parse(await response.json());
      setMessages((current) => {
        if (!olderLoaded.current) return page.items;
        const latestIds = new Set(page.items.map((item) => item.id));
        return [...page.items, ...current.filter((item) => !latestIds.has(item.id))];
      });
      if (!olderLoaded.current) setCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chat is unavailable.");
    }
  }, [base]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let handshake: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<string>();
    void loadLatest();
    const connect = () => {
      if (!active) return;
      try {
        socket = new WebSocket(`${base.replace(/^http/, "ws")}/events`);
      } catch {
        // A relative API base (tests, previews) cannot open a socket; stay
        // disconnected instead of crashing the surrounding workspace.
        setConnected(false);
        if (active) retry = setTimeout(connect, 3000);
        return;
      }
      const connection = socket;
      // A stalled handshake does not fire `close`, so it would otherwise block
      // reconnects indefinitely.
      handshake = setTimeout(() => connection.close(), 5000);
      socket.onopen = () => {
        clearTimeout(handshake);
        setConnected(true);
        void loadLatest();
      };
      socket.onmessage = (event) => {
        try {
          const parsed = eventEnvelopeSchema.safeParse(JSON.parse(String(event.data)));
          if (!parsed.success) return;
          const hint = parsed.data;
          if (
            hint.type !== "chat.created" ||
            hint.projectId !== projectId ||
            seen.has(hint.eventId)
          )
            return;
          seen.add(hint.eventId);
          if (seen.size > 100) seen.delete(seen.values().next().value!);
          void loadLatest();
        } catch {
          // A malformed hint cannot change durable history.
        }
      };
      socket.onclose = () => {
        clearTimeout(handshake);
        setConnected(false);
        if (active) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    const onFocus = () => void loadLatest();
    window.addEventListener("focus", onFocus);
    const reconcile = setInterval(() => void loadLatest(), 30_000);
    return () => {
      active = false;
      clearTimeout(retry);
      clearTimeout(handshake);
      clearInterval(reconcile);
      window.removeEventListener("focus", onFocus);
      socket?.close();
    };
  }, [base, loadLatest, projectId]);

  async function loadOlder() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `${base}/messages?limit=20&cursor=${encodeURIComponent(cursor)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Older messages could not be loaded. Try again.");
      const page = chatMessagePageSchema.parse(await response.json());
      olderLoaded.current = true;
      setMessages((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Older messages could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function csrf() {
    if (csrfToken) return csrfToken;
    const response = await fetch(`${apiUrl}/auth/session`, { credentials: "include" });
    const token = response.headers.get("x-csrf-token");
    if (!response.ok || !token) throw new Error("Session expired. Sign in and try again.");
    return token;
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`${base}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": await csrf() },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? "You cannot send chat messages with your current role."
            : "Chat message could not be sent. Try again.",
        );
      setBody("");
      await loadLatest();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chat message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Project chat" className="project-chat">
      <h2>Project chat</h2>
      <p role="status">{connected ? "Live updates connected" : "Checking for new messages"}</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void loadLatest()} disabled={busy}>
        Refresh chat
      </button>
      <ol>
        {[...messages].reverse().map((message) => (
          <li key={message.id}>
            <strong>{message.authorName}</strong>: <span>{message.body}</span>{" "}
            <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
          </li>
        ))}
      </ol>
      {cursor && (
        <button type="button" onClick={() => void loadOlder()} disabled={busy}>
          Load older messages
        </button>
      )}
      <form onSubmit={(event) => void send(event)}>
        <label htmlFor="project-chat-body">Chat message</label>
        <textarea
          id="project-chat-body"
          value={body}
          maxLength={10000}
          onChange={(event) => setBody(event.target.value)}
        />
        <button type="submit" disabled={busy || !body.trim()}>
          Send message
        </button>
      </form>
    </section>
  );
}
