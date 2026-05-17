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
        <button className="back-btn" onClick={onBack}>Back</button>
        <button className="delete-btn" onClick={onDelete}>Delete</button>
      </div>

      <h2>{memory.key}</h2>

      <div className="detail-meta">
        <span className={`badge cat-${memory.category}`}>{memory.category}</span>
        <span className={`badge imp-${memory.importance}`}>{memory.importance}</span>
        {memory.tags.length > 0 && (
          <span className="tags">{memory.tags.map((t) => `#${t}`).join(" ")}</span>
        )}
      </div>

      <div className="detail-content">
        <pre>{memory.content}</pre>
      </div>

      <div className="detail-info">
        <div><strong>ID:</strong> {memory.id}</div>
        <div><strong>Project:</strong> {memory.projectId || "—"}</div>
        <div><strong>Created:</strong> {new Date(memory.createdAt).toLocaleString()}</div>
        <div><strong>Updated:</strong> {new Date(memory.updatedAt).toLocaleString()}</div>
        <div><strong>Accessed:</strong> {new Date(memory.accessedAt).toLocaleString()}</div>
        <div><strong>Access Count:</strong> {memory.accessCount}</div>
        <div><strong>Version:</strong> {memory.version}</div>
      </div>
    </div>
  );
}
