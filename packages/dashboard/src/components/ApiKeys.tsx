import { useState, useEffect, useCallback } from "react";
import { listApiKeys, createApiKey, revokeApiKey } from "../api";
import type { ApiKeyInfo } from "../api";

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      className={`btn btn-secondary btn-sm copy-btn ${copied ? "copy-btn-copied" : ""}`}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}

interface ApiKeysProps {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}

export function ApiKeys({ apiKey, onApiKeyChange }: ApiKeysProps) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [search, setSearch] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createKeyName, setCreateKeyName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    listApiKeys(apiKey)
      .then((r) => setKeys(r.keys))
      .catch((e) => setError(e.message));
  }, [apiKey]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!createKeyName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const result = await createApiKey(apiKey, createKeyName.trim());
      setNewKeyValue(result.key);
      setCreateKeyName("");
      setShowCreateModal(false);
      setCreating(false);
      onApiKeyChange(result.key);
      listApiKeys(result.key)
        .then((r) => setKeys(r.keys))
        .catch(() => { /* ignore */ });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Create failed");
      setCreating(false);
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

  const filtered = search
    ? keys.filter((k) => k.name.toLowerCase().includes(search.toLowerCase()) || k.prefix.includes(search))
    : keys;

  return (
    <div>
      <div className="page-header">
        <h2>API Keys</h2>
        <p>Create and manage API keys for MCP, SDK, and CLI integrations</p>
      </div>

      <div className="apikeys-toolbar">
        <input
          type="text"
          className="filter-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search keys..."
        />
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create API Key
        </button>
      </div>

      {newKeyValue && (
        <div className="new-key-banner">
          <strong>New key created — copy now, shown only once:</strong>
          <code>{newKeyValue}</code>
          <CopyButton text={newKeyValue} label="Copy" />
          <button className="btn btn-secondary btn-sm" onClick={() => setNewKeyValue("")}>
            Dismiss
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Prefix</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => (
              <tr key={k.id}>
                <td>
                  <span className="badge badge-active">Active</span>
                </td>
                <td style={{ fontWeight: 500 }}>{k.name}</td>
                <td>
                  <div className="prefix-cell">
                    <code>{k.prefix}...</code>
                    <CopyButton text={`${k.prefix}...`} />
                  </div>
                </td>
                <td className="date-cell">{new Date(k.createdAt).toLocaleDateString()}</td>
                <td className="date-cell">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}</td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => handleRevoke(k.id, k.name)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="empty-row">{search ? "No keys matching search" : "No API keys yet"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="dialog-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="dialog-title">Create API Key</h3>
            <p className="dialog-text">
              Give your key a name to identify where it's used (e.g. "Claude Code", "Cursor", "CI/CD").
            </p>
            <div className="dialog-confirm-input">
              <label>Key Name</label>
              <input
                type="text"
                value={createKeyName}
                onChange={(e) => setCreateKeyName(e.target.value)}
                placeholder="e.g. claude-code"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={creating || !createKeyName.trim()}
              >
                {creating ? "Creating..." : "Create Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
