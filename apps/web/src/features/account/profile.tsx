import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { parsePublicConfig } from "@latex-collab/config";
import {
  accountPreferencesViewSchema,
  accountProfileViewSchema,
  accountSessionPageSchema,
  preferencesPatchSchema,
  profilePatchSchema,
  type AccountPreferencesView,
  type AccountProfileView,
  type AccountSessionView,
} from "@latex-collab/contracts";
import { AvatarSettings } from "./avatar.js";

const { VITE_API_URL } = parsePublicConfig(import.meta.env);
type ProfileView = AccountProfileView;
type PreferencesView = AccountPreferencesView;
type SessionView = AccountSessionView;
type Notice = { kind: "error" | "success"; text: string };

function errorText(status: number): string {
  if (status === 400) return "Check the fields and try again.";
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 403) return "Request denied. Check your session and try again.";
  if (status === 404) return "That session is no longer available.";
  if (status === 429) return "Too many attempts. Try again later.";
  if (status === 503) return "Service unavailable. Try again later.";
  return "Request failed. Try again.";
}

export function Profile() {
  const [loading, setLoading] = useState(true);
  const [csrf, setCsrf] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [preferences, setPreferences] = useState<PreferencesView | null>(null);
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [locale, setLocale] = useState("");
  const [timezone, setTimezone] = useState("");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState(false);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const sessionLookup = useRef<Promise<Response> | null>(null);

  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        sessionLookup.current ??= fetch(`${VITE_API_URL}/auth/session`, { credentials: "include" });
        const session = await sessionLookup.current;
        if (!active) return;
        if (!session.ok) {
          if (active) setNotice({ kind: "error", text: errorText(session.status) });
          return;
        }
        const secret = session.headers.get("x-csrf-token");
        if (!secret) throw new Error("Missing session CSRF");
        const profileResponse = await fetch(`${VITE_API_URL}/me`, { credentials: "include" });
        const preferencesResponse = await fetch(`${VITE_API_URL}/me/preferences`, {
          credentials: "include",
        });
        const sessionsResponse = await fetch(`${VITE_API_URL}/me/sessions`, {
          credentials: "include",
        });
        const failed = [profileResponse, preferencesResponse, sessionsResponse].find(
          (response) => !response.ok,
        );
        if (failed) {
          if (active) setNotice({ kind: "error", text: errorText(failed.status) });
          return;
        }
        const nextProfile = accountProfileViewSchema.parse(await profileResponse.json());
        const nextPreferences = accountPreferencesViewSchema.parse(
          await preferencesResponse.json(),
        );
        const nextSessions = accountSessionPageSchema.parse(await sessionsResponse.json());
        if (!active) return;
        setCsrf(secret);
        setProfile(nextProfile);
        setPreferences(nextPreferences);
        setSessions(nextSessions.items);
        setNextCursor(nextSessions.nextCursor);
        setDisplayName(nextProfile.displayName);
        setLocale(nextPreferences.locale);
        setTimezone(nextPreferences.timezone);
        setTheme(nextPreferences.theme);
        localStorage.setItem("theme", nextPreferences.theme);
        window.dispatchEvent(new Event("workspace-theme-change"));
      } catch {
        if (active)
          setNotice({
            kind: "error",
            text: "Connection failed. Check your connection and try again.",
          });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrf || pending) return;
    const parsed = profilePatchSchema.safeParse({ displayName });
    if (!parsed.success) {
      setNotice({ kind: "error", text: "Enter a display name." });
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(`${VITE_API_URL}/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setNotice({ kind: "error", text: errorText(response.status) });
        return;
      }
      setProfile(accountProfileViewSchema.parse(await response.json()));
      setNotice({ kind: "success", text: "Profile saved." });
    } catch {
      setNotice({ kind: "error", text: "Connection failed. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrf || pending) return;
    const parsed = preferencesPatchSchema.safeParse({ locale, timezone, theme });
    if (!parsed.success) {
      setNotice({ kind: "error", text: "Check the preference fields." });
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(`${VITE_API_URL}/me/preferences`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setNotice({ kind: "error", text: errorText(response.status) });
        return;
      }
      const saved = accountPreferencesViewSchema.parse(await response.json());
      setPreferences(saved);
      setTheme(saved.theme);
      localStorage.setItem("theme", saved.theme);
      window.dispatchEvent(new Event("workspace-theme-change"));
      setNotice({ kind: "success", text: "Preferences saved." });
    } catch {
      setNotice({ kind: "error", text: "Connection failed. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  async function revoke(session: SessionView) {
    if (!csrf || pending) return;
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(`${VITE_API_URL}/me/sessions/${session.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "x-csrf-token": csrf },
      });
      if (!response.ok) {
        setNotice({ kind: "error", text: errorText(response.status) });
        return;
      }
      setSessions((items) => items.filter((item) => item.id !== session.id));
      if (session.current) {
        setCsrf(null);
        setProfile(null);
        setPreferences(null);
        setNotice({ kind: "success", text: "Current session revoked. Sign in again." });
      } else setNotice({ kind: "success", text: "Session revoked." });
    } catch {
      setNotice({ kind: "error", text: "Connection failed. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  async function loadMoreSessions() {
    if (!nextCursor || pending) return;
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(
        `${VITE_API_URL}/me/sessions?cursor=${encodeURIComponent(nextCursor)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        setNotice({ kind: "error", text: errorText(response.status) });
        return;
      }
      const page = accountSessionPageSchema.parse(await response.json());
      setSessions((items) => [...items, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      setNotice({ kind: "error", text: "Connection failed. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="account-card" aria-labelledby="account-heading">
      <h1 id="account-heading">Account settings</h1>
      {loading && <p role="status">Loading account…</p>}
      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={notice.kind === "error" ? "form-message error" : "form-message"}
          tabIndex={-1}
          ref={noticeRef}
        >
          {notice.text}
        </p>
      )}
      {!loading && !profile && <Link to="/login">Sign in</Link>}
      {profile && preferences && (
        <>
          {csrf && <AvatarSettings profile={profile} csrf={csrf} onProfileChange={setProfile} />}
          <form onSubmit={(event) => void saveProfile(event)}>
            <h2>Profile</h2>
            <p>Email: {profile.email}</p>
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={100}
                required
                autoComplete="name"
              />
            </label>
            <button disabled={pending} type="submit">
              Save profile
            </button>
          </form>
          <form onSubmit={(event) => void savePreferences(event)}>
            <h2>Preferences</h2>
            <label>
              Locale
              <input
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
                maxLength={35}
                required
              />
            </label>
            <label>
              Timezone
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                maxLength={64}
                required
              />
            </label>
            <label>
              Theme
              <select
                value={theme}
                onChange={(event) => setTheme(event.target.value as "light" | "dark" | "system")}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <button disabled={pending} type="submit">
              Save preferences
            </button>
          </form>
          <section aria-labelledby="sessions-heading">
            <h2 id="sessions-heading">Sessions</h2>
            {sessions.length === 0 ? (
              <p>No active sessions.</p>
            ) : (
              <ul>
                {sessions.map((session) => (
                  <li key={session.id}>
                    {session.deviceLabel} · {session.current ? "This device" : "Other device"} ·
                    Last seen {new Date(session.lastSeenAt).toLocaleString()}{" "}
                    <button type="button" disabled={pending} onClick={() => void revoke(session)}>
                      Revoke {session.current ? "this session" : "session"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {nextCursor && (
              <button type="button" disabled={pending} onClick={() => void loadMoreSessions()}>
                Load more sessions
              </button>
            )}
          </section>
        </>
      )}
    </section>
  );
}
