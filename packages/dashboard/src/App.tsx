import { useState, useEffect, useCallback } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { MemoryList } from "./components/MemoryList";
import { Categories } from "./components/Categories";
import { ApiKeys } from "./components/ApiKeys";
import { Projects } from "./components/Projects";
import { fetchHealth, listProjects } from "./api";
import type { Memory, ProjectInfo } from "./api";

type View = "dashboard" | "memories" | "categories" | "keys" | "projects";

function SetupScreen({ onConnect }: { onConnect: (key: string) => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("pndr_")) {
      setError("API key must start with pndr_");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/memories?limit=0", {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (!res.ok) throw new Error("Invalid API key");
      onConnect(trimmed);
    } catch {
      setError("Invalid API key. Check the key printed in your server console.");
      setLoading(false);
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <img src="/ponder-icon.svg" alt="PonderDB" className="setup-logo" />
        <h1>Welcome to PonderDB</h1>
        <p>Paste the API key from your server console to get started.</p>
        <form onSubmit={handleSubmit} className="setup-form">
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="pndr_xK9mR2vT8pL1qN7w..."
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !key.trim()}>
            {loading ? "Connecting..." : "Connect"}
          </button>
        </form>
        {error && <div className="setup-error">{error}</div>}
        <p className="setup-hint">
          Your API key was printed when the server started. Look for <code>pndr_...</code> in the terminal.
        </p>
      </div>
    </div>
  );
}

export function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("ponderdb_api_key") || "",
  );
  const [view, setView] = useState<View>("dashboard");
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [projectId, setProjectId] = useState<string>(
    () => localStorage.getItem("ponderdb_project") || "",
  );

  useEffect(() => {
    fetchHealth()
      .then(() => setHealthy(true))
      .catch(() => setHealthy(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("ponderdb_api_key", apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("ponderdb_project", projectId);
  }, [projectId]);

  const loadProjects = useCallback(() => {
    if (!apiKey) { setProjects([]); return; }
    listProjects(apiKey)
      .then((r) => {
        setProjects(r.projects);
        if (r.projects.length > 0) {
          const currentExists = r.projects.some((p) => p.slug === projectId);
          if (!projectId || !currentExists) {
            setProjectId(r.projects[0].slug);
          }
        }
      })
      .catch(() => setProjects([]));
  }, [apiKey, projectId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const handleSelectMemory = useCallback((memory: Memory) => {
    setSelectedMemory(memory);
    setView("memories");
  }, []);

  const handleViewChange = useCallback((v: View) => {
    setSelectedMemory(null);
    setView(v);
  }, []);

  if (healthy === null) return <div className="loading">Connecting to PonderDB...</div>;
  if (healthy === false)
    return (
      <div className="error-page">
        <h1>Cannot connect to PonderDB</h1>
        <p>Make sure server is running on port 7437</p>
      </div>
    );

  // No API key — show setup screen
  if (!apiKey) {
    return <SetupScreen onConnect={setApiKey} />;
  }

  // API key set but no projects — force project creation
  if (projects.length === 0) {
    return (
      <Layout
        view="projects"
        onViewChange={handleViewChange}
        apiKey={apiKey}

        healthy={true}
        projects={projects}
        projectId={projectId}
        onProjectChange={setProjectId}
      >
        <Projects apiKey={apiKey} currentProjectId={projectId} onProjectsChanged={loadProjects} />
      </Layout>
    );
  }

  return (
    <Layout
      view={view}
      onViewChange={handleViewChange}
      apiKey={apiKey}
      onApiKeyChange={setApiKey}
      healthy={true}
      projects={projects}
      projectId={projectId}
      onProjectChange={setProjectId}
    >
      {view === "dashboard" && <Dashboard apiKey={apiKey} projectId={projectId} onSelectMemory={handleSelectMemory} />}
      {view === "memories" && (
        <MemoryList
          apiKey={apiKey}
          projectId={projectId}
          initialMemory={selectedMemory}
          onMemoryConsumed={() => setSelectedMemory(null)}
        />
      )}
      {view === "categories" && <Categories apiKey={apiKey} projectId={projectId} onSelectMemory={handleSelectMemory} />}
      {view === "keys" && <ApiKeys apiKey={apiKey} onApiKeyChange={setApiKey} />}
      {view === "projects" && <Projects apiKey={apiKey} currentProjectId={projectId} onProjectsChanged={loadProjects} />}
    </Layout>
  );
}
