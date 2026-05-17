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
    if (!confirm(`Revoke API key "${name}"?`)) return;
    try {
      await revokeApiKey(apiKey, id);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    }
  };

  if (!apiKey) return <div className="empty">Enter API key to manage keys</div>;

  return (
    <div className="api-keys">
      <h2>API Keys</h2>

      <form onSubmit={handleCreate} className="create-key-form">
        <input
          type="text"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name..."
        />
        <button type="submit">Create Key</button>
      </form>

      {newKeyValue && (
        <div className="new-key-banner">
          <strong>New key created (copy now — shown once):</strong>
          <code>{newKeyValue}</code>
          <button onClick={() => { navigator.clipboard.writeText(newKeyValue); }}>
            Copy
          </button>
          <button onClick={() => setNewKeyValue("")}>Dismiss</button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Prefix</th>
            <th>Created</th>
            <th>Last Used</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id}>
              <td>{k.name}</td>
              <td><code>{k.prefix}...</code></td>
              <td>{new Date(k.createdAt).toLocaleDateString()}</td>
              <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}</td>
              <td>
                <button className="delete-btn" onClick={() => handleRevoke(k.id, k.name)}>
                  Revoke
                </button>
              </td>
            </tr>
          ))}
          {keys.length === 0 && (
            <tr><td colSpan={5} className="empty-row">No API keys</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
