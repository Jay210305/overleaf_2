import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { parsePublicConfig } from "@latex-collab/config";
import {
  projectSettingsViewSchema,
  treeViewSchema,
  type Compiler,
  type ProjectNodeView,
  type ProjectSettingsView,
} from "@latex-collab/contracts";

const config = parsePublicConfig(import.meta.env);
const defaultApiUrl = config.VITE_API_URL;

export interface ProjectSettingsProps {
  projectId: string;
  apiUrl?: string | undefined;
  csrfToken?: string | undefined;
  onSaved?: ((settings: ProjectSettingsView) => void) | undefined;
}

export function ProjectSettings({
  projectId,
  apiUrl = defaultApiUrl,
  csrfToken,
  onSaved,
}: ProjectSettingsProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form values
  const [mainFileId, setMainFileId] = useState<string | null>(null);
  const [compiler, setCompiler] = useState<Compiler>("pdflatex");
  const [texliveVersion, setTexliveVersion] = useState<string>("2024.1");
  const [autoCompile, setAutoCompile] = useState<boolean>(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(30);
  const [treeVersion, setTreeVersion] = useState<number>(0);

  // Available tex files in the project
  const [texFiles, setTexFiles] = useState<ProjectNodeView[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch settings
      const settingsRes = await fetch(`${apiUrl}/projects/${projectId}/settings`, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "include",
      });

      if (!settingsRes.ok) {
        if (settingsRes.status === 401) {
          setError("Session expired. Please log in.");
        } else if (settingsRes.status === 403 || settingsRes.status === 404) {
          setError("Project settings not found or access denied.");
        } else {
          setError("Failed to load project settings.");
        }
        return;
      }

      const settingsJson = await settingsRes.json();
      const parsedSettings = projectSettingsViewSchema.safeParse(settingsJson);
      if (parsedSettings.success) {
        setMainFileId(parsedSettings.data.mainFileId);
        setCompiler(parsedSettings.data.compiler);
        setTexliveVersion(parsedSettings.data.texliveImageVersion);
        setAutoCompile(parsedSettings.data.autoCompile);
        setTimeoutSeconds(parsedSettings.data.timeoutSeconds);
      }

      // 2. Fetch nodes to populate root file selector
      const nodesRes = await fetch(`${apiUrl}/projects/${projectId}/nodes`, {
        method: "GET",
        headers: { accept: "application/json" },
        credentials: "include",
      });

      if (nodesRes.ok) {
        const nodesJson = await nodesRes.json();
        const parsedTree = treeViewSchema.safeParse(nodesJson);
        if (parsedTree.success) {
          setTreeVersion(parsedTree.data.treeVersion);
          const filtered = parsedTree.data.items.filter(
            (n) => n.kind === "FILE" && n.name.toLowerCase().endsWith(".tex"),
          );
          setTexFiles(filtered);
        }
      }
    } catch {
      setError("Network error while loading project settings.");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    // Client-side bounds check for EDT-12 timeout policy
    if (timeoutSeconds < 5 || timeoutSeconds > 120) {
      setError("Compilation timeout must be between 5 and 120 seconds.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/projects/${projectId}/settings`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          "if-match": `"${treeVersion}"`,
        },
        credentials: "include",
        body: JSON.stringify({
          mainFileId,
          compiler,
          texliveImageVersion: texliveVersion,
          autoCompile,
          timeoutSeconds,
        }),
      });

      if (!res.ok) {
        if (res.status === 400) {
          setError("Invalid settings: root must be a valid .tex file and compiler must be supported.");
        } else if (res.status === 412) {
          setError("Project was updated concurrently. Please refresh.");
        } else if (res.status === 403) {
          setError("Permission denied: only project editors may change settings.");
        } else {
          setError("Failed to update project settings.");
        }
        await loadData();
        return;
      }

      const updated = (await res.json()) as ProjectSettingsView;
      setSuccessMessage("Project settings updated successfully.");
      if (onSaved) {
        onSaved(updated);
      }
      await loadData();
    } catch {
      setError("Network error while saving settings.");
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: "20px", color: "#6b7280" }}>Loading project settings...</div>;
  }

  return (
    <section
      role="region"
      aria-label="Project compiler settings"
      style={{
        maxWidth: "600px",
        padding: "24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "20px", margin: "0 0 8px 0" }}>Project & Compiler Settings</h1>
        <p style={{ color: "#4b5563", fontSize: "14px", margin: 0 }}>
          Configure root document, LaTeX engine, and execution constraints.
        </p>
      </header>

      {error && (
        <div role="alert" style={{ color: "#dc2626", marginBottom: "16px", fontSize: "14px" }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div role="status" aria-live="polite" style={{ color: "#16a34a", marginBottom: "16px", fontSize: "14px" }}>
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* PRO-07: Root Document */}
        <div>
          <label
            htmlFor="root-document-select"
            style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}
          >
            Root Document (.tex):
          </label>
          <select
            id="root-document-select"
            value={mainFileId ?? "NONE"}
            onChange={(e) => setMainFileId(e.target.value === "NONE" ? null : e.target.value)}
            style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
          >
            <option value="NONE">-- No root document selected --</option>
            {texFiles.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            Only active .tex files within this project may be selected as root.
          </span>
        </div>

        {/* EDT-12: Compiler Engine */}
        <div>
          <label
            htmlFor="compiler-engine-select"
            style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}
          >
            LaTeX Engine:
          </label>
          <select
            id="compiler-engine-select"
            value={compiler}
            onChange={(e) => setCompiler(e.target.value as Compiler)}
            style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db" }}
          >
            <option value="pdflatex">pdfLaTeX (Default)</option>
            <option value="xelatex">XeLaTeX</option>
            <option value="lualatex">LuaLaTeX</option>
            <option value="latex">LaTeX</option>
          </select>
        </div>

        {/* TeX Live Image Version */}
        <div>
          <label
            htmlFor="texlive-version-input"
            style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}
          >
            TeX Live Image Version:
          </label>
          <input
            id="texlive-version-input"
            type="text"
            value={texliveVersion}
            onChange={(e) => setTexliveVersion(e.target.value)}
            style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db", boxSizing: "border-box" }}
          />
        </div>

        {/* Auto-compile */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <input
            id="auto-compile-checkbox"
            type="checkbox"
            checked={autoCompile}
            onChange={(e) => setAutoCompile(e.target.checked)}
          />
          <label htmlFor="auto-compile-checkbox" style={{ fontSize: "14px" }}>
            Enable Auto-compile on save
          </label>
        </div>

        {/* EDT-12: Compilation Timeout */}
        <div>
          <label
            htmlFor="timeout-seconds-input"
            style={{ display: "block", fontWeight: 600, fontSize: "14px", marginBottom: "6px" }}
          >
            Compilation Timeout (seconds):
          </label>
          <input
            id="timeout-seconds-input"
            type="number"
            min={5}
            max={120}
            value={timeoutSeconds}
            onChange={(e) => setTimeoutSeconds(Number.parseInt(e.target.value, 10) || 30)}
            style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #d1d5db", boxSizing: "border-box" }}
          />
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            Server policy enforces a limit between 5 and 120 seconds.
          </span>
        </div>

        {/* Submit */}
        <div style={{ marginTop: "12px" }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 20px",
              backgroundColor: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </section>
  );
}
