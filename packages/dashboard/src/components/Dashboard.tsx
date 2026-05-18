import { useState, useEffect, useRef } from "react";
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

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = ref.current;
    const diff = target - start;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + diff * eased);
      setValue(current);
      ref.current = current;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
}

function AnimatedBar({ width, color, delay }: { width: number; color: string; delay: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      className="bar-fill"
      style={{
        width: mounted ? `${width}%` : "0%",
        backgroundColor: color,
        transition: "width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    />
  );
}

function BarChart({ data, maxValue }: { data: { label: string; value: number; color: string }[]; maxValue: number }) {
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={d.label} className="bar-row">
          <span className="bar-label">{d.label}</span>
          <div className="bar-track">
            <AnimatedBar
              width={maxValue > 0 ? (d.value / maxValue) * 100 : 0}
              color={d.color}
              delay={i * 60}
            />
          </div>
          <span className="bar-value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function MiniTable({
  memories,
  title,
  subtitle,
  onSelect,
}: {
  memories: Memory[];
  title: string;
  subtitle?: string;
  onSelect?: (m: Memory) => void;
}) {
  return (
    <div className="dashboard-card fade-in">
      <div className="card-title-row">
        <h3>{title}</h3>
        {subtitle && <span className="card-subtitle">{subtitle}</span>}
      </div>
      <div className="mini-table">
        {memories.length === 0 && <div className="mini-empty">No data</div>}
        {memories.map((m) => (
          <div
            key={m.id}
            className={`mini-row ${onSelect ? "mini-row-clickable" : ""}`}
            onClick={() => onSelect?.(m)}
          >
            <span className="mini-key">{m.key}</span>
            <div className="mini-row-right">
              <span className={`badge cat-${m.category}`}>{m.category}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface DashboardProps {
  apiKey: string;
  projectId?: string;
  onSelectMemory?: (memory: Memory) => void;
}

export function Dashboard({ apiKey, projectId, onSelectMemory }: DashboardProps) {
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!apiKey) { setLoading(false); return; }
    listMemories(apiKey, { limit: 500, sortBy: "updatedAt", sortOrder: "desc", projectId: projectId || undefined })
      .then((r) => {
        setAllMemories(r.items);
        setTotal(r.total);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        requestAnimationFrame(() => setVisible(true));
      });
  }, [apiKey, projectId]);

  if (!apiKey) return <div className="empty"><p>Enter your API key in the sidebar</p></div>;
  if (loading) return <div className="loading">Loading...</div>;

  const categoryMap = new Map<string, number>();
  const importanceMap = new Map<string, number>();
  const tagMap = new Map<string, number>();
  let totalAccesses = 0;

  for (const m of allMemories) {
    categoryMap.set(m.category, (categoryMap.get(m.category) || 0) + 1);
    importanceMap.set(m.importance, (importanceMap.get(m.importance) || 0) + 1);
    for (const t of m.tags) {
      tagMap.set(t, (tagMap.get(t) || 0) + 1);
    }
    totalAccesses += m.accessCount;
  }

  const categories = [...categoryMap.entries()]
    .map(([name, count]) => ({ name, count, color: CATEGORY_COLORS[name] || "#64748b" }))
    .sort((a, b) => b.count - a.count);

  const importances = ["critical", "high", "medium", "low"]
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
  const highImportance = allMemories
    .filter((m) => m.importance === "critical" || m.importance === "high")
    .slice(0, 5);

  const maxCat = Math.max(...categories.map((c) => c.count), 1);
  const maxTag = Math.max(...topTags.map((t) => t.value), 1);
  const uniqueTags = tagMap.size;

  // Average content length
  const avgContentLen = allMemories.length > 0
    ? Math.round(allMemories.reduce((s, m) => s + m.content.length, 0) / allMemories.length)
    : 0;

  return (
    <div className={`dashboard-page ${visible ? "dashboard-visible" : ""}`}>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your memory database</p>
      </div>

      <StatCards
        total={total}
        categories={categories.length}
        uniqueTags={uniqueTags}
        totalAccesses={totalAccesses}
        avgContentLen={avgContentLen}
      />

      <div className="dashboard-grid">
        <div className="dashboard-card fade-in">
          <h3>Memories by Category</h3>
          <BarChart
            data={categories.map((c) => ({ label: c.name, value: c.count, color: c.color }))}
            maxValue={maxCat}
          />
        </div>

        <div className="dashboard-card fade-in">
          <h3>By Importance</h3>
          <div className="importance-grid">
            {importances.map((imp) => (
              <ImportanceCard key={imp.name} {...imp} total={total} />
            ))}
          </div>
        </div>

        <div className="dashboard-card fade-in">
          <h3>Top Tags</h3>
          {topTags.length > 0 ? (
            <BarChart data={topTags} maxValue={maxTag} />
          ) : (
            <div className="mini-empty">No tags</div>
          )}
        </div>

        <MiniTable
          memories={highImportance}
          title="High Priority"
          subtitle={`${highImportance.length} critical/high`}
          onSelect={onSelectMemory}
        />
        <MiniTable
          memories={recentMemories}
          title="Recently Updated"
          onSelect={onSelectMemory}
        />
        <MiniTable
          memories={mostAccessed}
          title="Most Accessed"
          onSelect={onSelectMemory}
        />
      </div>
    </div>
  );
}

function StatCards({
  total,
  categories,
  uniqueTags,
  totalAccesses,
  avgContentLen,
}: {
  total: number;
  categories: number;
  uniqueTags: number;
  totalAccesses: number;
  avgContentLen: number;
}) {
  const animTotal = useCountUp(total);
  const animCat = useCountUp(categories);
  const animTags = useCountUp(uniqueTags);
  const animAccesses = useCountUp(totalAccesses);
  const animAvg = useCountUp(avgContentLen);

  const stats = [
    { value: animTotal, label: "Total Memories", icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", color: "var(--accent)" },
    { value: animCat, label: "Categories", icon: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z", color: "#8b5cf6" },
    { value: animTags, label: "Unique Tags", icon: "M7 20l4-16m2 16l4-16M6 9h14M4 15h14", color: "#10b981" },
    { value: animAccesses, label: "Total Accesses", icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z", color: "#f59e0b" },
    { value: animAvg, label: "Avg Length (chars)", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", color: "#ec4899" },
  ];

  return (
    <div className="stats-bar">
      {stats.map((s, i) => (
        <div key={s.label} className="stat-card stat-card-animated" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="stat-icon" style={{ color: s.color }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={s.icon} />
            </svg>
          </div>
          <div className="stat-value" style={{ color: s.color }}>{s.value.toLocaleString()}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

function ImportanceCard({ name, count, color, total }: { name: string; count: number; color: string; total: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="importance-item">
      <div className="importance-count" style={{ color }}>{count}</div>
      <div className="importance-label">{name}</div>
      <div className="importance-bar">
        <div
          style={{
            width: mounted ? `${(count / total) * 100}%` : "0%",
            backgroundColor: color,
            height: "4px",
            borderRadius: "2px",
            transition: "width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
          }}
        />
      </div>
    </div>
  );
}
