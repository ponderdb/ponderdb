import type {
  Memory,
  CreateMemoryInput,
  SearchQuery,
  SearchResult,
  ListMemoriesFilter,
  PaginatedResult,
} from "@ponderdb/core";

export class PonderApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = "PonderApiError";
  }
}

export interface PonderClientConfig {
  baseUrl: string;
  apiKey?: string;
  projectId?: string;
}

export class PonderClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private defaultProjectId?: string;

  constructor(config: PonderClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.defaultProjectId = config.projectId;
    this.headers = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      this.headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
  }

  async remember(input: CreateMemoryInput): Promise<Memory> {
    const body = { ...input, projectId: input.projectId ?? this.defaultProjectId };
    return this.fetch<Memory>("/api/memories", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async recall(key: string, projectId?: string): Promise<Memory | null> {
    const pid = projectId ?? this.defaultProjectId;
    const params = pid ? `?projectId=${encodeURIComponent(pid)}` : "";
    try {
      return await this.fetch<Memory>(`/api/memories/${encodeURIComponent(key)}${params}`);
    } catch (err: unknown) {
      if (err instanceof PonderApiError && err.statusCode === 404) return null;
      throw err;
    }
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const body = { ...query, projectId: query.projectId ?? this.defaultProjectId };
    const res = await this.fetch<{ results: SearchResult[] }>("/api/memories/search", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return res.results;
  }

  async list(filter?: ListMemoriesFilter): Promise<PaginatedResult<Memory>> {
    const params = new URLSearchParams();
    if (filter?.category) params.set("category", filter.category);
    if (filter?.projectId) params.set("projectId", filter.projectId);
    if (filter?.limit) params.set("limit", String(filter.limit));
    if (filter?.offset) params.set("offset", String(filter.offset));
    if (filter?.sortBy) params.set("sortBy", filter.sortBy);
    if (filter?.sortOrder) params.set("sortOrder", filter.sortOrder);
    const qs = params.toString();
    return this.fetch<PaginatedResult<Memory>>(`/api/memories${qs ? `?${qs}` : ""}`);
  }

  async forget(key: string, projectId?: string): Promise<void> {
    const pid = projectId ?? this.defaultProjectId;
    const params = pid ? `?projectId=${encodeURIComponent(pid)}` : "";
    await this.fetch<{ deleted: boolean }>(`/api/memories/${encodeURIComponent(key)}${params}`, {
      method: "DELETE",
    });
  }

  async syncPull(since: string | null = null): Promise<{
    memories: Memory[];
    projects: unknown[];
    categories: unknown[];
    deletedMemoryIds: string[];
    deletedProjectIds: string[];
    deletedCategoryIds: string[];
    syncedAt: string;
  }> {
    return this.fetch("/api/sync/pull", {
      method: "POST",
      body: JSON.stringify({ since }),
    });
  }

  async syncPush(changes: {
    memories: Memory[];
    projects: unknown[];
    categories: unknown[];
    deletedMemoryIds: string[];
    deletedProjectIds: string[];
    deletedCategoryIds: string[];
  }): Promise<{ ok: boolean; syncedAt: string }> {
    return this.fetch("/api/sync/push", {
      method: "POST",
      body: JSON.stringify(changes),
    });
  }

  async syncStatus(): Promise<{
    totalMemories: number;
    totalProjects: number;
    totalCategories: number;
  }> {
    return this.fetch("/api/sync/status");
  }

  async importFile(content: string, source: string, projectId?: string): Promise<{
    imported: number;
    skipped: number;
    memories: { key: string; category: string }[];
    skippedKeys: string[];
  }> {
    return this.fetch("/api/import", {
      method: "POST",
      body: JSON.stringify({ content, source, projectId: projectId ?? this.defaultProjectId }),
    });
  }

  async importPreview(content: string, source: string): Promise<{
    count: number;
    memories: { key: string; category: string; contentLength: number }[];
  }> {
    return this.fetch("/api/import/preview", {
      method: "POST",
      body: JSON.stringify({ content, source }),
    });
  }

  async stats(): Promise<{ total: number; version: string }> {
    const health = await this.fetch<{ version: string }>("/health");
    const list = await this.fetch<PaginatedResult<Memory>>("/api/memories?limit=0");
    return { total: list.total, version: health.version };
  }

  async update(key: string, updates: Record<string, unknown>, projectId?: string): Promise<Memory> {
    const pid = projectId ?? this.defaultProjectId;
    const params = pid ? `?projectId=${encodeURIComponent(pid)}` : "";
    return this.fetch<Memory>(`/api/memories/${encodeURIComponent(key)}${params}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  }

  async history(key: string, projectId?: string): Promise<{ history: unknown[]; current: Memory }> {
    return this.fetch("/api/memories/history", {
      method: "POST",
      body: JSON.stringify({ key, projectId: projectId ?? this.defaultProjectId }),
    });
  }

  async restore(key: string, version: number, projectId?: string): Promise<Memory> {
    return this.fetch<Memory>("/api/memories/restore", {
      method: "POST",
      body: JSON.stringify({ key, version, projectId: projectId ?? this.defaultProjectId }),
    });
  }

  async listProjects(): Promise<{ projects: unknown[] }> {
    return this.fetch("/api/projects");
  }

  async createProject(name: string, opts?: { slug?: string; description?: string }): Promise<unknown> {
    return this.fetch("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name, ...opts }),
    });
  }

  async deleteProject(id: string): Promise<void> {
    await this.fetch(`/api/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async listCategories(projectId?: string): Promise<{ categories: unknown[] }> {
    const pid = projectId ?? this.defaultProjectId;
    const params = pid ? `?projectId=${encodeURIComponent(pid)}` : "";
    return this.fetch(`/api/categories${params}`);
  }

  async listApiKeys(): Promise<{ keys: unknown[] }> {
    return this.fetch("/api/auth/keys");
  }

  async createApiKey(name: string): Promise<unknown> {
    return this.fetch("/api/auth/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async deleteApiKey(id: string): Promise<void> {
    await this.fetch(`/api/auth/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async health(): Promise<{ status: string; version: string }> {
    return this.fetch("/health");
  }

  private async fetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const res = await globalThis.fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...init?.headers },
    });

    const body = await res.json().catch(() => null) as Record<string, unknown> | null;

    if (!res.ok) {
      const error = body?.error as Record<string, unknown> | undefined;
      const err = new PonderApiError(
        (error?.message as string) ?? `HTTP ${res.status}`,
        res.status,
        error?.code as string | undefined,
      );
      throw err;
    }

    return body as T;
  }
}
