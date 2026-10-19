import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  emailRequestSchema,
  loginRequestSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
  userViewSchema,
  type UserView,
} from "@latex-collab/contracts";
import { parsePublicConfig } from "@latex-collab/config";

const { VITE_API_URL } = parsePublicConfig(import.meta.env);
const anonymousCsrf = "browser-auth-request";

export type AuthMode = "register" | "verify" | "login" | "forgot" | "reset";
type Message = { kind: "error" | "success"; text: string };

function useFragmentSecret(name: string | null) {
  const [secret, setSecret] = useState(() => {
    if (!name || typeof window === "undefined") return "";
    const fragmentValue = new URLSearchParams(window.location.hash.slice(1)).get(name);
    const queryValue = new URLSearchParams(window.location.search).get(name);
    return fragmentValue ?? queryValue ?? "";
  });
  useEffect(() => {
    if (!name || typeof window === "undefined") return;
    const fragmentValue = new URLSearchParams(window.location.hash.slice(1)).get(name);
    const queryValue = new URLSearchParams(window.location.search).get(name);
    const value = fragmentValue ?? queryValue;
    if (value) {
      setSecret(value);
    }
    if (window.location.hash || window.location.search) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, [name]);
  return [secret, setSecret] as const;
}

function errorText(status: number, mode: AuthMode): string {
  if (status === 429) return "Too many attempts. Try again later.";
  if (status === 502 || status === 503) return "Service unavailable. Try again later.";
  if (status === 401 && mode === "login") return "Email or password was not accepted.";
  if (status === 401 && mode === "verify") return "Verification link expired or already used.";
  if (status === 401 && mode === "reset") return "Reset link expired or already used.";
  if (status === 409 && mode === "register") return "An account with this email already exists.";
  if (status === 409 && mode === "verify") return "This email has already been verified.";
  if (status === 403) return "Request denied. Check your invitation or account status.";
  if (status === 400) return "Please check the fields and try again.";
  return "Request failed. Try again.";
}

const titles: Record<AuthMode, string> = {
  register: "Create your account",
  verify: "Verify your email",
  login: "Sign in",
  forgot: "Reset your password",
  reset: "Choose a new password",
};

const descriptions: Record<AuthMode, string> = {
  register: "Create your LaTeX Workspace account to start writing.",
  verify: "Use the verification code from your email. It can be used once.",
  login: "Use your verified LaTeX Workspace account.",
  forgot: "We will show the same confirmation whether or not the address is registered.",
  reset: "Use the reset code from your email. It expires after one hour.",
};

export function AuthForms({ mode }: { mode: AuthMode }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [invitation, setInvitation] = useFragmentSecret(mode === "register" ? "invitation" : null);
  const [token, setToken] = useFragmentSecret(
    mode === "verify" || mode === "reset" ? "token" : null,
  );
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, setPending] = useState(false);
  const [user, setUser] = useState<UserView | null>(null);
  const [sessionCsrf, setSessionCsrf] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(mode === "login");
  const messageRef = useRef<HTMLParagraphElement>(null);
  const sessionLookup = useRef<Promise<{ status: number; user?: UserView; csrf?: string }> | null>(
    null,
  );

  useLayoutEffect(() => {
    if (message) messageRef.current?.focus();
  }, [message]);

  useEffect(() => {
    if (mode !== "login") return;
    let active = true;
    void (async () => {
      try {
        sessionLookup.current ??= (async () => {
          const response = await fetch(`${VITE_API_URL}/auth/session`, {
            credentials: "include",
          });
          if (!response.ok) return { status: response.status };
          const parsed = userViewSchema.safeParse(await response.json());
          const csrf = response.headers.get("x-csrf-token");
          const sessionToken = response.headers.get("x-session-token");
          if (!parsed.success || !csrf) return { status: response.status };
          try {
            sessionStorage.setItem("csrf_token", csrf);
            if (sessionToken) sessionStorage.setItem("session_token", sessionToken);
            sessionStorage.setItem("current_user", JSON.stringify(parsed.data));
            window.dispatchEvent(new Event("auth-state-change"));
          } catch {}
          return { status: response.status, user: parsed.data, csrf };
        })();
        const result = await sessionLookup.current;
        if (!active) return;
        if (result.status === 401) {
          try {
            sessionStorage.removeItem("session_token");
            sessionStorage.removeItem("current_user");
            window.dispatchEvent(new Event("auth-state-change"));
          } catch {}
          return;
        }
        if (result.status !== 200 || !result.user || !result.csrf) {
          setMessage({ kind: "error", text: errorText(result.status, "login") });
          return;
        }
        setUser(result.user);
        setSessionCsrf(result.csrf);
        setMessage({ kind: "success", text: `Signed in as ${result.user.displayName}.` });
      } catch {
        if (active)
          setMessage({
            kind: "error",
            text: "Connection failed. Check your connection and try again.",
          });
      } finally {
        if (active) setCheckingSession(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mode]);

  async function post(path: string, body: object, csrf = anonymousCsrf, invite?: string) {
    return fetch(`${VITE_API_URL}/auth/${path}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrf,
        ...(invite ? { "x-registration-invite": invite } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);
    let path: string;
    let body: object;
    const cleanEmail = email.trim();
    const cleanToken = token.trim();
    const cleanInvite = invitation.trim();
    const cleanDisplayName = displayName.trim();

    if (mode === "register") {
      if (cleanInvite.length > 0 && (cleanInvite.length < 32 || cleanInvite.length > 256)) {
        setMessage({
          kind: "error",
          text: "Enter a valid invitation code (between 32 and 256 characters) or leave it blank.",
        });
        return;
      }
      const parsed = registerRequestSchema.safeParse({
        email: cleanEmail,
        password,
        displayName: cleanDisplayName,
      });
      if (!parsed.success) {
        setMessage({
          kind: "error",
          text: "Please provide a valid display name, email address, and password (at least 8 characters).",
        });
        return;
      }
      path = "register";
      body = parsed.data;
    } else if (mode === "verify") {
      if (cleanToken.length < 32 || cleanToken.length > 256) {
        setMessage({ kind: "error", text: "Enter the verification code from your email." });
        return;
      }
      path = "verify-email";
      body = { token: cleanToken };
    } else if (mode === "login") {
      const parsed = loginRequestSchema.safeParse({ email: cleanEmail, password });
      if (!parsed.success) {
        setMessage({ kind: "error", text: "Enter a valid email and password." });
        return;
      }
      path = "login";
      body = parsed.data;
    } else if (mode === "forgot") {
      const parsed = emailRequestSchema.safeParse({ email: cleanEmail });
      if (!parsed.success) {
        setMessage({ kind: "error", text: "Enter a valid email address." });
        return;
      }
      path = "password/forgot";
      body = parsed.data;
    } else {
      if (cleanToken.length < 32 || cleanToken.length > 256) {
        setMessage({ kind: "error", text: "Enter the reset code from your email." });
        return;
      }
      if (password !== confirmation) {
        setMessage({ kind: "error", text: "Passwords do not match." });
        return;
      }
      const parsed = passwordResetRequestSchema.safeParse({ token: cleanToken, password });
      if (!parsed.success) {
        setMessage({ kind: "error", text: "Password must be at least 8 characters long." });
        return;
      }
      path = "password/reset";
      body = parsed.data;
    }

    setPending(true);
    try {
      const trimmedInvite = invitation.trim();
      const response = await post(
        path,
        body,
        anonymousCsrf,
        mode === "register" && trimmedInvite ? trimmedInvite : undefined,
      );
      if (!response.ok) {
        setMessage({ kind: "error", text: errorText(response.status, mode) });
        return;
      }
      if (mode === "login") {
        const parsed = userViewSchema.safeParse(await response.json());
        const csrf = response.headers.get("x-csrf-token");
        const sessionToken = response.headers.get("x-session-token");
        if (!parsed.success || !csrf) throw new Error("Invalid session response");
        setUser(parsed.data);
        setSessionCsrf(csrf);
        try {
          sessionStorage.setItem("csrf_token", csrf);
          if (sessionToken) sessionStorage.setItem("session_token", sessionToken);
          sessionStorage.setItem("current_user", JSON.stringify(parsed.data));
          window.dispatchEvent(new Event("auth-state-change"));
        } catch {}
        setPassword("");
        setMessage({ kind: "success", text: `Signed in as ${parsed.data.displayName}.` });
      } else if (mode === "register") {
        setPassword("");
        setInvitation("");
        setMessage({ kind: "success", text: "Check your email for a verification link." });
      } else if (mode === "verify") {
        setToken("");
        setMessage({ kind: "success", text: "Email verified. You can now sign in." });
      } else if (mode === "forgot") {
        setMessage({
          kind: "success",
          text: "If that address can receive recovery mail, check your email.",
        });
      } else {
        setPassword("");
        setConfirmation("");
        setToken("");
        setMessage({ kind: "success", text: "Password reset. Sign in with your new password." });
      }
    } catch {
      setMessage({
        kind: "error",
        text: "Connection failed. Check your connection and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    if (!sessionCsrf || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await post("logout", {}, sessionCsrf);
      if (!response.ok) {
        setMessage({ kind: "error", text: errorText(response.status, "login") });
        return;
      }
      setUser(null);
      setSessionCsrf(null);
      try {
        sessionStorage.removeItem("session_token");
        sessionStorage.removeItem("csrf_token");
        sessionStorage.removeItem("current_user");
        window.dispatchEvent(new Event("auth-state-change"));
      } catch {}
      setMessage({ kind: "success", text: "Signed out." });
    } catch {
      setMessage({
        kind: "error",
        text: "Connection failed. Check your connection and try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-heading">
      <h1 id="auth-heading">{titles[mode]}</h1>
      <p>{descriptions[mode]}</p>
      {message && (
        <p
          className={message.kind === "error" ? "form-message error" : "form-message"}
          role={message.kind === "error" ? "alert" : "status"}
          tabIndex={-1}
          ref={messageRef}
        >
          {message.text}
        </p>
      )}
      {mode === "login" && user ? (
        <div>
          <p>Your account is ready. Project features are coming in a later stage.</p>
          <button type="button" onClick={() => void signOut()} disabled={pending}>
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} noValidate>
          {(mode === "register" || mode === "login" || mode === "forgot") && (
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}
          {mode === "register" && (
            <>
              <label>
                Display name
                <input
                  name="displayName"
                  autoComplete="name"
                  required
                  maxLength={200}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <label>
                Invitation code
                <input
                  name="invitation"
                  type="password"
                  autoComplete="off"
                  placeholder="Optional invitation code"
                  value={invitation}
                  onChange={(event) => setInvitation(event.target.value)}
                />
              </label>
            </>
          )}
          {(mode === "verify" || mode === "reset") && (
            <label>
              {mode === "verify" ? "Verification code" : "Reset code"}
              <input
                name="token"
                type="text"
                autoComplete="off"
                required
                placeholder={mode === "verify" ? "Enter verification code" : "Enter reset code"}
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
          )}
          {(mode === "register" || mode === "login" || mode === "reset") && (
            <label>
              {mode === "reset" ? "New password" : "Password"}
              <input
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}
          {mode === "login" && (
            <div className="auth-helper-row">
              <a href="/forgot-password">Forgot password?</a>
            </div>
          )}
          {mode === "reset" && (
            <label>
              Confirm password
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          )}
          <button type="submit" disabled={pending || checkingSession}>
            {pending || checkingSession
              ? "Please wait…"
              : mode === "register"
                ? "Create account"
                : mode === "verify"
                  ? "Verify email"
                  : mode === "login"
                    ? "Sign in"
                    : mode === "forgot"
                      ? "Send reset link"
                      : "Reset password"}
          </button>
        </form>
      )}
      <nav className="auth-links" aria-label="Account options">
        {mode !== "login" && <a href="/login">Sign in</a>}
        {mode !== "register" && <a href="/register">Create account</a>}
        {mode !== "forgot" && mode !== "login" && <a href="/forgot-password">Forgot password?</a>}
        {mode === "forgot" && <a href="/reset-password">Have a reset code?</a>}
        {mode === "reset" && <a href="/forgot-password">Request new code</a>}
        {mode !== "verify" && <a href="/verify-email">Verify email</a>}
      </nav>
    </section>
  );
}
