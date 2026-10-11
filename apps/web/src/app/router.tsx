import { useState, lazy, Suspense } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
const HealthPanel = lazy(() =>
  import("../features/health/health-panel").then((module) => ({ default: module.HealthPanel })),
);
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
      <footer>Local development · S00 bootstrap</footer>
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
