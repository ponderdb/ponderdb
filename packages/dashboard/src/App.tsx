import { useState, useEffect } from "react";
import { Layout } from "./components/Layout";
import { MemoryList } from "./components/MemoryList";
import { Search } from "./components/Search";
import { Stats } from "./components/Stats";
import { ApiKeys } from "./components/ApiKeys";
import { fetchHealth } from "./api";

type View = "memories" | "search" | "keys";

export function App() {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("ponderdb_api_key") || "",
  );
  const [view, setView] = useState<View>("memories");
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(() => setHealthy(true))
      .catch(() => setHealthy(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("ponderdb_api_key", apiKey);
  }, [apiKey]);

  if (healthy === null) return <div className="loading">Connecting...</div>;
  if (healthy === false)
    return (
      <div className="error-page">
        <h1>Cannot connect to PonderDB</h1>
        <p>Make sure server is running on port 7437</p>
      </div>
    );

  return (
    <Layout view={view} onViewChange={setView}>
      <div className="top-bar">
        <Stats apiKey={apiKey} />
        <div className="api-key-input">
          <label>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="pndr_..."
          />
        </div>
      </div>
      <div className="content">
        {view === "memories" && <MemoryList apiKey={apiKey} />}
        {view === "search" && <Search apiKey={apiKey} />}
        {view === "keys" && <ApiKeys apiKey={apiKey} />}
      </div>
    </Layout>
  );
}
