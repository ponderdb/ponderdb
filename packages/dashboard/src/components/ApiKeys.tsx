import { useState, useEffect, useCallback } from "react";
import { listApiKeys, createApiKey, revokeApiKey } from "../api";
import type { ApiKeyInfo } from "../api";

export function ApiKeys({ apiKey }: { apiKey: string }) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!apiKey) return;
    listApiKeys(apiKey)
      .then((r) => setKeys(r.keys))
      .catch((e) => setError(e.message));
  }, [apiKey]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setError("");
    try {
      const result = await createApiKey(apiKey, newKeyName.trim());
      setNewKeyValue(result.key);
      setNewKeyName("");
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Revoke API key "${name}"? This cannot be undone.`)) return;
    try {
      await revokeApiKey(apiKey, id);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  };

  if (!apiKey) {
    return (
      <div className="empty">
        <p>Enter your API key in the sidebar to manage keys</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>API Keys</h2>
        <p>Create and manage API keys for REST API access</p>
      </div>

      <form onSubmit={handleCreate} className="create-key-form">
        <input
          type="text"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name (e.g. my-script)"
        />
        <button type="submit" className="btn btn-primary">Create Key</button>
      </form>

      {newKeyValue && (
        <div className="new-key-banner">
          <strong>New key created — copy now, shown only once:</strong>
          <code>{newKeyValue}</code>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { navigator.clipboard.writeText(newKeyValue); }}
          >
            Copy
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setNewKeyValue("")}
          >
            Dismiss
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Created</th>
              <th>Last Used</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td style={{ fontWeight: 500 }}>{k.name}</td>
                <td><code>{k.prefix}...</code></td>
                <td className="date-cell">{new Date(k.createdAt).toLocaleDateString()}</td>
                <td className="date-cell">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}</td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => handleRevoke(k.id, k.name)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr><td colSpan={5} className="empty-row">No API keys found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
