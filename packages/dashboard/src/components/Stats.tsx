import { useState, useEffect } from "react";
import { listMemories } from "../api";

export function Stats({ apiKey }: { apiKey: string }) {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    listMemories(apiKey, { limit: 0 })
      .then((r) => setTotal(r.total))
      .catch(() => setTotal(null));
  }, [apiKey]);

  return (
    <div className="stats">
      <div className="stat-item">
        <span className="stat-value">{total ?? "—"}</span>
        <span className="stat-label">memories</span>
      </div>
    </div>
  );
}
