import { useState } from "react";
import { searchMemories } from "../api";
import type { SearchResult } from "../api";

export function Search({ apiKey }: { apiKey: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setError("");
    try {
      const data = await searchMemories(apiKey, query);
      setResults(data.results);
      setSearched(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  };

  if (!apiKey) return <div className="empty">Enter API key to search</div>;

  return (
    <div className="search-view">
      <h2>Search Memories</h2>
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by meaning..."
          autoFocus
        />
        <button type="submit">Search</button>
      </form>

      {error && <div className="error">{error}</div>}

      {searched && results.length === 0 && (
        <div className="empty">No results found</div>
      )}

      <div className="search-results">
        {results.map((r) => (
          <div key={r.memory.id} className="search-result">
            <div className="result-header">
              <strong>{r.memory.key}</strong>
              <span className="score">
                {r.matchType} &middot; {(r.score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="result-meta">
              <span className={`badge cat-${r.memory.category}`}>{r.memory.category}</span>
              <span className={`badge imp-${r.memory.importance}`}>{r.memory.importance}</span>
            </div>
            <p className="result-content">
              {r.memory.content.slice(0, 300)}
              {r.memory.content.length > 300 ? "..." : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
