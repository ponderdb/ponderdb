const BASE = "";

interface Memory {
  id: string;
  key: string;
  content: string;
  category: string;
  importance: string;
  tags: string[];
  metadata: Record<string, unknown>;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  accessedAt: string;
  accessCount: number;
  version: number;
}

interface PaginatedResult {
  items: Memory[];
  total: number;
  limit: number;
  offset: number;
}

interface SearchResult {
  memory: Memory;
  score: number;
  matchType: string;
}

interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

function headers(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  return h;
}

export async function fetchHealth() {
  const res = await fetch(`${BASE}/health`);
  return res.json();
}

export async function listMemories(
  apiKey: string,
  params?: {
    category?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: string;
  },
): Promise<PaginatedResult> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const res = await fetch(`${BASE}/api/memories?${qs}`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function searchMemories(
  apiKey: string,
  query: string,
  category?: string,
  limit = 10,
): Promise<{ results: SearchResult[] }> {
  const res = await fetch(`${BASE}/api/memories/search`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ query, category, limit }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getMemory(
  apiKey: string,
  key: string,
): Promise<Memory | null> {
  const res = await fetch(`${BASE}/api/memories/${encodeURIComponent(key)}`, {
    headers: headers(apiKey),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteMemory(apiKey: string, key: string) {
  const res = await fetch(`${BASE}/api/memories/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function listApiKeys(
  apiKey: string,
): Promise<{ keys: ApiKeyInfo[] }> {
  const res = await fetch(`${BASE}/api/auth/keys`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createApiKey(
  apiKey: string,
  name: string,
): Promise<{ key: string; id: string; prefix: string }> {
  const res = await fetch(`${BASE}/api/auth/keys`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function revokeApiKey(apiKey: string, id: string) {
  const res = await fetch(`${BASE}/api/auth/keys/${id}`, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export type { Memory, PaginatedResult, SearchResult, ApiKeyInfo };
