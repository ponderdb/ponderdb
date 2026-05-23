import { useState, useEffect, useCallback } from "react";
import { listCategories, createCategory, updateCategory, deleteCategory, listMemories } from "../api";
import type { Memory, CategoryInfo } from "../api";

interface CategoriesProps {
  apiKey: string;
  projectId?: string;
  onSelectMemory?: (memory: Memory) => void;
}

export function Categories({ apiKey, projectId, onSelectMemory }: CategoriesProps) {
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [allMemories, setAllMemories] = useState<Memory[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryInfo | null>(null);

  const load = useCallback(() => {
    /* proceed — auth handled by cookie or apiKey */
    setError("");
    Promise.all([
      listCategories(apiKey, projectId || undefined),
      listMemories(apiKey, { limit: 500, sortBy: "updatedAt", sortOrder: "desc", projectId: projectId || undefined }),
    ])
      .then(([catResult, memResult]) => {
        setCategories(catResult.categories);
        setAllMemories(memResult.items);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey, projectId]);

  useEffect(() => { load(); }, [load]);

  /* auth guard removed — session handles auth */
  if (loading) return <div className="loading">Loading...</div>;

  // Build memory map by category
  const categoryMemories = new Map<string, Memory[]>();
  for (const m of allMemories) {
    const list = categoryMemories.get(m.category) || [];
    list.push(m);
    categoryMemories.set(m.category, list);
  }

  // Detail view for selected category
  if (selectedCat) {
    const cat = categories.find((c) => c.name === selectedCat);
    const memories = categoryMemories.get(selectedCat) || [];

    return (
      <div>
        <div className="page-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCat(null)}>Back</button>
            <h2>
              <span className="badge" style={{ fontSize: 14, padding: "4px 12px", background: hexToBg(cat?.color || "#64748b"), color: cat?.color || "#64748b" }}>
                {selectedCat}
              </span>
            </h2>
          </div>
          <p>{cat?.description || ""} &middot; {memories.length} memories</p>
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
              {memories.map((m) => (
                <tr key={m.id} className={onSelectMemory ? "clickable" : ""} onClick={() => onSelectMemory?.(m)}>
                  <td className="key-cell">{m.key}</td>
                  <td><span className={`badge imp-${m.importance}`}>{m.importance}</span></td>
                  <td className="tags-cell">{m.tags.join(", ") || "\u2014"}</td>
                  <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: 12 }}>
                    {m.content.slice(0, 80)}{m.content.length > 80 ? "..." : ""}
                  </td>
                  <td className="date-cell">{new Date(m.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {memories.length === 0 && (
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Categories</h2>
            <p>Browse and manage memory categories</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setEditingCat(null); }}>
            + New Category
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {(showCreate || editingCat) && (
        <CategoryForm
          apiKey={apiKey}
          projectId={projectId}
          category={editingCat}
          onSaved={() => { setShowCreate(false); setEditingCat(null); load(); }}
          onCancel={() => { setShowCreate(false); setEditingCat(null); }}
        />
      )}

      <div className="category-grid">
        {categories.map((cat) => {
          const count = categoryMemories.get(cat.name)?.length || 0;
          return (
            <div key={cat.id} className="category-card" style={{ cursor: "pointer" }}>
              <div className="category-card-header">
                <span
                  className="badge"
                  style={{ fontSize: 12, padding: "3px 10px", background: hexToBg(cat.color), color: cat.color }}
                >
                  {cat.name}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {!cat.isSystem && (
                    <span className="badge" style={{ fontSize: 10, padding: "1px 6px", background: cat.isAiGenerated ? "#fef3c7" : "#e9d5ff", color: cat.isAiGenerated ? "#92400e" : "#7c3aed" }}>
                      {cat.isAiGenerated ? "AI" : "custom"}
                    </span>
                  )}
                  <span className="category-count">{count}</span>
                </div>
              </div>
              <p className="category-desc" onClick={() => count > 0 && setSelectedCat(cat.name)}>
                {cat.description || "No description"}
              </p>
              <div className="category-bar" onClick={() => count > 0 && setSelectedCat(cat.name)}>
                <div style={{
                  width: `${allMemories.length > 0 ? (count / allMemories.length) * 100 : 0}%`,
                  backgroundColor: cat.color,
                  height: "4px",
                  borderRadius: "2px",
                  minWidth: count > 0 ? "4px" : "0",
                }} />
              </div>
              <div className="category-actions">
                <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setEditingCat(cat); setShowCreate(false); }}>
                  Edit
                </button>
                {!cat.isSystem && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Delete category "${cat.name}"? Memories will be reassigned to "custom".`)) return;
                      try {
                        await deleteCategory(apiKey, cat.id);
                        load();
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : "Delete failed");
                      }
                    }}
                  >
                    Delete
                  </button>
                )}
                {count > 0 && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setSelectedCat(cat.name)}>
                    View {count}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Category Create/Edit Form ──

interface CategoryFormProps {
  apiKey: string;
  projectId?: string;
  category: CategoryInfo | null;
  onSaved: () => void;
  onCancel: () => void;
}

function CategoryForm({ apiKey, projectId, category, onSaved, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(category?.name || "");
  const [description, setDescription] = useState(category?.description || "");
  const [color, setColor] = useState(category?.color || "#64748b");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isEdit = !!category;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await updateCategory(apiKey, category.id, {
          name: category.isSystem ? undefined : name.toLowerCase().replace(/\s+/g, "-"),
          description,
          color,
        });
      } else {
        await createCategory(apiKey, {
          name: name.toLowerCase().replace(/\s+/g, "-"),
          description,
          color,
          projectId: projectId || undefined,
        });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="category-form-card">
      <h3>{isEdit ? `Edit: ${category.name}` : "New Category"}</h3>
      <form onSubmit={handleSubmit} className="category-form">
        <div className="form-row">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. security, performance"
            disabled={isEdit && category.isSystem}
            autoFocus
          />
        </div>
        <div className="form-row">
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description..."
          />
        </div>
        <div className="form-row">
          <label>Color</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 40, height: 32, border: "none", cursor: "pointer" }} />
            <code style={{ fontSize: 12 }}>{color}</code>
            <span className="badge" style={{ background: hexToBg(color), color }}>preview</span>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Helpers ──

function hexToBg(hex: string): string {
  // Convert hex color to light background version (add transparency)
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.12)`;
}
