import { useState, useEffect } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./components/Dashboard";
import { MemoryList } from "./components/MemoryList";
import { Search } from "./components/Search";
import { Categories } from "./components/Categories";
import { ApiKeys } from "./components/ApiKeys";
import { fetchHealth } from "./api";

type View = "dashboard" | "memories" | "search" | "categories" | "keys";

export function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("ponderdb_api_key") || "",
  );
  const [view, setView] = useState<View>("dashboard");
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(() => setHealthy(true))
      .catch(() => setHealthy(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("ponderdb_api_key", apiKey);
  }, [apiKey]);

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
      onViewChange={setView}
      apiKey={apiKey}
      onApiKeyChange={setApiKey}
      healthy={true}
    >
      {view === "dashboard" && <Dashboard apiKey={apiKey} />}
      {view === "memories" && <MemoryList apiKey={apiKey} />}
      {view === "search" && <Search apiKey={apiKey} />}
      {view === "categories" && <Categories apiKey={apiKey} />}
      {view === "keys" && <ApiKeys apiKey={apiKey} />}
    </Layout>
  );
}
