import type {
  Memory,
  MemoryId,
  CreateMemoryInput,
  UpdateMemoryInput,
  SearchQuery,
  SearchResult,
  ListMemoriesFilter,
  PaginatedResult,
  ApiKey,
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  User,
  CreateUserInput,
  UpdateUserInput,
} from "./types.js";

/** Storage backend interface — implemented by sqlite-store, pg-store, etc. */
export interface StorageAdapter {
  /** Initialize storage (create tables, indexes, etc.) */
  init(): Promise<void>;

  /** Close storage connection */
  close(): Promise<void>;

  /** Create a new memory */
  create(input: CreateMemoryInput & { embedding?: number[] }): Promise<Memory>;

  /** Get memory by ID */
  getById(id: MemoryId): Promise<Memory | null>;

  /** Get memory by key */
  getByKey(key: string, projectId?: string): Promise<Memory | null>;

  /** Update a memory */
  update(id: MemoryId, input: UpdateMemoryInput & { embedding?: number[] }): Promise<Memory>;

  /** Delete a memory */
  delete(id: MemoryId): Promise<boolean>;

  /** List memories with filters */
  list(filter: ListMemoriesFilter): Promise<PaginatedResult<Memory>>;

  /** Search by vector similarity */
  vectorSearch(embedding: number[], limit: number, filter?: { category?: string; projectId?: string }): Promise<SearchResult[]>;

  /** Full-text keyword search */
  keywordSearch(query: string, limit: number, filter?: { category?: string; projectId?: string }): Promise<SearchResult[]>;

  /** Get total memory count */
  count(filter?: { projectId?: string }): Promise<number>;

  /** Record an access (bump accessedAt + accessCount) */
  recordAccess(id: MemoryId): Promise<void>;

  // ── Users ──

  /** Create a new user */
  createUser(input: CreateUserInput): Promise<User>;

  /** Get user by ID */
  getUserById(id: string): Promise<User | null>;

  /** Get user by email */
  getUserByEmail(email: string): Promise<User | null>;

  /** Update a user */
  updateUser(id: string, input: UpdateUserInput): Promise<User>;

  /** List all users */
  listUsers(): Promise<User[]>;

  // ── API Keys ──

  /** Create an API key (store hash, return full key only once) */
  createApiKey(name: string, userId: string): Promise<{ apiKey: ApiKey; rawKey: string }>;

  /** Validate an API key by its raw value, returns key record if valid */
  validateApiKey(rawKey: string): Promise<ApiKey | null>;

  /** List API keys for a user */
  listApiKeys(userId: string): Promise<ApiKey[]>;

  /** Delete an API key */
  deleteApiKey(id: string): Promise<boolean>;

  /** Count API keys for a user */
  countApiKeys(userId: string): Promise<number>;

  // ── Categories ──

  /** List categories (optionally filtered by project) */
  listCategories(projectId?: string): Promise<Category[]>;

  /** Get category by name (and optional project) */
  getCategoryByName(name: string, projectId?: string): Promise<Category | null>;

  /** Create a new category */
  createCategory(input: CreateCategoryInput & { isSystem?: boolean; isAiGenerated?: boolean }): Promise<Category>;

  /** Update a category */
  updateCategory(id: string, input: UpdateCategoryInput): Promise<Category>;

  /** Delete a category */
  deleteCategory(id: string): Promise<boolean>;

  // ── Projects ──

  /** List all projects for a user */
  listProjects(userId: string): Promise<Project[]>;

  /** Get project by slug for a user */
  getProjectBySlug(slug: string, userId: string): Promise<Project | null>;

  /** Create a new project */
  createProject(input: CreateProjectInput & { userId: string }): Promise<Project>;

  /** Update a project */
  updateProject(id: string, input: UpdateProjectInput): Promise<Project>;

  /** Delete a project and all its memories */
  deleteProject(id: string): Promise<boolean>;
}

/** Embedding provider interface */
export interface EmbeddingProvider {
  /** Generate embedding for text */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Embedding dimension count */
  dimensions(): number;
}

/** Search engine combining vector + keyword search */
export interface SearchEngine {
  /** Hybrid search: combines semantic + keyword results */
  search(query: SearchQuery): Promise<SearchResult[]>;
}
