import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { parsePublicConfig } from "@latex-collab/config";
import { HealthPanel } from "../health/health-panel.js";
import { TemplateCatalogue, type InstantiatedProject } from "../templates/catalogue.js";
import { ProjectsDashboard } from "../projects/dashboard.js";

const config = parsePublicConfig(import.meta.env);
const apiUrl = config.VITE_API_URL;

interface StoredUser {
  id?: string;
  email?: string;
  displayName?: string;
}

export function HomeHub() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(() => {
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

  const handleTemplateInstantiated = (project: InstantiatedProject) => {
    navigate(`/project/${project.id}`);
  };

  return (
    <div className="home-hub" role="region" aria-label="Workspace landing hub">
      {currentUser ? (
        <section className="hub-authenticated" aria-labelledby="hub-welcome-heading">
          <header className="hub-welcome-header">
            <p className="eyebrow">Academic Workspace</p>
            <h1 id="hub-welcome-heading">
              Welcome back, {currentUser.displayName || "Researcher"}.
            </h1>
            <p className="hub-welcome-lead">
              Continue working on your research documents, start a new paper, or explore
              pre-configured templates.
            </p>
            <div className="hub-action-buttons">
              <Link to="/projects" className="btn btn-primary">
                Go to Projects Dashboard
              </Link>
              <Link to="/templates" className="btn btn-secondary">
                Browse Templates
              </Link>
              <Link to="/settings/profile" className="btn btn-secondary">
                Account Settings
              </Link>
            </div>
          </header>

          <section className="hub-section" aria-labelledby="hub-recent-projects-heading">
            <div className="hub-section-header">
              <h2 id="hub-recent-projects-heading">Recent Projects</h2>
              <Link to="/projects">View all projects →</Link>
            </div>
            <ProjectsDashboard apiUrl={apiUrl} initialFilter="recent" compact />
          </section>

          <section className="hub-section" aria-labelledby="hub-templates-heading">
            <div className="hub-section-header">
              <h2 id="hub-templates-heading">Start from a Template</h2>
              <Link to="/templates">Browse all templates →</Link>
            </div>
            <TemplateCatalogue apiUrl={apiUrl} onInstantiated={handleTemplateInstantiated} />
          </section>

          <section className="hub-section hub-health" aria-labelledby="hub-system-status">
            <h2 id="hub-system-status">System Status</h2>
            <HealthPanel />
          </section>
        </section>
      ) : (
        <section className="hub-guest" aria-labelledby="hub-guest-heading">
          <header className="hub-hero">
            <p className="eyebrow">A workspace for academic writing</p>
            <h1 id="hub-guest-heading">Build your next document.</h1>
            <p className="hub-lead">
              The collaborative LaTeX platform engineered for researchers and academics. Real-time
              multiplayer editing, fast cloud compilation with SyncTeX, full version history with
              Myers visual diffs, citation management, and Git synchronization.
            </p>
            <div className="hub-action-buttons">
              <Link to="/register" className="btn btn-primary">
                Create account
              </Link>
              <Link to="/login" className="btn btn-secondary">
                Sign in
              </Link>
              <Link to="/templates" className="btn btn-secondary">
                Explore Templates
              </Link>
            </div>
          </header>

          <section className="hub-features" aria-labelledby="hub-features-heading">
            <h2 id="hub-features-heading" className="sr-only">
              Features
            </h2>
            <div className="features-grid">
              <article className="feature-card">
                <h3>Real-Time Collaboration</h3>
                <p>
                  Multi-user conflict-free editing powered by Yjs and durable WebSocket streams.
                  Live collaborator cursors, inline comment anchors, and dedicated project chat.
                </p>
              </article>
              <article className="feature-card">
                <h3>Fast Cloud Compilation</h3>
                <p>
                  Isolated compilation with pdflatex, xelatex, and lualatex. Direct PDF preview with
                  bidirectional SyncTeX navigation from code to PDF and back.
                </p>
              </article>
              <article className="feature-card">
                <h3>Version History & Diffs</h3>
                <p>
                  Automatic immutable snapshot timeline. Compare revisions side-by-side with
                  semantic Myers diffs, label milestones, and safely restore previous versions.
                </p>
              </article>
              <article className="feature-card">
                <h3>Citations & Integrations</h3>
                <p>
                  Integrated BibTeX search, duplicate citation key analysis, Zotero reference sync,
                  and bi-directional GitHub repository synchronization.
                </p>
              </article>
            </div>
          </section>

          <section className="hub-section" aria-labelledby="hub-guest-templates">
            <div className="hub-section-header">
              <h2 id="hub-guest-templates">Featured Templates</h2>
              <Link to="/templates">Browse all templates →</Link>
            </div>
            <p className="hub-subtext">
              Jumpstart your writing with tested templates for articles, theses, and reports.
            </p>
            <TemplateCatalogue apiUrl={apiUrl} onInstantiated={handleTemplateInstantiated} />
          </section>

          <section className="hub-section hub-health" aria-labelledby="hub-guest-health">
            <h2 id="hub-guest-health">System Status</h2>
            <HealthPanel />
          </section>
        </section>
      )}
    </div>
  );
}
