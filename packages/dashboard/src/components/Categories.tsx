import { useState, useEffect } from "react";
import { listMemories } from "../api";
import type { Memory } from "../api";

const CATEGORY_META: Record<string, { color: string; bg: string; description: string }> = {
  architecture: { color: "#1d4ed8", bg: "#dbeafe", description: "System design, structure, diagrams" },
  bug: { color: "#b91c1c", bg: "#fecaca", description: "Bug reports, fixes, error patterns" },
  pattern: { color: "#047857", bg: "#d1fae5", description: "Code patterns, conventions, best practices" },
  config: { color: "#92400e", bg: "#fef3c7", description: "Configuration, environment variables, settings" },
  decision: { color: "#7c3aed", bg: "#e9d5ff", description: "Technical decisions, tradeoffs, rationale" },
  snippet: { color: "#be185d", bg: "#fce7f3", description: "Code snippets, templates, examples" },
  debug: { color: "#854d0e", bg: "#fef9c3", description: "Debugging notes, traces, inspections" },
  workflow: { color: "#0f766e", bg: "#ccfbf1", description: "Processes, pipelines, deploy steps" },
  dependency: { color: "#c2410c", bg: "#ffedd5", description: "Package versions, library notes" },
  custom: { color: "#475569", bg: "#f1f5f9", description: "Uncategorized memories" },
};

interface CategoriesProps {
  apiKey: string;
  onSelectMemory?: (memory: Memory) => void;
}

export function Categories({ apiKey, onSelectMemory }: CategoriesProps) {
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiKey) { setLoading(false); return; }
    listMemories(apiKey, { limit: 500, sortBy: "updatedAt", sortOrder: "desc" })
      .then((r) => setAllMemories(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiKey]);

  if (!apiKey) return <div className="empty"><p>Enter your API key in the sidebar</p></div>;
  if (loading) return <div className="loading">Loading...</div>;

  // Build category stats
  const categoryMap = new Map<string, Memory[]>();
  for (const m of allMemories) {
    const list = categoryMap.get(m.category) || [];
    list.push(m);
    categoryMap.set(m.category, list);
  }

  const categories = Object.keys(CATEGORY_META).map((name) => ({
    name,
    memories: categoryMap.get(name) || [],
    count: categoryMap.get(name)?.length || 0,
    ...CATEGORY_META[name],
  }));

  if (selectedCat) {
    const cat = categories.find((c) => c.name === selectedCat);
    if (!cat) return null;

    return (
      <div>
        <div className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCat(null)}>
              Back
            </button>
            <h2>
              <span className={`badge cat-${cat.name}`} style={{ fontSize: 14, padding: "4px 12px" }}>
                {cat.name}
              </span>
            </h2>
          </div>
          <p>{cat.description} &middot; {cat.count} memories</p>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Importance</th>
                <th>Tags</th>
                <th>Content Preview</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {cat.memories.map((m) => (
                <tr key={m.id} className={onSelectMemory ? "clickable" : ""} onClick={() => onSelectMemory?.(m)}>
                  <td className="key-cell">{m.key}</td>
                  <td><span className={`badge imp-${m.importance}`}>{m.importance}</span></td>
                  <td className="tags-cell">{m.tags.join(", ") || "—"}</td>
                  <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: 12 }}>
                    {m.content.slice(0, 80)}{m.content.length > 80 ? "..." : ""}
                  </td>
                  <td className="date-cell">{new Date(m.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {cat.memories.length === 0 && (
                <tr><td colSpan={5} className="empty-row">No memories in this category</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Categories</h2>
        <p>Browse memories organized by category</p>
      </div>

      <div className="category-grid">
        {categories.map((cat) => (
          <div
            key={cat.name}
            className="category-card"
            onClick={() => cat.count > 0 && setSelectedCat(cat.name)}
            style={{ cursor: cat.count > 0 ? "pointer" : "default", opacity: cat.count > 0 ? 1 : 0.5 }}
          >
            <div className="category-card-header">
              <span className={`badge cat-${cat.name}`} style={{ fontSize: 12, padding: "3px 10px" }}>
                {cat.name}
              </span>
              <span className="category-count">{cat.count}</span>
            </div>
            <p className="category-desc">{cat.description}</p>
            <div className="category-bar">
              <div
                style={{
                  width: `${allMemories.length > 0 ? (cat.count / allMemories.length) * 100 : 0}%`,
                  backgroundColor: cat.color,
                  height: "4px",
                  borderRadius: "2px",
                  minWidth: cat.count > 0 ? "4px" : "0",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
