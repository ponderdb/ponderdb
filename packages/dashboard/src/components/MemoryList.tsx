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

export function MemoryList({ apiKey }: { apiKey: string }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Memory | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!apiKey) return;
    setError("");
    listMemories(apiKey, {
      category: category || undefined,
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
  }, [apiKey, category, offset]);

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

  if (!apiKey) return <div className="empty">Enter API key to view memories</div>;

  if (selected) {
    return (
      <MemoryDetail
        memory={selected}
        onBack={() => setSelected(null)}
        onDelete={() => handleDelete(selected.key)}
      />
    );
  }

  return (
    <div className="memory-list">
      <div className="list-header">
        <h2>Memories</h2>
        <select value={category} onChange={(e) => { setCategory(e.target.value); setOffset(0); }}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c || "All categories"}</option>
          ))}
        </select>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
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
            {memories.map((m) => (
              <tr key={m.id} onClick={() => setSelected(m)} className="clickable">
                <td className="key-cell">{m.key}</td>
                <td><span className={`badge cat-${m.category}`}>{m.category}</span></td>
                <td><span className={`badge imp-${m.importance}`}>{m.importance}</span></td>
                <td className="tags-cell">{m.tags.join(", ")}</td>
                <td className="date-cell">{new Date(m.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {memories.length === 0 && (
              <tr><td colSpan={5} className="empty-row">No memories found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </button>
        <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
        <button disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
          Next
        </button>
      </div>
    </div>
  );
}
