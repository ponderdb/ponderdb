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
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    /* proceed — auth handled by cookie or apiKey */
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
      // Auto-activate new key immediately
      onApiKeyChange(result.key);
      // Reload key list using the new key (old key still valid too)
      listApiKeys(result.key)
        .then((r) => setKeys(r.keys))
        .catch(() => {});
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

  const isActive = (prefix: string) => apiKey.startsWith(prefix);

  /* auth guard removed — session handles auth */

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
          <CopyButton text={newKeyValue} label="Copy" />
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
              <th>Status</th>
              <th>Name</th>
              <th>Prefix</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className={isActive(k.prefix) ? "api-key-active-row" : ""}>
                <td>
                  {isActive(k.prefix) ? (
                    <span className="badge badge-active">Active</span>
                  ) : (
                    <span className="badge badge-inactive">—</span>
                  )}
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
                  <div className="api-key-actions">
                    {!isActive(k.prefix) && newKeyValue && newKeyValue.startsWith(k.prefix) ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => { onApiKeyChange(newKeyValue); }}
                      >
                        Use
                      </button>
                    ) : !isActive(k.prefix) ? (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const input = prompt(`Enter full API key for "${k.name}" (starts with ${k.prefix}...):`);
                          if (input?.startsWith(k.prefix)) onApiKeyChange(input);
                          else if (input) alert("Key doesn't match this prefix.");
                        }}
                      >
                        Use
                      </button>
                    ) : null}
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRevoke(k.id, k.name)}
                    >
                      Revoke
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr><td colSpan={6} className="empty-row">No API keys found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
