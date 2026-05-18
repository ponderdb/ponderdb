/** Unique identifier for a memory */
export type MemoryId = string;

/** Memory categories — system defaults + user-created */
export type MemoryCategory = string;

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

/** Category definition */
export interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  icon?: string;
  projectId?: string;
  isSystem: boolean;
  isAiGenerated: boolean;
  createdAt: Date;
}

/** Input for creating a category */
export interface CreateCategoryInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  projectId?: string;
}

/** Input for updating a category */
export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
}

/** System categories seeded on init */
export const SYSTEM_CATEGORIES: { name: string; description: string; color: string }[] = [
  { name: "architecture", description: "System design, structure, diagrams", color: "#3b82f6" },
  { name: "bug", description: "Bug reports, fixes, error patterns", color: "#ef4444" },
  { name: "pattern", description: "Code patterns, conventions, best practices", color: "#10b981" },
  { name: "config", description: "Configuration, environment variables, settings", color: "#f59e0b" },
  { name: "decision", description: "Technical decisions, tradeoffs, rationale", color: "#8b5cf6" },
  { name: "snippet", description: "Code snippets, templates, examples", color: "#ec4899" },
  { name: "debug", description: "Debugging notes, traces, inspections", color: "#eab308" },
  { name: "workflow", description: "Processes, pipelines, deploy steps", color: "#06b6d4" },
  { name: "dependency", description: "Package versions, library notes", color: "#f97316" },
  { name: "custom", description: "Uncategorized memories", color: "#64748b" },
];

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
