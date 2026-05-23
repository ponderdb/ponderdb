import { useState, useEffect, useCallback, useRef } from "react";
import { listMemories, deleteMemory } from "../api";
import type { Memory } from "../api";
import { MemoryDetail } from "./MemoryDetail";

function CustomSelect({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="custom-select" ref={ref}>
      <button className={`custom-select-btn ${open ? "custom-select-open" : ""}`} onClick={() => setOpen(!open)}>
        <span>{selected?.label || "Select..."}</span>
        <svg className={open ? "chevron-up" : ""} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="custom-select-menu">
          {options.map((o) => (
            <button
              key={o.value}
              className={`custom-select-item ${o.value === value ? "custom-select-item-active" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
              {o.value === value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
      await deleteMemory(apiKey, key, projectId);
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
          <CustomSelect
            value={category}
            onChange={(v) => { setCategory(v); setOffset(0); }}
            options={CATEGORIES.map((c) => ({ value: c, label: c || "All categories" }))}
          />
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
              <th>Scope</th>
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
                <td>{m.isGlobal ? <span className="badge badge-global">global</span> : m.projectId || "—"}</td>
                <td className="tags-cell">{m.tags.join(", ") || "—"}</td>
                <td className="date-cell">{new Date(m.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="empty-row">
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
