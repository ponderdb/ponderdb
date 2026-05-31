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
  const [deleting, setDeleting] = useState<ProjectInfo | null>(null);

  const load = useCallback(() => {
    /* proceed — auth handled by cookie or apiKey */
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

  const handleDeleteConfirmed = async (project: ProjectInfo) => {
    try {
      await deleteProject(apiKey, project.id);
      setError("");
      setDeleting(null);
      load();
      onProjectsChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(null);
    }
  };

  /* auth guard removed — session handles auth */
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

      <div className="warning-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>Set <code>PONDER_PROJECT_ID=your-slug</code> in your MCP config or pass <code>projectId</code> to the SDK. A project ID is required for all operations.</span>
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

      {deleting && (
        <DeleteConfirmDialog
          project={deleting}
          onConfirm={() => handleDeleteConfirmed(deleting)}
          onCancel={() => setDeleting(null)}
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
              <div className="project-card-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="category-card-color" style={{ background: isActive ? "var(--accent)" : "var(--text-muted)" }} />
                  <h3 className="project-card-name">{p.name}</h3>
                  {isActive && <span className="badge badge-active" style={{ fontSize: 9 }}>Active</span>}
                </div>
                <span className="project-card-count">{p.memoryCount || 0}</span>
              </div>
              <code className="project-card-slug">{p.slug}</code>
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
                  onClick={() => {
                    if (!deleteCheck.allowed) { setError(deleteCheck.reason!); return; }
                    setDeleting(p);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* usage warning moved to top */}
    </div>
  );
}

// ── Delete Confirmation Dialog ──

function DeleteConfirmDialog({
  project,
  onConfirm,
  onCancel,
}: {
  project: ProjectInfo;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const count = project.memoryCount || 0;
  const catCount = project.categoryCount || 0;
  const isMatch = confirmText === project.slug;

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-icon-danger">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h3 className="dialog-title">Delete Project</h3>
        <p className="dialog-text">
          This action is <strong>permanent</strong> and <strong>cannot be undone</strong>.
        </p>

        <div className="dialog-details">
          <div className="dialog-detail-row">
            <span>Project</span>
            <strong>{project.name}</strong>
          </div>
          <div className="dialog-detail-row">
            <span>Memories to delete</span>
            <strong className="dialog-danger-text">{count}</strong>
          </div>
          <div className="dialog-detail-row">
            <span>Categories to delete</span>
            <strong className="dialog-danger-text">{catCount}</strong>
          </div>
          <div className="dialog-detail-row">
            <span>Embeddings to delete</span>
            <strong className="dialog-danger-text">{count}</strong>
          </div>
        </div>

        <div className="dialog-confirm-input">
          <label>
            Type <code>{project.slug}</code> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={project.slug}
            autoFocus
          />
        </div>

        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            disabled={!isMatch || deleting}
            onClick={async () => {
              setDeleting(true);
              await onConfirm();
            }}
          >
            {deleting ? "Deleting..." : "Delete permanently"}
          </button>
        </div>
      </div>
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
