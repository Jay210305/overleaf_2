import { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import type { AuthMode } from "../features/auth/auth-forms";
const HealthPanel = lazy(() =>
  import("../features/health/health-panel").then((module) => ({ default: module.HealthPanel })),
);
const AuthForms = lazy(() =>
  import("../features/auth/auth-forms").then((module) => ({ default: module.AuthForms })),
);
const Profile = lazy(() =>
  import("../features/account/profile").then((module) => ({ default: module.Profile })),
);
const ProjectsDashboard = lazy(() =>
  import("../features/projects/dashboard").then((module) => ({
    default: module.ProjectsDashboard,
  })),
);
const ProjectWorkspace = lazy(() =>
  import("../features/projects/workspace").then((module) => ({
    default: module.ProjectWorkspace,
  })),
);
const AccessRedemption = lazy(() =>
  import("../features/sharing/share-dialog").then((module) => ({
    default: module.AccessRedemption,
  })),
);
function AuthRoute({ mode }: { mode: AuthMode }) {
  return (
    <Suspense fallback={<p role="status">Loading account form…</p>}>
      <AuthForms mode={mode} />
    </Suspense>
  );
}
function Shell() {
  const resolvedDark = () => {
    const preference = localStorage.getItem("theme");
    return (
      preference === "dark" ||
      (preference === "system" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches)
    );
  };
  const [dark, setDark] = useState(resolvedDark);
  useEffect(() => {
    const update = () => setDark(resolvedDark());
    window.addEventListener("workspace-theme-change", update);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", update);
    return () => {
      window.removeEventListener("workspace-theme-change", update);
      media?.removeEventListener("change", update);
    };
  }, []);
  return (
    <div className={dark ? "shell dark" : "shell"}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header>
        <Link to="/">LaTeX Workspace</Link>
        <nav aria-label="Main">
          <Link to="/projects">Projects</Link>
          <Link to="/settings/profile">Settings</Link>
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
                <p>
                  <Link to="/dashboard">Go to Projects Dashboard</Link>
                </p>
              </>
            }
          />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<p role="status">Loading dashboard…</p>}>
                <ProjectsDashboard />
              </Suspense>
            }
          />
          <Route
            path="/project/:id"
            element={
              <Suspense fallback={<p role="status">Loading workspace…</p>}>
                <ProjectWorkspace />
              </Suspense>
            }
          />
          <Route
            path="/invitations"
            element={
              <Suspense fallback={<p role="status">Loading invitation…</p>}>
                <AccessRedemption kind="invitation" />
              </Suspense>
            }
          />
          <Route
            path="/share-links"
            element={
              <Suspense fallback={<p role="status">Loading share link…</p>}>
                <AccessRedemption kind="share-link" />
              </Suspense>
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<p role="status">Loading account…</p>}>
                <Profile />
              </Suspense>
            }
          />
          <Route
            path="/settings/profile"
            element={
              <Suspense fallback={<p role="status">Loading account…</p>}>
                <Profile />
              </Suspense>
            }
          />
          <Route
            path="/settings/security"
            element={
              <Suspense fallback={<p role="status">Loading account…</p>}>
                <Profile />
              </Suspense>
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
