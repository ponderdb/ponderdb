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
        // Auto-select first project if none selected or current doesn't exist
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

  // If API key set but no projects exist, force project creation
  if (apiKey && projects.length === 0 && healthy) {
    return (
      <Layout
        view="projects"
        onViewChange={handleViewChange}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
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
      {view === "keys" && <ApiKeys apiKey={apiKey} />}
      {view === "projects" && <Projects apiKey={apiKey} currentProjectId={projectId} onProjectsChanged={loadProjects} />}
    </Layout>
  );
}
