import { useState, useEffect, useCallback } from "react";
import { listMemories, deleteMemory } from "../api";
import type { Memory } from "../api";
import { MemoryDetail } from "./MemoryDetail";

const CATEGORIES = [
  "",
  "architecture",
  "bug",
  "pattern",
  "config",
  "decision",
  "snippet",
  "debug",
  "workflow",
  "dependency",
  "custom",
];
const PAGE_SIZE = 20;

interface MemoryListProps {
  apiKey: string;
  projectId?: string;
  initialMemory?: Memory | null;
  onMemoryConsumed?: () => void;
}

export function MemoryList({ apiKey, projectId, initialMemory, onMemoryConsumed }: MemoryListProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<Memory | null>(initialMemory || null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialMemory) {
      setSelected(initialMemory);
      onMemoryConsumed?.();
    }
  }, [initialMemory]);

  const load = useCallback(() => {
    if (!apiKey) return;
    setError("");
    listMemories(apiKey, {
      category: category || undefined,
      projectId: projectId || undefined,
      limit: PAGE_SIZE,
      offset,
      sortBy: "updatedAt",
      sortOrder: "desc",
    })
      .then((r) => {
        setMemories(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(e.message));
  }, [apiKey, projectId, category, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete memory "${key}"?`)) return;
    try {
      await deleteMemory(apiKey, key);
      setSelected(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (!apiKey) {
    return (
      <div className="empty">
        <p>Enter your API key in the sidebar to view memories</p>
      </div>
    );
  }

  if (selected) {
    return (
      <MemoryDetail
        memory={selected}
        onBack={() => setSelected(null)}
        onDelete={() => handleDelete(selected.key)}
      />
    );
  }

  // Client-side text filter on loaded memories
  const filtered = searchText
    ? memories.filter((m) => {
        const q = searchText.toLowerCase();
        return (
          m.key.toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
    : memories;

  return (
    <div>
      <div className="page-header">
        <h2>Memories</h2>
        <p>Browse and manage all stored memories</p>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <input
            type="text"
            className="filter-search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Filter by key, content, or tag..."
          />
          <select value={category} onChange={(e) => { setCategory(e.target.value); setOffset(0); }}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c || "All categories"}</option>
            ))}
          </select>
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {searchText ? `${filtered.length} of ${total}` : `${total}`} {total === 1 ? "memory" : "memories"}
        </span>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Category</th>
              <th>Importance</th>
              <th>Tags</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} onClick={() => setSelected(m)} className="clickable">
                <td className="key-cell">{m.key}</td>
                <td><span className={`badge cat-${m.category}`}>{m.category}</span></td>
                <td><span className={`badge imp-${m.importance}`}>{m.importance}</span></td>
                <td className="tags-cell">{m.tags.join(", ") || "—"}</td>
                <td className="date-cell">{new Date(m.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="empty-row">
                {searchText ? `No memories matching "${searchText}"` : "No memories found"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!searchText && total > PAGE_SIZE && (
        <div className="pagination">
          <button
            className="btn btn-secondary btn-sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </button>
          <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
