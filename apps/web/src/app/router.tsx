import { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { parsePublicConfig } from "@latex-collab/config";
import type { AuthMode } from "../features/auth/auth-forms.js";

const config = parsePublicConfig(import.meta.env);

const HomeHub = lazy(() =>
  import("../features/home/home-hub.js").then((module) => ({ default: module.HomeHub })),
);
const AuthForms = lazy(() =>
  import("../features/auth/auth-forms.js").then((module) => ({ default: module.AuthForms })),
);
const Profile = lazy(() =>
  import("../features/account/profile.js").then((module) => ({ default: module.Profile })),
);
const ProjectsDashboard = lazy(() =>
  import("../features/projects/dashboard.js").then((module) => ({
    default: module.ProjectsDashboard,
  })),
);
const ProjectWorkspace = lazy(() =>
  import("../features/projects/workspace.js").then((module) => ({
    default: module.ProjectWorkspace,
  })),
);
const AccessRedemption = lazy(() =>
  import("../features/sharing/share-dialog.js").then((module) => ({
    default: module.AccessRedemption,
  })),
);
const TemplateCatalogue = lazy(() =>
  import("../features/templates/catalogue.js").then((module) => ({
    default: module.TemplateCatalogue,
  })),
);
const TemplatePreview = lazy(() =>
  import("../features/templates/template-preview.js").then((module) => ({
    default: module.TemplatePreview,
  })),
);
const AdminDashboard = lazy(() =>
  import("../features/admin/dashboard.js").then((module) => ({
    default: module.AdminDashboard,
  })),
);

function AuthRoute({ mode }: { mode: AuthMode }) {
  return (
    <Suspense fallback={<p role="status">Loading account form…</p>}>
      <AuthForms mode={mode} />
    </Suspense>
  );
}

function TemplatesCatalogueRoute() {
  const navigate = useNavigate();
  return (
    <div className="templates-route-container" role="region" aria-label="Templates Catalogue">
      <header className="section-header">
        <p className="eyebrow">Document Starters</p>
        <h1>Templates Catalogue</h1>
        <p className="section-lead">
          Browse tested templates for articles, theses, reports, and presentations. Select or instantiate any template directly into your workspace.
        </p>
      </header>
      <Suspense fallback={<p role="status">Loading templates catalogue…</p>}>
        <TemplateCatalogue
          apiUrl={config.VITE_API_URL}
          onInstantiated={(project) => navigate(`/project/${project.id}`)}
        />
      </Suspense>
    </div>
  );
}

function TemplatePreviewRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <div className="template-preview-route-container" role="region" aria-label="Template Preview">
      <header className="section-header">
        <nav aria-label="Template breadcrumbs" className="breadcrumbs-nav">
          <Link to="/templates">Templates</Link>
          <span aria-hidden="true"> / </span>
          <span>Preview</span>
        </nav>
      </header>
      <Suspense fallback={<p role="status">Loading template preview…</p>}>
        <TemplatePreview
          apiUrl={config.VITE_API_URL}
          templateId={id ?? ""}
          onInstantiated={(project) => navigate(`/project/${project.id}`)}
        />
      </Suspense>
    </div>
  );
}

function CompilationHubRoute() {
  return (
    <div className="compilation-hub-container" role="region" aria-label="Compilation Hub">
      <header className="section-header">
        <p className="eyebrow">TeX Engines & Compilation</p>
        <h1>Project Compilation</h1>
        <p className="section-lead">
          Select any active project below to open its compilation controls, inspect build diagnostics, and review generated PDFs with SyncTeX navigation.
        </p>
      </header>
      <Suspense fallback={<p role="status">Loading projects for compilation…</p>}>
        <ProjectsDashboard apiUrl={config.VITE_API_URL} initialFilter="recent" />
      </Suspense>
    </div>
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
  const [currentUser, setCurrentUser] = useState<{ displayName: string } | null>(() => {
    try {
      const stored = sessionStorage.getItem("current_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const updateAuth = () => {
      try {
        const stored = sessionStorage.getItem("current_user");
        setCurrentUser(stored ? JSON.parse(stored) : null);
      } catch {
        setCurrentUser(null);
      }
    };
    window.addEventListener("auth-state-change", updateAuth);
    return () => window.removeEventListener("auth-state-change", updateAuth);
  }, []);

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
        <Link to="/" className="shell-logo">
          LaTeX Workspace
        </Link>
        <nav aria-label="Main">
          <Link to="/projects">Projects</Link>
          <Link to="/templates">Templates</Link>
          <Link to="/compilation">Compilation</Link>
          <Link to="/settings/profile">Settings</Link>
          <Link to="/admin">Admin</Link>
          {currentUser ? (
            <span className="user-auth-indicator">
              <span className="user-display-name">{currentUser.displayName}</span>
              <button
                type="button"
                className="btn-signout"
                onClick={() => {
                  try {
                    sessionStorage.removeItem("session_token");
                    sessionStorage.removeItem("csrf_token");
                    sessionStorage.removeItem("current_user");
                    window.dispatchEvent(new Event("auth-state-change"));
                  } catch {}
                  window.location.href = "/login";
                }}
              >
                Sign out
              </button>
            </span>
          ) : (
            <span className="guest-auth-links">
              <Link to="/login">Sign in</Link>
              <Link to="/register" className="btn-register-link">
                Create account
              </Link>
            </span>
          )}
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
              <Suspense fallback={<p role="status">Loading workspace hub…</p>}>
                <HomeHub />
              </Suspense>
            }
          />
          <Route
            path="/projects"
            element={
              <Suspense fallback={<p role="status">Loading dashboard…</p>}>
                <ProjectsDashboard />
              </Suspense>
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
            path="/project/:id/compilation"
            element={
              <Suspense fallback={<p role="status">Loading workspace compilation…</p>}>
                <ProjectWorkspace defaultShowCompile={true} />
              </Suspense>
            }
          />
          <Route path="/compilation" element={<CompilationHubRoute />} />
          <Route path="/templates" element={<TemplatesCatalogueRoute />} />
          <Route path="/templates/:id" element={<TemplatePreviewRoute />} />
          <Route
            path="/admin"
            element={
              <Suspense fallback={<p role="status">Loading admin dashboard…</p>}>
                <AdminDashboard />
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
      <footer className="shell-footer">
        <div className="footer-content">
          <p>© {new Date().getFullYear()} LaTeX Workspace · Collaborative Academic Writing Platform</p>
          <nav aria-label="Footer" className="footer-links">
            <Link to="/">Home</Link>
            <Link to="/projects">Projects</Link>
            <Link to="/templates">Templates</Link>
            <Link to="/compilation">Compilation</Link>
            <Link to="/settings/profile">Settings</Link>
            <Link to="/admin">Admin</Link>
          </nav>
        </div>
      </footer>
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
