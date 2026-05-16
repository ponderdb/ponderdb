/** Unique identifier for a memory */
export type MemoryId = string;

/** Memory categories for developer workflow */
export type MemoryCategory =
  | "architecture"
  | "bug"
  | "pattern"
  | "config"
  | "decision"
  | "snippet"
  | "debug"
  | "workflow"
  | "dependency"
  | "custom";

/** Memory importance level */
export type MemoryImportance = "low" | "medium" | "high" | "critical";

/** Core memory object */
export interface Memory {
  id: MemoryId;
  key: string;
  content: string;
  category: MemoryCategory;
  importance: MemoryImportance;
  tags: string[];
  metadata: Record<string, unknown>;
  embedding?: number[];
  projectId?: string;
  createdAt: Date;
  updatedAt: Date;
  accessedAt: Date;
  accessCount: number;
  version: number;
}

/** Input for creating a memory */
export interface CreateMemoryInput {
  key: string;
  content: string;
  category?: MemoryCategory;
  importance?: MemoryImportance;
  tags?: string[];
  metadata?: Record<string, unknown>;
  projectId?: string;
}

/** Input for updating a memory */
export interface UpdateMemoryInput {
  content?: string;
  category?: MemoryCategory;
  importance?: MemoryImportance;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Search query */
export interface SearchQuery {
  query: string;
  category?: MemoryCategory;
  tags?: string[];
  projectId?: string;
  limit?: number;
  offset?: number;
  minScore?: number;
}

/** Search result */
export interface SearchResult {
  memory: Memory;
  score: number;
  matchType: "semantic" | "keyword" | "hybrid";
}

/** Pagination */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/** List filters */
export interface ListMemoriesFilter {
  category?: MemoryCategory;
  tags?: string[];
  projectId?: string;
  importance?: MemoryImportance;
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "updatedAt" | "accessedAt" | "accessCount" | "importance";
  sortOrder?: "asc" | "desc";
}

/** API key */
export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  prefix: string;
  userId: string;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

/** Server config */
export interface PonderConfig {
  port: number;
  host: string;
  dataDir: string;
  embeddingProvider: "openai" | "local";
  embeddingModel: string;
  openaiApiKey?: string;
  apiKeyRequired: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

/** Default config */
export const DEFAULT_CONFIG: PonderConfig = {
  port: 7437,
  host: "127.0.0.1",
  dataDir: "~/.ponderdb",
  embeddingProvider: "local",
  embeddingModel: "bge-base-en-v1.5",
  apiKeyRequired: true,
  logLevel: "info",
};
