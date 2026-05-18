import { useState, useEffect, useCallback } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { MemoryList } from "./components/MemoryList";
import { Categories } from "./components/Categories";
import { ApiKeys } from "./components/ApiKeys";
import { fetchHealth, listMemories } from "./api";
import type { Memory } from "./api";

type View = "dashboard" | "memories" | "categories" | "keys";

export function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("ponderdb_api_key") || "",
  );
  const [view, setView] = useState<View>("dashboard");
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [projects, setProjects] = useState<string[]>([]);
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

  // Fetch distinct projects when apiKey changes
  useEffect(() => {
    if (!apiKey) { setProjects([]); return; }
    listMemories(apiKey, { limit: 500, sortBy: "updatedAt", sortOrder: "desc" })
      .then((r) => {
        const ids = new Set<string>();
        for (const m of r.items) {
          if (m.projectId) ids.add(m.projectId);
        }
        setProjects([...ids].sort());
      })
      .catch(() => setProjects([]));
  }, [apiKey]);

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
    </Layout>
  );
}
