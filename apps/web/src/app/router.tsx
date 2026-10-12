import { useState, lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import type { AuthMode } from "../features/auth/auth-forms";
const HealthPanel = lazy(() =>
  import("../features/health/health-panel").then((module) => ({ default: module.HealthPanel })),
);
const AuthForms = lazy(() =>
  import("../features/auth/auth-forms").then((module) => ({ default: module.AuthForms })),
);
function AuthRoute({ mode }: { mode: AuthMode }) {
  return (
    <Suspense fallback={<p role="status">Loading account form…</p>}>
      <AuthForms mode={mode} />
    </Suspense>
  );
}
function Shell() {
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  return (
    <div className={dark ? "shell dark" : "shell"}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header>
        <Link to="/">LaTeX Workspace</Link>
        <nav aria-label="Main">
          <Link to="/projects">Projects</Link>
          <Link to="/settings">Settings</Link>
          <Link to="/login">Sign in</Link>
        </nav>
        <button
          aria-pressed={dark}
          onClick={() => {
            setDark(!dark);
            localStorage.setItem("theme", dark ? "light" : "dark");
          }}
        >
          Dark theme
        </button>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <p className="eyebrow">A workspace for academic writing</p>
                <h1>Build your next document.</h1>
                <p>Projects, editing and compilation will arrive in the next stages.</p>
                <Suspense fallback={<p role="status">Checking service…</p>}>
                  <HealthPanel />
                </Suspense>
                <p className="notice">Project features are not implemented yet.</p>
              </>
            }
          />
          <Route
            path="/projects"
            element={
              <>
                <h1>Projects</h1>
                <p>
                  Not implemented yet. Project creation and editing are scheduled for later stages.
                </p>
              </>
            }
          />
          <Route
            path="/settings"
            element={
              <>
                <h1>Settings</h1>
                <p>
                  Account preferences are not implemented yet. Theme is available in the header.
                </p>
              </>
            }
          />
          <Route path="/register" element={<AuthRoute mode="register" />} />
          <Route path="/verify-email" element={<AuthRoute mode="verify" />} />
          <Route path="/login" element={<AuthRoute mode="login" />} />
          <Route path="/forgot-password" element={<AuthRoute mode="forgot" />} />
          <Route path="/reset-password" element={<AuthRoute mode="reset" />} />
          <Route
            path="*"
            element={
              <>
                <h1>Page not found</h1>
                <Link to="/">Return home</Link>
              </>
            }
          />
        </Routes>
      </main>
      <footer>Local development · trusted accounts only</footer>
    </div>
  );
}
export function Router() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
