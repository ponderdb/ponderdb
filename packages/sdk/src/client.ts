import type {
  Memory,
  CreateMemoryInput,
  SearchQuery,
  SearchResult,
  ListMemoriesFilter,
  PaginatedResult,
} from "@ponderdb/core";

export interface PonderClientConfig {
  baseUrl: string;
  apiKey?: string;
}

export class PonderClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: PonderClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      this.headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
  }

  async remember(input: CreateMemoryInput): Promise<Memory> {
    const res = await this.fetch("/api/memories", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res;
  }

  async recall(key: string, projectId?: string): Promise<Memory | null> {
    const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    try {
      return await this.fetch(`/api/memories/${encodeURIComponent(key)}${params}`);
    } catch (err: any) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const res = await this.fetch("/api/memories/search", {
      method: "POST",
      body: JSON.stringify(query),
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
    return this.fetch(`/api/memories${qs ? `?${qs}` : ""}`);
  }

  async forget(key: string, projectId?: string): Promise<void> {
    const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    await this.fetch(`/api/memories/${encodeURIComponent(key)}${params}`, {
      method: "DELETE",
    });
  }

  async stats(): Promise<{ total: number; version: string }> {
    const health = await this.fetch("/health");
    // Count requires listing — use limit 0
    const list = await this.fetch("/api/memories?limit=0");
    return { total: list.total, version: health.version };
  }

  private async fetch(path: string, init?: RequestInit): Promise<any> {
    const res = await globalThis.fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers, ...init?.headers },
    });

    const body = await res.json().catch(() => null) as Record<string, any> | null;

    if (!res.ok) {
      const err: any = new Error(body?.error?.message ?? `HTTP ${res.status}`);
      err.statusCode = res.status;
      err.code = body?.error?.code;
      throw err;
    }

    return body;
  }
}
