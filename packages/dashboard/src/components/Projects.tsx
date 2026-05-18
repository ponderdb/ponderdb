import { useState, useEffect, useCallback } from "react";
import { listProjects, createProject, updateProject, deleteProject } from "../api";
import type { ProjectInfo } from "../api";

interface ProjectsProps {
  apiKey: string;
  currentProjectId: string;
  onProjectsChanged: () => void;
}

export function Projects({ apiKey, currentProjectId, onProjectsChanged }: ProjectsProps) {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<ProjectInfo | null>(null);

  const load = useCallback(() => {
    if (!apiKey) { setLoading(false); return; }
    setError("");
    listProjects(apiKey)
      .then((r) => setProjects(r.projects))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [apiKey]);

  useEffect(() => { load(); }, [load]);

  const canDelete = (project: ProjectInfo): { allowed: boolean; reason?: string } => {
    if (projects.length <= 1) {
      return { allowed: false, reason: "Cannot delete the only project. At least one project is required." };
    }
    if (project.slug === currentProjectId) {
      return { allowed: false, reason: "Cannot delete the currently active project. Switch to a different project first." };
    }
    return { allowed: true };
  };

  const handleDelete = async (project: ProjectInfo) => {
    const check = canDelete(project);
    if (!check.allowed) {
      setError(check.reason!);
      return;
    }

    const count = project.memoryCount || 0;
    const catCount = project.categoryCount || 0;

    const warning = [
      `⚠️ DELETE PROJECT: "${project.name}"`,
      "",
      "This action is PERMANENT and CANNOT be undone.",
      "",
      "The following will be permanently deleted:",
      `  • ${count} ${count === 1 ? "memory" : "memories"} and all their embeddings`,
      `  • ${catCount} custom ${catCount === 1 ? "category" : "categories"}`,
      `  • All project-scoped data`,
      "",
      `Type "${project.slug}" to confirm deletion:`,
    ].join("\n");

    const confirmation = prompt(warning);
    if (confirmation !== project.slug) {
      if (confirmation !== null) {
        setError(`Deletion cancelled. You typed "${confirmation}" but the project slug is "${project.slug}".`);
      }
      return;
    }

    try {
      await deleteProject(apiKey, project.id);
      setError("");
      load();
      onProjectsChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (!apiKey) return <div className="empty"><p>Enter your API key in the sidebar</p></div>;
  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2>Projects</h2>
            <p>Organize memories into separate projects. A project ID is required for all MCP, SDK, and CLI operations.</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setEditing(null); }}>
            + New Project
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {(showCreate || editing) && (
        <ProjectForm
          apiKey={apiKey}
          project={editing}
          onSaved={() => { setShowCreate(false); setEditing(null); load(); onProjectsChanged(); }}
          onCancel={() => { setShowCreate(false); setEditing(null); }}
        />
      )}

      {projects.length === 0 && !showCreate && (
        <div className="empty">
          <p>No projects yet. Create your first project to get started with PonderDB.</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setShowCreate(true)}>
            Create First Project
          </button>
        </div>
      )}

      <div className="project-grid">
        {projects.map((p) => {
          const deleteCheck = canDelete(p);
          const isActive = p.slug === currentProjectId;
          return (
            <div key={p.id} className={`project-card ${isActive ? "project-card-active" : ""}`}>
              {isActive && <div className="project-active-badge">Active</div>}
              <div className="project-card-header">
                <div>
                  <h3 className="project-card-name">{p.name}</h3>
                  <code className="project-card-slug">{p.slug}</code>
                </div>
                <span className="project-card-count">{p.memoryCount || 0}</span>
              </div>
              {p.description && <p className="project-card-desc">{p.description}</p>}
              <div className="project-card-meta">
                <span>{p.categoryCount || 0} custom categories</span>
                <span>Created {new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="project-card-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(p); setShowCreate(false); }}>
                  Edit
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={!deleteCheck.allowed}
                  title={deleteCheck.reason || "Delete project"}
                  onClick={() => handleDelete(p)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {projects.length > 0 && (
        <div style={{ marginTop: 24, padding: 16, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 13, color: "var(--text-secondary)" }}>
          <strong>Usage:</strong> Set <code>PONDER_PROJECT_ID=your-slug</code> in your MCP config or pass <code>projectId</code> to the SDK. A project ID is required for all operations.
        </div>
      )}
    </div>
  );
}

// ── Project Form ──

interface ProjectFormProps {
  apiKey: string;
  project: ProjectInfo | null;
  onSaved: () => void;
  onCancel: () => void;
}

function ProjectForm({ apiKey, project, onSaved, onCancel }: ProjectFormProps) {
  const [name, setName] = useState(project?.name || "");
  const [description, setDescription] = useState(project?.description || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isEdit = !!project;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        await updateProject(apiKey, project.id, { name, description });
      } else {
        await createProject(apiKey, { name, description });
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <div className="category-form-card">
      <h3>{isEdit ? `Edit: ${project.name}` : "New Project"}</h3>
      <form onSubmit={handleSubmit} className="category-form">
        <div className="form-row">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Backend API"
            autoFocus
          />
          {!isEdit && name && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Slug (Project ID): <code>{slug}</code> — use this in MCP config and SDK
            </span>
          )}
        </div>
        <div className="form-row">
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about?"
          />
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
