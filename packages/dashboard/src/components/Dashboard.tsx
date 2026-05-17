import { useState, useEffect } from "react";
import { listMemories } from "../api";
import type { Memory } from "../api";

const CATEGORY_COLORS: Record<string, string> = {
  architecture: "#3b82f6",
  bug: "#ef4444",
  pattern: "#10b981",
  config: "#f59e0b",
  decision: "#8b5cf6",
  snippet: "#ec4899",
  debug: "#eab308",
  workflow: "#06b6d4",
  dependency: "#f97316",
  custom: "#64748b",
};

const IMPORTANCE_COLORS: Record<string, string> = {
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#ef4444",
};

interface CategoryCount {
  name: string;
  count: number;
  color: string;
}

interface ImportanceCount {
  name: string;
  count: number;
  color: string;
}

function BarChart({ data, maxValue }: { data: { label: string; value: number; color: string }[]; maxValue: number }) {
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div key={d.label} className="bar-row">
          <span className="bar-label">{d.label}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${maxValue > 0 ? (d.value / maxValue) * 100 : 0}%`,
                backgroundColor: d.color,
              }}
            />
          </div>
          <span className="bar-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function MiniTable({ memories, title }: { memories: Memory[]; title: string }) {
  return (
    <div className="dashboard-card">
      <h3>{title}</h3>
      <div className="mini-table">
        {memories.length === 0 && <div className="mini-empty">No data</div>}
        {memories.map((m) => (
          <div key={m.id} className="mini-row">
            <span className="mini-key">{m.key}</span>
            <span className={`badge cat-${m.category}`}>{m.category}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Dashboard({ apiKey }: { apiKey: string }) {
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiKey) { setLoading(false); return; }
    listMemories(apiKey, { limit: 500, sortBy: "updatedAt", sortOrder: "desc" })
      .then((r) => {
        setAllMemories(r.items);
        setTotal(r.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiKey]);

  if (!apiKey) return <div className="empty"><p>Enter your API key in the sidebar</p></div>;
  if (loading) return <div className="loading">Loading...</div>;

  // Compute stats
  const categoryMap = new Map<string, number>();
  const importanceMap = new Map<string, number>();
  const tagMap = new Map<string, number>();

  for (const m of allMemories) {
    categoryMap.set(m.category, (categoryMap.get(m.category) || 0) + 1);
    importanceMap.set(m.importance, (importanceMap.get(m.importance) || 0) + 1);
    for (const t of m.tags) {
      tagMap.set(t, (tagMap.get(t) || 0) + 1);
    }
  }

  const categories: CategoryCount[] = [...categoryMap.entries()]
    .map(([name, count]) => ({ name, count, color: CATEGORY_COLORS[name] || "#64748b" }))
    .sort((a, b) => b.count - a.count);

  const importances: ImportanceCount[] = ["critical", "high", "medium", "low"]
    .filter((k) => importanceMap.has(k))
    .map((name) => ({ name, count: importanceMap.get(name)!, color: IMPORTANCE_COLORS[name] }));

  const topTags = [...tagMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, value]) => ({ label, value, color: "var(--accent)" }));

  const recentMemories = allMemories.slice(0, 5);
  const mostAccessed = [...allMemories]
    .sort((a, b) => b.accessCount - a.accessCount)
    .slice(0, 5);

  const maxCat = Math.max(...categories.map((c) => c.count), 1);
  const maxTag = Math.max(...topTags.map((t) => t.value), 1);

  // Unique categories and unique tags count
  const uniqueTags = tagMap.size;

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your memory database</p>
      </div>

      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-value">{total}</div>
          <div className="stat-label">Total Memories</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{categories.length}</div>
          <div className="stat-label">Categories</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniqueTags}</div>
          <div className="stat-label">Unique Tags</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {allMemories.reduce((sum, m) => sum + m.accessCount, 0)}
          </div>
          <div className="stat-label">Total Accesses</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <h3>Memories by Category</h3>
          <BarChart
            data={categories.map((c) => ({ label: c.name, value: c.count, color: c.color }))}
            maxValue={maxCat}
          />
        </div>

        <div className="dashboard-card">
          <h3>By Importance</h3>
          <div className="importance-grid">
            {importances.map((imp) => (
              <div key={imp.name} className="importance-item">
                <div className="importance-count" style={{ color: imp.color }}>{imp.count}</div>
                <div className="importance-label">{imp.name}</div>
                <div className="importance-bar">
                  <div
                    style={{
                      width: `${(imp.count / total) * 100}%`,
                      backgroundColor: imp.color,
                      height: "4px",
                      borderRadius: "2px",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-card">
          <h3>Top Tags</h3>
          {topTags.length > 0 ? (
            <BarChart data={topTags} maxValue={maxTag} />
          ) : (
            <div className="mini-empty">No tags</div>
          )}
        </div>

        <MiniTable memories={recentMemories} title="Recently Updated" />
        <MiniTable memories={mostAccessed} title="Most Accessed" />
      </div>
    </div>
  );
}
