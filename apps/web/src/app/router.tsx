import { useEffect, useState, lazy, Suspense } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
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
  import("../features/admin/dashboard.js").then((module) => ({ default: module.AdminDashboard })),
);
const CompilationHub = lazy(() =>
  import("../features/compilation/hub.js").then((module) => ({
    default: module.CompilationHub,
  })),
);

const navItems: Array<{ to: string; label: string }> = [
  { to: "/projects", label: "Projects" },
  { to: "/templates", label: "Templates" },
  { to: "/compilation", label: "Compilation" },
  { to: "/settings/profile", label: "Settings" },
];

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
    <div className="page-column" role="region" aria-label="Templates Catalogue">
      <header className="page-header">
        <p className="eyebrow">Document Starters</p>
        <h1>Templates Catalogue</h1>
        <p className="section-lead">
          Browse tested templates for articles, theses, reports, and presentations. Select or
          instantiate any template directly into your workspace.
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
    <div className="page-column" role="region" aria-label="Template Preview">
      <header className="page-header">
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
    <div role="region" aria-label="Compilation Hub">
      <Suspense fallback={<p role="status">Loading projects for compilation…</p>}>
        <CompilationHub apiUrl={config.VITE_API_URL} />
      </Suspense>
    </div>
  );
}

function initialsFor(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}

function Shell() {
  const location = useLocation();
  const isWorkspace = /^\/project\/[^/]+(?:\/compilation)?\/?$/.test(location.pathname);
  const resolvedDark = () => {
    const preference = localStorage.getItem("theme");
    return (
      preference === "dark" ||
      (preference === "system" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches)
    );
  };
  const [dark, setDark] = useState(resolvedDark);
  const [currentUser, setCurrentUser] = useState<{ displayName?: string } | null>(() => {
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

    // If no user is cached in session storage, probe /auth/session to restore state
    let active = true;
    if (!currentUser) {
      void (async () => {
        try {
          const res = await fetch(`${config.VITE_API_URL}/auth/session`, {
            credentials: "include",
          });
          if (!res.ok) return;
          const data = (await res.json()) as { displayName?: string };
          const csrf = res.headers.get("x-csrf-token");
          const sessionToken = res.headers.get("x-session-token");
          if (data && active) {
            try {
              if (csrf) sessionStorage.setItem("csrf_token", csrf);
              if (sessionToken) sessionStorage.setItem("session_token", sessionToken);
              sessionStorage.setItem("current_user", JSON.stringify(data));
              window.dispatchEvent(new Event("auth-state-change"));
            } catch {}
          }
        } catch {}
      })();
    }

    return () => {
      active = false;
      window.removeEventListener("auth-state-change", updateAuth);
    };
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

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  return (
    <div className={`shell${dark ? " dark" : ""}${isWorkspace ? " workspace-shell" : ""}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      {!isWorkspace && (
        <header className="app-header">
          <Link to="/" className="shell-logo">
            <span className="logo-mark" aria-hidden="true">
              Λ
            </span>
            <span className="logo-text">
              LaTeX Workspace
              <span className="logo-tagline">Collaborative writing</span>
            </span>
          </Link>
          <nav aria-label="Main" className="main-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-pill${isActive ? " active" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-tools">
            {currentUser ? (
              <details className="user-menu">
                <summary aria-label="Account menu">
                  <span className="user-avatar" aria-hidden="true">
                    {initialsFor(currentUser.displayName)}
                  </span>
                  <span className="user-display-name">{currentUser.displayName || "Account"}</span>
                  <span className="chevron" aria-hidden="true">
                    ▾
                  </span>
                </summary>
                <div className="user-menu-panel">
                  <Link to="/settings/profile">Account settings</Link>
                  <Link to="/admin">Admin</Link>
                  <button
                    type="button"
                    className="btn-signout"
                    onClick={async () => {
                      try {
                        await fetch(`${config.VITE_API_URL}/auth/logout`, {
                          method: "POST",
                          credentials: "include",
                        });
                      } catch {}
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
                </div>
              </details>
            ) : (
              <span className="guest-auth-links">
                <Link to="/login">Sign in</Link>
                <Link to="/register" className="btn-register-link">
                  Create account
                </Link>
              </span>
            )}
            <button
              type="button"
              className="theme-toggle"
              aria-pressed={dark}
              aria-label="Dark theme"
              title={dark ? "Switch to light theme" : "Switch to dark theme"}
              onClick={() => {
                setDark(!dark);
                localStorage.setItem("theme", dark ? "light" : "dark");
              }}
            >
              {dark ? (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <circle
                    cx="12"
                    cy="12"
                    r="4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <span>{dark ? "Light theme" : "Dark theme"}</span>
            </button>
          </div>
        </header>
      )}
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
      {!isWorkspace && (
        <footer className="shell-footer">
          <div className="footer-content">
            <p>
              © {new Date().getFullYear()} LaTeX Workspace · Collaborative Academic Writing Platform
            </p>
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
      )}
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
