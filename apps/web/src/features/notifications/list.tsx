import { useCallback, useEffect, useRef, useState } from "react";
import {
  notificationPageSchema,
  notificationViewSchema,
  type NotificationView,
} from "@latex-collab/contracts";

export function NotificationList({
  apiUrl,
  csrfToken,
}: {
  apiUrl: string;
  csrfToken?: string | undefined;
}) {
  const base = `${apiUrl}/me/notifications`;
  const [items, setItems] = useState<NotificationView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const olderLoaded = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${base}?limit=20`, { credentials: "include" });
      if (!response.ok) throw new Error("Notifications unavailable. Refresh and try again.");
      const page = notificationPageSchema.parse(await response.json());
      setItems((current) => {
        if (!olderLoaded.current) return page.items;
        const latest = new Set(page.items.map((item) => item.id));
        return [...page.items, ...current.filter((item) => !latest.has(item.id))];
      });
      if (!olderLoaded.current) setCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications unavailable.");
    }
  }, [base]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = setInterval(() => void refresh(), 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(timer);
    };
  }, [refresh]);

  async function loadOlder() {
    if (!cursor || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`${base}?limit=20&cursor=${encodeURIComponent(cursor)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Older notifications could not be loaded.");
      const page = notificationPageSchema.parse(await response.json());
      olderLoaded.current = true;
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Older notifications could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function csrf() {
    try {
      const stored = sessionStorage.getItem("csrf_token");
      if (stored) return stored;
    } catch {
      // Session storage may be unavailable in a restricted browser context.
    }
    if (csrfToken) return csrfToken;
    const response = await fetch(`${apiUrl}/auth/session`, { credentials: "include" });
    const token = response.headers.get("x-csrf-token");
    if (!response.ok || !token) throw new Error("Session expired. Sign in and try again.");
    try {
      sessionStorage.setItem("csrf_token", token);
    } catch {
      // Keep the current mutation usable even if persistence is unavailable.
    }
    return token;
  }

  async function markRead(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`${base}/${id}/read`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": await csrf() },
        body: "{}",
      });
      if (!response.ok) throw new Error("Notification could not be marked read.");
      const changed = notificationViewSchema.parse(await response.json());
      setItems((current) => current.map((item) => (item.id === id ? changed : item)));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notification could not be marked read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Notifications" className="notification-list">
      <h2>Notifications</h2>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void refresh()} disabled={busy}>
        Refresh notifications
      </button>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`/project/${item.projectId}`}>
              {item.type === "mention" ? "Someone mentioned you in " : "New reply in "}
              {item.projectTitle}
            </a>{" "}
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>{" "}
            {item.readAt ? (
              <span>Read</span>
            ) : (
              <button type="button" disabled={busy} onClick={() => void markRead(item.id)}>
                Mark read
              </button>
            )}
          </li>
        ))}
      </ol>
      {cursor && (
        <button type="button" disabled={busy} onClick={() => void loadOlder()}>
          Load older notifications
        </button>
      )}
    </section>
  );
}
