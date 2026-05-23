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
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
  accessedAt: string;
  accessCount: number;
  tokenCount: number;
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
    projectId?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: string;
  },
): Promise<PaginatedResult> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.projectId) qs.set("projectId", params.projectId);
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
  projectId?: string,
): Promise<{ results: SearchResult[] }> {
  const res = await fetch(`${BASE}/api/memories/search`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ query, category, limit, projectId }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getMemory(
  apiKey: string,
  key: string,
  projectId?: string,
): Promise<Memory | null> {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  const query = qs.toString();
  const res = await fetch(`${BASE}/api/memories/${encodeURIComponent(key)}${query ? `?${query}` : ""}`, {
    headers: headers(apiKey),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteMemory(apiKey: string, key: string, projectId?: string) {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  const query = qs.toString();
  const res = await fetch(`${BASE}/api/memories/${encodeURIComponent(key)}${query ? `?${query}` : ""}`, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function listApiKeys(
  apiKey?: string,
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

// ── Categories ──

interface CategoryInfo {
  id: string;
  name: string;
  description: string;
  color: string;
  icon?: string;
  projectId?: string;
  isSystem: boolean;
  isAiGenerated: boolean;
  createdAt: string;
  count: number;
}

export async function listCategories(
  apiKey: string,
  projectId?: string,
): Promise<{ categories: CategoryInfo[] }> {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  const res = await fetch(`${BASE}/api/categories?${qs}`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createCategory(
  apiKey: string,
  input: { name: string; description?: string; color?: string; projectId?: string },
): Promise<CategoryInfo> {
  const res = await fetch(`${BASE}/api/categories`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateCategory(
  apiKey: string,
  id: string,
  input: { name?: string; description?: string; color?: string },
): Promise<CategoryInfo> {
  const res = await fetch(`${BASE}/api/categories/${id}`, {
    method: "PUT",
    headers: headers(apiKey),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteCategory(apiKey: string, id: string) {
  const res = await fetch(`${BASE}/api/categories/${id}`, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function suggestCategory(
  apiKey: string,
  content: string,
  key?: string,
  projectId?: string,
): Promise<{ category: string; confidence: number; source: string }> {
  const res = await fetch(`${BASE}/api/categories/suggest`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ content, key, projectId }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Projects ──

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  memoryCount?: number;
  categoryCount?: number;
}

export async function listProjects(
  apiKey?: string,
): Promise<{ projects: ProjectInfo[] }> {
  const res = await fetch(`${BASE}/api/projects`, {
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function createProject(
  apiKey: string,
  input: { name: string; slug?: string; description?: string },
): Promise<ProjectInfo> {
  const res = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateProject(
  apiKey: string,
  id: string,
  input: { name?: string; description?: string },
): Promise<ProjectInfo> {
  const res = await fetch(`${BASE}/api/projects/${id}`, {
    method: "PUT",
    headers: headers(apiKey),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteProject(apiKey: string, id: string) {
  const res = await fetch(`${BASE}/api/projects/${id}`, {
    method: "DELETE",
    headers: headers(apiKey),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export type { Memory, PaginatedResult, SearchResult, ApiKeyInfo, CategoryInfo, ProjectInfo };
