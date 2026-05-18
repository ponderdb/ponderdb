import { useState, useEffect, useCallback } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { MemoryList } from "./components/MemoryList";
import { Categories } from "./components/Categories";
import { ApiKeys } from "./components/ApiKeys";
import { fetchHealth } from "./api";
import type { Memory } from "./api";

type View = "dashboard" | "memories" | "categories" | "keys";

export function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("ponderdb_api_key") || "",
  );
  const [view, setView] = useState<View>("dashboard");
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(() => setHealthy(true))
      .catch(() => setHealthy(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("ponderdb_api_key", apiKey);
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
    >
      {view === "dashboard" && <Dashboard apiKey={apiKey} onSelectMemory={handleSelectMemory} />}
      {view === "memories" && (
        <MemoryList
          apiKey={apiKey}
          initialMemory={selectedMemory}
          onMemoryConsumed={() => setSelectedMemory(null)}
        />
      )}
      {view === "categories" && <Categories apiKey={apiKey} onSelectMemory={handleSelectMemory} />}
      {view === "keys" && <ApiKeys apiKey={apiKey} />}
    </Layout>
  );
}
