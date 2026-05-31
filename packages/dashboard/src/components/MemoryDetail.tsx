import type { Memory } from "../api";

interface Props {
  memory: Memory;
  onBack: () => void;
  onDelete: () => void;
}

export function MemoryDetail({ memory, onBack, onDelete }: Props) {
  return (
    <div className="memory-detail">
      <div className="detail-header">
        <button className="btn btn-secondary btn-sm" onClick={onBack}>
          Back to list
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>
          Delete
        </button>
      </div>

      <h2>{memory.key}</h2>

      <div className="detail-meta">
        <span className={`badge cat-${memory.category}`}>{memory.category}</span>
        <span className={`badge imp-${memory.importance}`}>{memory.importance}</span>
        {memory.isGlobal && <span className="badge badge-global">global</span>}
        {memory.tags.length > 0 && (
          <span className="tags">{memory.tags.map((t) => `#${t}`).join("  ")}</span>
        )}
      </div>

      <div className="detail-content">
        <pre>{memory.content}</pre>
      </div>

      <div className="detail-info">
        <div><strong>ID:</strong> {memory.id}</div>
        <div><strong>Project:</strong> {memory.projectId || "—"}</div>
        <div><strong>Global:</strong> {memory.isGlobal ? "Yes" : "No"}</div>
        <div><strong>Created:</strong> {new Date(memory.createdAt).toLocaleString()}</div>
        <div><strong>Updated:</strong> {new Date(memory.updatedAt).toLocaleString()}</div>
        <div><strong>Last Accessed:</strong> {new Date(memory.accessedAt).toLocaleString()}</div>
        <div><strong>Access Count:</strong> {memory.accessCount}</div>
        <div><strong>Tokens:</strong> {(memory.tokenCount || 0).toLocaleString()}</div>
        <div><strong>Version:</strong> {memory.version}</div>
      </div>
    </div>
  );
}
