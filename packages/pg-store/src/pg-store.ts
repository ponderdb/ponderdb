import pg from "pg";
import pgvector from "pgvector/pg";
import type {
  StorageAdapter,
  Memory,
  MemoryId,
  CreateMemoryInput,
  UpdateMemoryInput,
  ListMemoriesFilter,
  PaginatedResult,
  SearchResult,
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
  MemoryVersion,
  AuditLogEntry,
  AuditAction,
  MarketplaceListing,
  CreateMarketplaceListingInput,
  AiSuggestion,
  Team,
  TeamMember,
  TeamRole,
  CreateTeamInput,
} from "@ponderdb/core";
import {
  generateId,
  generateApiKey,
  hashApiKey,
  slugify,
  estimateTokens,
  MemoryNotFoundError,
  DuplicateKeyError,
  SYSTEM_CATEGORIES,
} from "@ponderdb/core";

export interface PgStoreConfig {
  connectionString: string;
  dimensions?: number;
}

export class PgStore implements StorageAdapter {
  private pool: pg.Pool;
  private dimensions: number;

  constructor(config: PgStoreConfig) {
    this.pool = new pg.Pool({ connectionString: config.connectionString });
    this.dimensions = config.dimensions ?? 384;
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await pgvector.registerTypes(client);

      await client.query("CREATE EXTENSION IF NOT EXISTS vector");

      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'custom',
          importance TEXT NOT NULL DEFAULT 'medium',
          tags JSONB NOT NULL DEFAULT '[]',
          metadata JSONB NOT NULL DEFAULT '{}',
          embedding vector(${this.dimensions}),
          project_id TEXT,
          is_global BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          access_count INTEGER NOT NULL DEFAULT 0,
          token_count INTEGER NOT NULL DEFAULT 0,
          version INTEGER NOT NULL DEFAULT 1,
          UNIQUE(key, project_id)
        )
      `);

      await client.query("CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_memories_project_id ON memories(project_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_memories_updated_at ON memories(updated_at)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_memories_key_project ON memories(key, project_id)");

      // IVFFlat index for vector search (created after data exists, or use HNSW)
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories
        USING hnsw (embedding vector_cosine_ops)
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          user_id TEXT NOT NULL DEFAULT 'local',
          team_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(slug, user_id)
        )
      `);

      // Migration: add team_id if missing
      await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id TEXT");

      await client.query(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE,
          prefix TEXT NOT NULL,
          user_id TEXT NOT NULL DEFAULT 'local',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_used_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          color TEXT NOT NULL DEFAULT '#64748b',
          icon TEXT,
          project_id TEXT,
          is_system BOOLEAN NOT NULL DEFAULT FALSE,
          is_ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(name, project_id)
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_categories_project ON categories(project_id)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS team_members (
          team_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (team_id, user_id)
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS memory_history (
          id TEXT PRIMARY KEY,
          memory_id TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT NOT NULL,
          importance TEXT NOT NULL,
          tags JSONB NOT NULL DEFAULT '[]',
          metadata JSONB NOT NULL DEFAULT '{}',
          version INTEGER NOT NULL,
          changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          changed_by TEXT
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_memory_history_memory ON memory_history(memory_id)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          action TEXT NOT NULL,
          resource_type TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          details JSONB NOT NULL DEFAULT '{}',
          ip_address TEXT,
          user_agent TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)");
      await client.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS marketplace_listings (
          id TEXT PRIMARY KEY,
          memory_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'custom',
          tags JSONB NOT NULL DEFAULT '[]',
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          downloads INTEGER NOT NULL DEFAULT 0,
          rating REAL NOT NULL DEFAULT 0,
          is_public BOOLEAN NOT NULL DEFAULT TRUE,
          published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_marketplace_category ON marketplace_listings(category)");

      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_suggestions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          related_memory_ids JSONB NOT NULL DEFAULT '[]',
          confidence REAL NOT NULL DEFAULT 0,
          dismissed BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query("CREATE INDEX IF NOT EXISTS idx_suggestions_user ON ai_suggestions(user_id)");

      // Seed default local user
      await client.query(
        "INSERT INTO users (id, email, name) VALUES ('local', 'local@ponderdb.local', 'Local User') ON CONFLICT (id) DO NOTHING"
      );

      // Seed system categories
      const { rows: catRows } = await client.query("SELECT COUNT(*) as count FROM categories WHERE is_system = TRUE");
      if (Number(catRows[0].count) === 0) {
        for (const cat of SYSTEM_CATEGORIES) {
          await client.query(
            "INSERT INTO categories (id, name, description, color, is_system) VALUES ($1, $2, $3, $4, TRUE) ON CONFLICT DO NOTHING",
            [generateId(), cat.name, cat.description, cat.color]
          );
        }
      }
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // ── Memory CRUD ──

  async create(input: CreateMemoryInput & { embedding?: number[] }): Promise<Memory> {
    const { rows: existing } = await this.pool.query(
      "SELECT id FROM memories WHERE key = $1 AND project_id IS NOT DISTINCT FROM $2",
      [input.key, input.projectId ?? null]
    );
    if (existing.length > 0) throw new DuplicateKeyError(input.key);

    const id = generateId();
    const tokenCount = estimateTokens(input.content);
    const embedding = input.embedding ? pgvector.toSql(input.embedding) : null;

    await this.pool.query(
      `INSERT INTO memories (id, key, content, category, importance, tags, metadata, embedding, project_id, is_global, token_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id, input.key, input.content,
        input.category ?? "custom", input.importance ?? "medium",
        JSON.stringify(input.tags ?? []), JSON.stringify(input.metadata ?? {}),
        embedding, input.projectId ?? null, input.isGlobal ?? false, tokenCount,
      ]
    );

    return (await this.getById(id))!;
  }

  async getById(id: MemoryId): Promise<Memory | null> {
    const { rows } = await this.pool.query("SELECT * FROM memories WHERE id = $1", [id]);
    return rows.length > 0 ? this.rowToMemory(rows[0]) : null;
  }

  async getByKey(key: string, projectId?: string): Promise<Memory | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM memories WHERE key = $1 AND project_id IS NOT DISTINCT FROM $2",
      [key, projectId ?? null]
    );
    return rows.length > 0 ? this.rowToMemory(rows[0]) : null;
  }

  async update(id: MemoryId, input: UpdateMemoryInput & { embedding?: number[] }): Promise<Memory> {
    const existing = await this.getById(id);
    if (!existing) throw new MemoryNotFoundError(id);

    // Save current state to history
    await this.pool.query(
      `INSERT INTO memory_history (id, memory_id, content, category, importance, tags, metadata, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [generateId(), id, existing.content, existing.category, existing.importance,
       JSON.stringify(existing.tags), JSON.stringify(existing.metadata), existing.version]
    );

    const sets: string[] = ["updated_at = NOW()", "version = version + 1"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (input.content !== undefined) {
      sets.push(`content = $${paramIdx++}`); params.push(input.content);
      sets.push(`token_count = $${paramIdx++}`); params.push(estimateTokens(input.content));
    }
    if (input.category !== undefined) { sets.push(`category = $${paramIdx++}`); params.push(input.category); }
    if (input.importance !== undefined) { sets.push(`importance = $${paramIdx++}`); params.push(input.importance); }
    if (input.tags !== undefined) { sets.push(`tags = $${paramIdx++}`); params.push(JSON.stringify(input.tags)); }
    if (input.metadata !== undefined) { sets.push(`metadata = $${paramIdx++}`); params.push(JSON.stringify(input.metadata)); }
    if (input.isGlobal !== undefined) { sets.push(`is_global = $${paramIdx++}`); params.push(input.isGlobal); }
    if (input.embedding !== undefined) {
      sets.push(`embedding = $${paramIdx++}`);
      params.push(input.embedding ? pgvector.toSql(input.embedding) : null);
    }

    params.push(id);
    await this.pool.query(`UPDATE memories SET ${sets.join(", ")} WHERE id = $${paramIdx}`, params);
    return (await this.getById(id))!;
  }

  async delete(id: MemoryId): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM memories WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async list(filter: ListMemoriesFilter): Promise<PaginatedResult<Memory>> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filter.category) { conditions.push(`category = $${paramIdx++}`); params.push(filter.category); }
    if (filter.projectId) {
      conditions.push(`(project_id = $${paramIdx++} OR is_global = TRUE)`);
      params.push(filter.projectId);
    }
    if (filter.importance) { conditions.push(`importance = $${paramIdx++}`); params.push(filter.importance); }
    if (filter.tags?.length) {
      for (const tag of filter.tags) {
        conditions.push(`tags ? $${paramIdx++}`);
        params.push(tag);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const columnMap: Record<string, string> = {
      updatedAt: "updated_at", createdAt: "created_at",
      accessedAt: "accessed_at", accessCount: "access_count",
    };
    const sortCol = columnMap[filter.sortBy ?? "updatedAt"] ?? "updated_at";
    const sortDir = filter.sortOrder === "asc" ? "ASC" : "DESC";
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const countResult = await this.pool.query(`SELECT COUNT(*) as count FROM memories ${where}`, params);
    const total = Number(countResult.rows[0].count);

    const dataParams = [...params, limit, offset];
    const { rows } = await this.pool.query(
      `SELECT * FROM memories ${where} ORDER BY ${sortCol} ${sortDir} LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      dataParams
    );

    return {
      items: rows.map((r) => this.rowToMemory(r)),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  async vectorSearch(
    embedding: number[],
    limit: number,
    filter?: { category?: string; projectId?: string },
  ): Promise<SearchResult[]> {
    const conditions: string[] = ["embedding IS NOT NULL"];
    const params: unknown[] = [pgvector.toSql(embedding)];
    let paramIdx = 2;

    if (filter?.category) { conditions.push(`category = $${paramIdx++}`); params.push(filter.category); }
    if (filter?.projectId) {
      conditions.push(`(project_id = $${paramIdx++} OR is_global = TRUE)`);
      params.push(filter.projectId);
    }

    params.push(limit);
    const where = conditions.join(" AND ");

    const { rows } = await this.pool.query(
      `SELECT *, 1 - (embedding <=> $1) as similarity
       FROM memories WHERE ${where}
       ORDER BY embedding <=> $1
       LIMIT $${paramIdx}`,
      params
    );

    return rows.map((r) => ({
      memory: this.rowToMemory(r),
      score: Number(r.similarity),
      matchType: "semantic" as const,
    }));
  }

  async keywordSearch(
    query: string,
    limit: number,
    filter?: { category?: string; projectId?: string },
  ): Promise<SearchResult[]> {
    const conditions: string[] = ["(content ILIKE $1 OR key ILIKE $1)"];
    const params: unknown[] = [`%${query}%`];
    let paramIdx = 2;

    if (filter?.category) { conditions.push(`category = $${paramIdx++}`); params.push(filter.category); }
    if (filter?.projectId) {
      conditions.push(`(project_id = $${paramIdx++} OR is_global = TRUE)`);
      params.push(filter.projectId);
    }

    params.push(limit);
    const where = conditions.join(" AND ");

    const { rows } = await this.pool.query(
      `SELECT * FROM memories WHERE ${where} ORDER BY updated_at DESC LIMIT $${paramIdx}`,
      params
    );

    return rows.map((r) => ({
      memory: this.rowToMemory(r),
      score: 1.0,
      matchType: "keyword" as const,
    }));
  }

  async count(filter?: { projectId?: string }): Promise<number> {
    if (filter?.projectId) {
      const { rows } = await this.pool.query(
        "SELECT COUNT(*) as count FROM memories WHERE project_id = $1 OR is_global = TRUE",
        [filter.projectId]
      );
      return Number(rows[0].count);
    }
    const { rows } = await this.pool.query("SELECT COUNT(*) as count FROM memories");
    return Number(rows[0].count);
  }

  async recordAccess(id: MemoryId): Promise<void> {
    await this.pool.query(
      "UPDATE memories SET accessed_at = NOW(), access_count = access_count + 1 WHERE id = $1",
      [id]
    );
  }

  async getMemoryHistory(memoryId: MemoryId): Promise<MemoryVersion[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM memory_history WHERE memory_id = $1 ORDER BY version DESC",
      [memoryId]
    );
    return rows.map((r) => ({
      id: r.id as string,
      memoryId: r.memory_id as string,
      content: r.content as string,
      category: r.category as string,
      importance: r.importance as MemoryVersion["importance"],
      tags: (r.tags as string[]) ?? [],
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      version: r.version as number,
      changedAt: new Date(r.changed_at as string),
      changedBy: (r.changed_by as string) ?? undefined,
    }));
  }

  async restoreMemoryVersion(memoryId: MemoryId, versionNumber: number): Promise<Memory> {
    const { rows } = await this.pool.query(
      "SELECT * FROM memory_history WHERE memory_id = $1 AND version = $2",
      [memoryId, versionNumber]
    );
    if (rows.length === 0) throw new MemoryNotFoundError(`version ${versionNumber} of ${memoryId}`);

    const r = rows[0];
    return this.update(memoryId, {
      content: r.content as string,
      category: r.category as string,
      importance: r.importance as Memory["importance"],
      tags: r.tags as string[],
      metadata: r.metadata as Record<string, unknown>,
    });
  }

  // ── Users ──

  async createUser(input: CreateUserInput): Promise<User> {
    const id = generateId();
    const { rows } = await this.pool.query(
      "INSERT INTO users (id, email, name) VALUES ($1, $2, $3) RETURNING *",
      [id, input.email, input.name]
    );
    return this.rowToUser(rows[0]);
  }

  async getUserById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return rows.length > 0 ? this.rowToUser(rows[0]) : null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const { rows } = await this.pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return rows.length > 0 ? this.rowToUser(rows[0]) : null;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const sets: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let paramIdx = 1;
    if (input.name !== undefined) { sets.push(`name = $${paramIdx++}`); params.push(input.name); }
    if (input.email !== undefined) { sets.push(`email = $${paramIdx++}`); params.push(input.email); }
    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${paramIdx} RETURNING *`, params
    );
    return this.rowToUser(rows[0]);
  }

  async listUsers(): Promise<User[]> {
    const { rows } = await this.pool.query("SELECT * FROM users ORDER BY created_at ASC");
    return rows.map((r) => this.rowToUser(r));
  }

  // ── API Keys ──

  async createApiKey(name: string, userId: string): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const { key: rawKey, prefix, hash } = generateApiKey();
    const id = generateId();

    const { rows } = await this.pool.query(
      "INSERT INTO api_keys (id, name, key_hash, prefix, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [id, name, hash, prefix, userId]
    );

    return {
      apiKey: this.rowToApiKey(rows[0]),
      rawKey,
    };
  }

  async validateApiKey(rawKey: string): Promise<ApiKey | null> {
    const hash = hashApiKey(rawKey);
    const { rows } = await this.pool.query("SELECT * FROM api_keys WHERE key_hash = $1", [hash]);
    if (rows.length === 0) return null;

    const row = rows[0];
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

    await this.pool.query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [row.id]);
    return this.rowToApiKey(row);
  }

  async listApiKeys(userId: string): Promise<ApiKey[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC", [userId]
    );
    return rows.map((r) => ({ ...this.rowToApiKey(r), keyHash: "[hidden]" }));
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM api_keys WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async countApiKeys(userId: string): Promise<number> {
    const { rows } = await this.pool.query(
      "SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1", [userId]
    );
    return Number(rows[0].count);
  }

  // ── Categories ──

  async listCategories(projectId?: string): Promise<Category[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM categories WHERE project_id IS NOT DISTINCT FROM $1 OR is_system = TRUE ORDER BY is_system DESC, name ASC",
      [projectId ?? null]
    );
    return rows.map((r) => this.rowToCategory(r));
  }

  async getCategoryByName(name: string, projectId?: string): Promise<Category | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM categories WHERE name = $1 AND (project_id IS NOT DISTINCT FROM $2 OR is_system = TRUE) ORDER BY project_id IS NOT NULL DESC LIMIT 1",
      [name, projectId ?? null]
    );
    return rows.length > 0 ? this.rowToCategory(rows[0]) : null;
  }

  async createCategory(input: CreateCategoryInput & { isSystem?: boolean; isAiGenerated?: boolean }): Promise<Category> {
    const id = generateId();
    const { rows } = await this.pool.query(
      `INSERT INTO categories (id, name, description, color, icon, project_id, is_system, is_ai_generated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        id, input.name, input.description ?? "", input.color ?? "#64748b",
        input.icon ?? null, input.projectId ?? null,
        input.isSystem ?? false, input.isAiGenerated ?? false,
      ]
    );
    return this.rowToCategory(rows[0]);
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;
    if (input.name !== undefined) { sets.push(`name = $${paramIdx++}`); params.push(input.name); }
    if (input.description !== undefined) { sets.push(`description = $${paramIdx++}`); params.push(input.description); }
    if (input.color !== undefined) { sets.push(`color = $${paramIdx++}`); params.push(input.color); }
    if (input.icon !== undefined) { sets.push(`icon = $${paramIdx++}`); params.push(input.icon); }
    if (sets.length === 0) {
      const { rows } = await this.pool.query("SELECT * FROM categories WHERE id = $1", [id]);
      return this.rowToCategory(rows[0]);
    }
    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE categories SET ${sets.join(", ")} WHERE id = $${paramIdx} RETURNING *`, params
    );
    return this.rowToCategory(rows[0]);
  }

  async deleteCategory(id: string): Promise<boolean> {
    const { rows: catRows } = await this.pool.query("SELECT name FROM categories WHERE id = $1", [id]);
    if (catRows.length > 0) {
      await this.pool.query("UPDATE memories SET category = 'custom' WHERE category = $1", [catRows[0].name]);
    }
    const result = await this.pool.query("DELETE FROM categories WHERE id = $1 AND is_system = FALSE", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ── Projects ──

  async listProjects(userId: string): Promise<Project[]> {
    const { rows } = await this.pool.query(`
      SELECT DISTINCT p.* FROM projects p
      LEFT JOIN team_members tm ON p.team_id = tm.team_id
      WHERE p.user_id = $1 OR tm.user_id = $1
      ORDER BY p.name ASC
    `, [userId]);
    return rows.map((r) => this.rowToProject(r));
  }

  async getProjectBySlug(slug: string, userId: string): Promise<Project | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM projects WHERE slug = $1 AND user_id = $2", [slug, userId]
    );
    return rows.length > 0 ? this.rowToProject(rows[0]) : null;
  }

  async createProject(input: CreateProjectInput & { userId: string }): Promise<Project> {
    const id = generateId();
    const slug = input.slug || slugify(input.name);
    const { rows } = await this.pool.query(
      "INSERT INTO projects (id, name, slug, description, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [id, input.name, slug, input.description ?? "", input.userId]
    );
    return this.rowToProject(rows[0]);
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    const sets: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let paramIdx = 1;
    if (input.name !== undefined) { sets.push(`name = $${paramIdx++}`); params.push(input.name); }
    if (input.description !== undefined) { sets.push(`description = $${paramIdx++}`); params.push(input.description); }
    params.push(id);
    const { rows } = await this.pool.query(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = $${paramIdx} RETURNING *`, params
    );
    return this.rowToProject(rows[0]);
  }

  async deleteProject(id: string): Promise<boolean> {
    const { rows } = await this.pool.query("SELECT slug FROM projects WHERE id = $1", [id]);
    if (rows.length === 0) return false;

    const slug = rows[0].slug;
    await this.pool.query("DELETE FROM memories WHERE project_id = $1", [slug]);
    await this.pool.query("DELETE FROM categories WHERE project_id = $1", [slug]);
    await this.pool.query("DELETE FROM projects WHERE id = $1", [id]);
    return true;
  }

  // ── Teams ──

  async createTeam(input: CreateTeamInput, ownerId: string): Promise<Team> {
    const id = generateId();
    const slug = input.slug || slugify(input.name);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "INSERT INTO teams (id, name, slug) VALUES ($1, $2, $3) RETURNING *",
        [id, input.name, slug]
      );
      await client.query(
        "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')",
        [id, ownerId]
      );
      await client.query("COMMIT");
      const r = rows[0];
      return { id: r.id, name: r.name, slug: r.slug, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getTeamById(id: string): Promise<Team | null> {
    const { rows } = await this.pool.query("SELECT * FROM teams WHERE id = $1", [id]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, name: r.name, slug: r.slug, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) };
  }

  async getTeamBySlug(slug: string): Promise<Team | null> {
    const { rows } = await this.pool.query("SELECT * FROM teams WHERE slug = $1", [slug]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, name: r.name, slug: r.slug, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) };
  }

  async listUserTeams(userId: string): Promise<(Team & { role: TeamRole })[]> {
    const { rows } = await this.pool.query(`
      SELECT t.*, tm.role FROM teams t
      JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = $1 ORDER BY t.name ASC
    `, [userId]);
    return rows.map((r) => ({
      id: r.id as string, name: r.name as string, slug: r.slug as string,
      role: r.role as TeamRole,
      createdAt: new Date(r.created_at as string), updatedAt: new Date(r.updated_at as string),
    }));
  }

  async addTeamMember(teamId: string, userId: string, role: TeamRole): Promise<TeamMember> {
    const { rows } = await this.pool.query(
      "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3) RETURNING *",
      [teamId, userId, role]
    );
    return { teamId, userId, role, joinedAt: new Date(rows[0].joined_at) };
  }

  async removeTeamMember(teamId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", [teamId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listTeamMembers(teamId: string): Promise<TeamMember[]> {
    const { rows } = await this.pool.query(`
      SELECT tm.*, u.email, u.name as user_name FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = $1 ORDER BY tm.joined_at ASC
    `, [teamId]);
    return rows.map((r) => ({
      teamId: r.team_id as string, userId: r.user_id as string, role: r.role as TeamRole,
      joinedAt: new Date(r.joined_at as string),
      user: { id: r.user_id as string, email: r.email as string, name: r.user_name as string },
    }));
  }

  async updateTeamMemberRole(teamId: string, userId: string, role: TeamRole): Promise<TeamMember> {
    await this.pool.query(
      "UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3",
      [role, teamId, userId]
    );
    const { rows } = await this.pool.query(
      "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2", [teamId, userId]
    );
    return { teamId, userId, role, joinedAt: new Date(rows[0].joined_at) };
  }

  async deleteTeam(id: string): Promise<boolean> {
    const { rows } = await this.pool.query("SELECT id FROM teams WHERE id = $1", [id]);
    if (rows.length === 0) return false;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: projectRows } = await client.query("SELECT slug FROM projects WHERE team_id = $1", [id]);
      for (const p of projectRows) {
        await client.query("DELETE FROM memories WHERE project_id = $1", [p.slug]);
        await client.query("DELETE FROM categories WHERE project_id = $1", [p.slug]);
      }
      await client.query("DELETE FROM projects WHERE team_id = $1", [id]);
      await client.query("DELETE FROM team_members WHERE team_id = $1", [id]);
      await client.query("DELETE FROM teams WHERE id = $1", [id]);
      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Sync ──

  async getChangesSince(since: string | null, userId: string): Promise<{
    memories: Memory[];
    projects: Project[];
    categories: Category[];
  }> {
    const sinceDate = since || "1970-01-01T00:00:00.000Z";

    const { rows: projectRows } = await this.pool.query(
      "SELECT * FROM projects WHERE user_id = $1 AND updated_at > $2", [userId, sinceDate]
    );

    const { rows: slugRows } = await this.pool.query(
      "SELECT slug FROM projects WHERE user_id = $1", [userId]
    );
    const slugs = slugRows.map((r) => r.slug as string);

    let memoryRows: Record<string, unknown>[] = [];
    if (slugs.length > 0) {
      const placeholders = slugs.map((_, i) => `$${i + 2}`).join(",");
      const { rows } = await this.pool.query(
        `SELECT * FROM memories WHERE updated_at > $1 AND (project_id IN (${placeholders}) OR is_global = TRUE)`,
        [sinceDate, ...slugs]
      );
      memoryRows = rows;
    }

    const { rows: catRows } = await this.pool.query(
      "SELECT * FROM categories WHERE created_at > $1 AND (project_id IS NULL OR project_id IN (SELECT slug FROM projects WHERE user_id = $2))",
      [sinceDate, userId]
    );

    return {
      memories: memoryRows.map((r) => this.rowToMemory(r)),
      projects: projectRows.map((r) => this.rowToProject(r)),
      categories: catRows.map((r) => this.rowToCategory(r)),
    };
  }

  async applyRemoteChanges(changes: {
    memories: Memory[];
    projects: Project[];
    categories: Category[];
    deletedMemoryIds: string[];
    deletedProjectIds: string[];
    deletedCategoryIds: string[];
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      for (const p of changes.projects) {
        await client.query(
          `INSERT INTO projects (id, name, slug, description, user_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, updated_at=EXCLUDED.updated_at`,
          [p.id, p.name, p.slug, p.description, p.userId, p.createdAt.toISOString(), p.updatedAt.toISOString()]
        );
      }

      for (const m of changes.memories) {
        await client.query(
          `INSERT INTO memories (id, key, content, category, importance, tags, metadata, project_id, is_global, token_count, created_at, updated_at, accessed_at, access_count, version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO UPDATE SET
             content=EXCLUDED.content, category=EXCLUDED.category, importance=EXCLUDED.importance,
             tags=EXCLUDED.tags, metadata=EXCLUDED.metadata, is_global=EXCLUDED.is_global,
             token_count=EXCLUDED.token_count, updated_at=EXCLUDED.updated_at,
             accessed_at=EXCLUDED.accessed_at, access_count=EXCLUDED.access_count, version=EXCLUDED.version`,
          [
            m.id, m.key, m.content, m.category, m.importance,
            JSON.stringify(m.tags), JSON.stringify(m.metadata),
            m.projectId ?? null, m.isGlobal, m.tokenCount,
            m.createdAt.toISOString(), m.updatedAt.toISOString(),
            m.accessedAt.toISOString(), m.accessCount, m.version,
          ]
        );
      }

      for (const cat of changes.categories) {
        await client.query(
          `INSERT INTO categories (id, name, description, color, icon, project_id, is_system, is_ai_generated, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, color=EXCLUDED.color, icon=EXCLUDED.icon`,
          [cat.id, cat.name, cat.description, cat.color, cat.icon ?? null, cat.projectId ?? null, cat.isSystem, cat.isAiGenerated, cat.createdAt.toISOString()]
        );
      }

      for (const id of changes.deletedMemoryIds) {
        await client.query("DELETE FROM memories WHERE id = $1", [id]);
      }
      for (const id of changes.deletedProjectIds) {
        await client.query("DELETE FROM projects WHERE id = $1", [id]);
      }
      for (const id of changes.deletedCategoryIds) {
        await client.query("DELETE FROM categories WHERE id = $1 AND is_system = FALSE", [id]);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Audit Logs ──

  async createAuditLog(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<AuditLogEntry> {
    const id = generateId();
    const { rows } = await this.pool.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, entry.userId, entry.action, entry.resourceType, entry.resourceId,
       JSON.stringify(entry.details), entry.ipAddress ?? null, entry.userAgent ?? null]
    );
    const r = rows[0];
    return { ...entry, id, createdAt: new Date(r.created_at) };
  }

  async listAuditLogs(filter: {
    userId?: string; action?: AuditAction; resourceType?: string; limit?: number; offset?: number;
  }): Promise<{ items: AuditLogEntry[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (filter.userId) { conditions.push(`user_id = $${idx++}`); params.push(filter.userId); }
    if (filter.action) { conditions.push(`action = $${idx++}`); params.push(filter.action); }
    if (filter.resourceType) { conditions.push(`resource_type = $${idx++}`); params.push(filter.resourceType); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const countResult = await this.pool.query(`SELECT COUNT(*) as count FROM audit_logs ${where}`, params);
    const total = Number(countResult.rows[0].count);
    const { rows } = await this.pool.query(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );

    return {
      total,
      items: rows.map((r) => ({
        id: r.id as string, userId: r.user_id as string,
        action: r.action as AuditAction, resourceType: r.resource_type as AuditLogEntry["resourceType"],
        resourceId: r.resource_id as string, details: r.details as Record<string, unknown>,
        ipAddress: (r.ip_address as string) ?? undefined, userAgent: (r.user_agent as string) ?? undefined,
        createdAt: new Date(r.created_at as string),
      })),
    };
  }

  // ── Marketplace ──

  async createMarketplaceListing(
    input: CreateMarketplaceListingInput & { authorId: string; authorName: string }
  ): Promise<MarketplaceListing> {
    const id = generateId();
    const memory = await this.getById(input.memoryId);
    const { rows } = await this.pool.query(
      `INSERT INTO marketplace_listings (id, memory_id, title, description, category, tags, author_id, author_name, is_public)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, input.memoryId, input.title, input.description,
       memory?.category ?? "custom", JSON.stringify(memory?.tags ?? []),
       input.authorId, input.authorName, input.isPublic !== false]
    );
    return this.rowToListing(rows[0]);
  }

  async listMarketplaceListings(filter?: {
    category?: string; search?: string; limit?: number; offset?: number;
  }): Promise<{ items: MarketplaceListing[]; total: number }> {
    const conditions: string[] = ["is_public = TRUE"];
    const params: unknown[] = [];
    let idx = 1;
    if (filter?.category) { conditions.push(`category = $${idx++}`); params.push(filter.category); }
    if (filter?.search) { conditions.push(`(title ILIKE $${idx} OR description ILIKE $${idx++})`); params.push(`%${filter.search}%`); }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const countResult = await this.pool.query(`SELECT COUNT(*) as count FROM marketplace_listings ${where}`, params);
    const total = Number(countResult.rows[0].count);
    const { rows } = await this.pool.query(
      `SELECT * FROM marketplace_listings ${where} ORDER BY downloads DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return { total, items: rows.map((r) => this.rowToListing(r)) };
  }

  async getMarketplaceListing(id: string): Promise<MarketplaceListing | null> {
    const { rows } = await this.pool.query("SELECT * FROM marketplace_listings WHERE id = $1", [id]);
    return rows.length > 0 ? this.rowToListing(rows[0]) : null;
  }

  async recordMarketplaceDownload(id: string): Promise<void> {
    await this.pool.query("UPDATE marketplace_listings SET downloads = downloads + 1 WHERE id = $1", [id]);
  }

  private rowToListing(r: Record<string, unknown>): MarketplaceListing {
    return {
      id: r.id as string, memoryId: r.memory_id as string,
      title: r.title as string, description: r.description as string,
      category: r.category as string, tags: (r.tags as string[]) ?? [],
      authorId: r.author_id as string, authorName: r.author_name as string,
      downloads: r.downloads as number, rating: r.rating as number,
      isPublic: r.is_public as boolean,
      publishedAt: new Date(r.published_at as string), updatedAt: new Date(r.updated_at as string),
    };
  }

  // ── AI Suggestions ──

  async createAiSuggestion(suggestion: Omit<AiSuggestion, "id" | "createdAt" | "dismissed"> & { userId?: string }): Promise<AiSuggestion> {
    const id = generateId();
    const { rows } = await this.pool.query(
      `INSERT INTO ai_suggestions (id, user_id, type, title, description, related_memory_ids, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, (suggestion as Record<string, unknown>).userId ?? "local", suggestion.type, suggestion.title,
       suggestion.description, JSON.stringify(suggestion.relatedMemoryIds), suggestion.confidence]
    );
    return { ...suggestion, id, dismissed: false, createdAt: new Date(rows[0].created_at) };
  }

  async listAiSuggestions(userId: string): Promise<AiSuggestion[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM ai_suggestions WHERE user_id = $1 AND dismissed = FALSE ORDER BY confidence DESC",
      [userId]
    );
    return rows.map((r) => ({
      id: r.id as string, type: r.type as AiSuggestion["type"],
      title: r.title as string, description: r.description as string,
      relatedMemoryIds: (r.related_memory_ids as string[]) ?? [],
      confidence: r.confidence as number, dismissed: r.dismissed as boolean,
      createdAt: new Date(r.created_at as string),
    }));
  }

  async dismissAiSuggestion(id: string): Promise<boolean> {
    const result = await this.pool.query("UPDATE ai_suggestions SET dismissed = TRUE WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ── Row mappers ──

  private rowToMemory(row: Record<string, unknown>): Memory {
    return {
      id: row.id as string,
      key: row.key as string,
      content: row.content as string,
      category: row.category as string,
      importance: row.importance as Memory["importance"],
      tags: (row.tags as string[]) ?? [],
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      projectId: (row.project_id as string) ?? undefined,
      isGlobal: row.is_global as boolean,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      accessedAt: new Date(row.accessed_at as string),
      accessCount: row.access_count as number,
      tokenCount: row.token_count as number,
      version: row.version as number,
    };
  }

  private rowToUser(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: row.email as string,
      name: row.name as string,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  private rowToApiKey(row: Record<string, unknown>): ApiKey {
    return {
      id: row.id as string,
      name: row.name as string,
      keyHash: row.key_hash as string,
      prefix: row.prefix as string,
      userId: row.user_id as string,
      createdAt: new Date(row.created_at as string),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at as string) : undefined,
    };
  }

  private rowToCategory(row: Record<string, unknown>): Category {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      color: row.color as string,
      icon: (row.icon as string) ?? undefined,
      projectId: (row.project_id as string) ?? undefined,
      isSystem: row.is_system as boolean,
      isAiGenerated: row.is_ai_generated as boolean,
      createdAt: new Date(row.created_at as string),
    };
  }

  private rowToProject(row: Record<string, unknown>): Project {
    return {
      id: row.id as string,
      name: row.name as string,
      slug: row.slug as string,
      description: row.description as string,
      userId: row.user_id as string,
      teamId: (row.team_id as string) ?? undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}
