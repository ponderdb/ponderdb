# System Design — Universal AI Memory Server

## Detailed Architecture Document

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Component Breakdown](#2-component-breakdown)
3. [Data Flow](#3-data-flow)
4. [Deployment Modes](#4-deployment-modes)
5. [Offline & Sync Architecture](#5-offline--sync-architecture)
6. [API Design](#6-api-design)
7. [Memory Data Model](#7-memory-data-model)
8. [Search Architecture](#8-search-architecture)
9. [Notification System](#9-notification-system)
10. [Logging & Observability](#10-logging--observability)
11. [Security Architecture](#11-security-architecture)
12. [Scalability Design](#12-scalability-design)

---

## 1. High-Level Architecture

```
                          +-----------------------+
                          |    Web Dashboard      |
                          |    (Next.js SSR)      |
                          +----------+------------+
                                     |
                          +----------v------------+
                          |    API Gateway /       |
                          |    Load Balancer       |
                          |  (Nginx / Cloudflare)  |
                          +----------+------------+
                                     |
                 +-------------------+-------------------+
                 |                   |                   |
        +--------v-------+  +-------v--------+  +------v-------+
        |   REST API     |  |   MCP Server   |  |  WebSocket   |
        |  (Next.js API  |  | (for AI tools) |  |  Server      |
        |   Routes)      |  |                |  | (notifications)|
        +--------+-------+  +-------+--------+  +------+-------+
                 |                   |                   |
                 +-------------------+-------------------+
                                     |
                          +----------v------------+
                          |    Service Layer       |
                          |  - Memory Service      |
                          |  - Search Service      |
                          |  - Sync Service        |
                          |  - Auth Service        |
                          |  - Category Service    |
                          |  - Notification Service|
                          +----------+------------+
                                     |
                 +-------------------+-------------------+
                 |                   |                   |
        +--------v-------+  +-------v--------+  +------v-------+
        |  PostgreSQL    |  |   Qdrant       |  |  Redis/      |
        |  (source of    |  |  (vector       |  |  Valkey      |
        |   truth)       |  |   search)      |  |  (cache +    |
        |  + pgvector    |  |                |  |   sessions)  |
        +--------+-------+  +----------------+  +--------------+
                 |
        +--------v-------+
        |  S3 / MinIO    |
        |  (blob storage |
        |   for large    |
        |   memories)    |
        +----------------+
```

---

## 2. Component Breakdown

### 2.1 Web Dashboard (Frontend)

| Property | Choice | Reason |
|----------|--------|--------|
| Framework | Next.js 15 (App Router) | SSR + API routes in one |
| UI | shadcn/ui + Tailwind CSS | Lightweight, accessible |
| State | Zustand | Minimal, fast |
| Real-time | WebSocket (native) | Notifications, sync status |
| Auth UI | NextAuth.js pages | Built-in |

**Pages:**
- `/` — Landing page
- `/dashboard` — Memory overview, stats, recent activity
- `/memories` — Browse, search, filter, sort memories
- `/memories/[key]` — Single memory detail + history
- `/categories` — Category management
- `/settings` — API keys, preferences, sync config
- `/team` — Team management (Pro+)
- `/logs` — Activity logs, audit trail

### 2.2 REST API

**Base:** `/api/v1/`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/memories` | GET | List memories (paginated, filtered, sorted) |
| `/memories` | POST | Create memory |
| `/memories/:key` | GET | Get memory by key |
| `/memories/:key` | PUT | Update memory |
| `/memories/:key` | DELETE | Delete memory |
| `/memories/search` | POST | Semantic + keyword search |
| `/memories/bulk` | POST | Bulk create/update |
| `/memories/import` | POST | Import from file/tool |
| `/memories/export` | GET | Export memories |
| `/categories` | GET/POST | List/create categories |
| `/categories/:id` | PUT/DELETE | Update/delete category |
| `/keys` | GET/POST/DELETE | API key management |
| `/sync` | POST | Trigger sync |
| `/sync/status` | GET | Sync status |
| `/stats` | GET | Usage statistics |
| `/logs` | GET | Activity logs |

**Auth:** Bearer token (API key) or session cookie (web)

### 2.3 MCP Server

Model Context Protocol server — how AI tools connect.

```typescript
// MCP Tools exposed:
{
  "remember": {
    description: "Store a memory with key and optional category",
    params: { key: string, content: string, category?: string, tags?: string[] }
  },
  "recall": {
    description: "Retrieve memory by key",
    params: { key: string }
  },
  "search": {
    description: "Search memories by semantic similarity or keyword",
    params: { query: string, category?: string, limit?: number }
  },
  "forget": {
    description: "Delete a memory",
    params: { key: string }
  },
  "list_categories": {
    description: "List all memory categories",
    params: {}
  },
  "list_memories": {
    description: "List recent memories",
    params: { category?: string, limit?: number }
  },
  "context": {
    description: "Get relevant context for a prompt/task",
    params: { prompt: string, max_tokens?: number }
  }
}
```

### 2.4 WebSocket Server

For real-time features:
- Sync status updates
- New memory notifications (team)
- Memory conflict alerts
- Quota warnings
- Live search results

### 2.5 Background Job Queue

| Job | Trigger | Priority |
|-----|---------|----------|
| Generate embeddings | Memory create/update | High |
| Sync to cloud | Memory change (local mode) | Medium |
| Auto-categorize | Memory create | Medium |
| Deduplication check | Memory create | Low |
| Stale memory detection | Cron (daily) | Low |
| Usage stats aggregation | Cron (hourly) | Low |
| Backup | Cron (daily) | Medium |
| Cleanup expired | Cron (daily) | Low |

**Queue:** BullMQ (Redis-backed) — lightweight, proven

---

## 3. Data Flow

### 3.1 Memory Write Flow

```
AI Tool / Web UI / CLI
        |
        v
  [API Gateway] --> Rate limit check --> Auth check
        |
        v
  [Memory Service]
        |
        +---> Validate input
        +---> Generate key (if not provided)
        +---> Auto-categorize (lightweight classifier)
        +---> Write to PostgreSQL (source of truth)
        +---> Queue: generate embedding (async)
        +---> Queue: sync to vector DB (async)
        +---> Invalidate Redis cache
        +---> Emit WebSocket event
        +---> Write audit log
```

### 3.2 Memory Read Flow (by key)

```
Request --> Redis cache check
              |
         [HIT] --> Return cached
         [MISS] --> PostgreSQL lookup --> Cache in Redis --> Return
```

### 3.3 Memory Search Flow

```
Search query
      |
      v
  [Search Service]
      |
      +---> Generate query embedding (local model or API)
      |
      +---> Parallel:
      |       |
      |       +---> Qdrant: vector similarity search
      |       +---> PostgreSQL: full-text search (tsvector)
      |       +---> PostgreSQL: metadata filter
      |
      +---> Merge & re-rank results
      +---> Return top-K
```

### 3.4 Context Injection Flow (MCP "context" tool)

```
AI tool sends current prompt/task
      |
      v
  [Context Service]
      |
      +---> Extract key terms from prompt
      +---> Search relevant memories (vector + keyword)
      +---> Rank by relevance + recency + frequency
      +---> Fit within token budget (adaptive)
      +---> Return formatted context block
```

---

## 4. Deployment Modes

### 4.1 Local Mode (No Internet)

```
+-------------------------------------------+
|              USER'S MACHINE                |
|                                            |
|  +----------------+  +------------------+  |
|  | CLI / MCP      |  | Web Dashboard    |  |
|  | Server         |  | (localhost:3000)  |  |
|  +-------+--------+  +--------+---------+  |
|          |                     |            |
|  +-------v---------------------v---------+  |
|  |          Local API Server             |  |
|  +-------+------------------+------------+  |
|          |                  |               |
|  +-------v--------+  +-----v-----------+   |
|  |   SQLite        |  | sqlite-vec      |   |
|  |  (memories +    |  | (vectors,       |   |
|  |   metadata)     |  |  < 1M)          |   |
|  +-----------------+  +-----------------+   |
|                                             |
|  +------------------+                       |
|  | Local Embedding   |                      |
|  | (BGE-small,       |                      |
|  |  ~120 MB RAM)     |                      |
|  +------------------+                       |
+---------------------------------------------+
```

**Requirements:**
- Node.js 20+ OR single binary (pkg/bun compile)
- ~500 MB disk (app + embedding model)
- ~512 MB RAM minimum
- No internet needed after install
- Works on Mac (M1+), Linux, Windows

**Installation:**
```bash
# Option A: npm
npm install -g universal-memory
memory start

# Option B: Single binary
curl -fsSL https://memory.dev/install.sh | sh
memory start

# Option C: Docker
docker run -p 3000:3000 -v ~/.memory:/data universalmemory/server
```

### 4.2 Cloud Mode

```
+------------------+     +-------------------------+
|  AI Tools        |     |  Web Dashboard          |
|  (anywhere)      |     |  (memory.yourdomain.com)|
+--------+---------+     +------------+------------+
         |                             |
         +-------------+---------------+
                       |
              +--------v---------+
              |  Cloud API       |
              |  (Vercel/Fly.io) |
              +--------+---------+
                       |
         +-------------+---------------+
         |             |               |
  +------v-----+ +----v------+ +------v------+
  | PostgreSQL  | |  Qdrant   | |  Redis      |
  | (Neon/      | |  Cloud    | |  Cloud      |
  |  Supabase)  | |           | |             |
  +-------------+ +-----------+ +-------------+
         |
  +------v------+
  |  S3 / R2    |
  |  (blobs)    |
  +-------------+
```

**Managed Services Stack (cheapest path):**

| Component | Service | Free Tier | Pro Cost |
|-----------|---------|-----------|----------|
| API Server | Vercel / Fly.io | Yes | ~$5-20/mo |
| PostgreSQL | Neon | 512 MB | ~$19/mo |
| Vector DB | Qdrant Cloud | 1 GB | ~$25/mo |
| Cache | Upstash Redis | 10K commands/day | ~$10/mo |
| Blob Storage | Cloudflare R2 | 10 GB | ~$0.015/GB/mo |
| Auth | Clerk / Auth.js | 10K users | ~$25/mo |
| Domain + CDN | Cloudflare | Yes | Free |

**Total MVP cloud cost: ~$0 (free tiers) to ~$100/mo (production)**

### 4.3 Hybrid Mode (Local + Cloud)

```
+---------------------------------------------+
|              USER'S MACHINE                  |
|                                              |
|  +---------+  +-----------+  +------------+ |
|  | SQLite  |  | sqlite-vec|  | Local API  | |
|  | (local  |  | (local    |  | Server     | |
|  |  copy)  |  |  vectors) |  |            | |
|  +----+----+  +-----+-----+  +------+-----+ |
|       |              |               |       |
|       +--------------+-------+-------+       |
|                              |               |
|                    +---------v----------+    |
|                    |    Sync Engine     |    |
|                    |  (CRDT / delta)    |    |
|                    +---------+----------+    |
+------------------------------|---------------+
                               |
                     (internet when available)
                               |
              +----------------v-----------------+
              |          CLOUD                    |
              |  +------------+  +-------------+ |
              |  | PostgreSQL |  | Qdrant      | |
              |  | (master)   |  | (full index)| |
              |  +------------+  +-------------+ |
              +----------------------------------+
```

**Sync Strategy:**
- **Write:** Always write to local first (instant response)
- **Queue:** Changes queued for cloud sync
- **Sync:** When internet available, push delta changes
- **Conflict:** Last-write-wins with conflict log (user can review)
- **Pull:** Periodically pull new memories from cloud (team memories)

---

## 5. Offline & Sync Architecture

### 5.1 What Happens With No Internet

| Operation | Behavior | Notes |
|-----------|----------|-------|
| Create memory | Works (local SQLite) | Queued for cloud sync |
| Read memory | Works (local copy) | May be stale if team changes exist |
| Search | Works (local sqlite-vec) | Limited to local memories |
| Update memory | Works (local) | Queued for sync |
| Delete memory | Works (soft delete local) | Queued for sync |
| Dashboard | Works (localhost) | Real-time features disabled |
| MCP tools | Work (local) | Full functionality |
| Team memories | Read cached copy | No new team updates until online |
| Notifications | Queued | Delivered when back online |

### 5.2 Sync Protocol

```
Sync Event:
  {
    id: uuid,
    type: "CREATE" | "UPDATE" | "DELETE",
    memory_key: string,
    timestamp: ISO8601,
    data: { ... },
    checksum: sha256,
    client_id: string
  }

Sync Flow:
  1. Local change → Write to SQLite + append to sync_queue table
  2. Internet detected → POST /api/v1/sync/push (batch of events)
  3. Server processes events (conflict detection)
  4. Server responds with: accepted[], conflicts[], server_changes[]
  5. Client applies server_changes to local DB
  6. Client removes synced events from queue
  7. Conflicts presented to user (or auto-resolved with last-write-wins)
```

### 5.3 Conflict Resolution

| Strategy | When |
|----------|------|
| Last-write-wins | Default for personal memories |
| Server-wins | Team memories (admin edits take priority) |
| Manual merge | When both local and remote changed same field |
| Auto-merge | When changes are to different fields of same memory |

### 5.4 Bandwidth Optimization

- **Delta sync:** Only send changed fields, not full memory
- **Compression:** zstd compression on sync payloads (~70% reduction)
- **Batching:** Bundle multiple changes into single request
- **Dedup:** Skip sync if content hash unchanged
- **Embedding sync:** Don't sync embeddings — regenerate on each side
- **Priority sync:** Sync recently accessed memories first

### 5.5 Local-First Libraries (Options)

| Library | Approach | Pros | Cons |
|---------|----------|------|------|
| **CR-SQLite** | CRDTs on SQLite | Auto-merge, no conflicts | Alpha maturity |
| **ElectricSQL** | Postgres sync to SQLite | Postgres-native, partial sync | Requires Postgres server |
| **PowerSync** | Postgres to SQLite sync | Production-ready, good SDK | Paid service |
| **Custom (recommended)** | Event queue + delta sync | Full control, simple | More code |

**Recommendation:** Custom sync with event queue. Simpler, no vendor lock-in, easier to debug.

---

## 6. API Design

### 6.1 REST API Specification

#### Authentication

```
# API Key (for AI tools / CLI)
Authorization: Bearer mem_sk_xxxxxxxxxxxxx

# Session Cookie (for web dashboard)
Set by NextAuth.js on login
```

#### Create Memory

```http
POST /api/v1/memories
Content-Type: application/json
Authorization: Bearer mem_sk_xxx

{
  "key": "auth/jwt-config",
  "content": "JWT uses RS256 algorithm. Access tokens expire in 15 minutes. Refresh tokens expire in 7 days. Secret stored in AWS Secrets Manager.",
  "category": "architecture",
  "tags": ["auth", "jwt", "security"],
  "metadata": {
    "project": "backend-api",
    "source": "claude-cli",
    "confidence": 0.95
  }
}
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "key": "auth/jwt-config",
  "content": "JWT uses RS256 algorithm...",
  "category": "architecture",
  "tags": ["auth", "jwt", "security"],
  "metadata": { ... },
  "source": "claude-cli",
  "created_at": "2025-05-03T10:30:00Z",
  "updated_at": "2025-05-03T10:30:00Z",
  "byte_size": 156
}
```

#### Search Memories

```http
POST /api/v1/memories/search
Content-Type: application/json

{
  "query": "how does authentication work",
  "mode": "hybrid",          // "semantic" | "keyword" | "hybrid"
  "category": "architecture", // optional filter
  "tags": ["auth"],           // optional filter
  "project": "backend-api",   // optional filter
  "limit": 10,
  "min_relevance": 0.7       // 0-1 threshold
}
```

Response:
```json
{
  "results": [
    {
      "memory": { ... },
      "relevance": 0.94,
      "match_type": "semantic"
    }
  ],
  "total": 23,
  "search_time_ms": 42
}
```

#### Get Context (for AI tools)

```http
POST /api/v1/memories/context
Content-Type: application/json

{
  "prompt": "Fix the login endpoint that returns 401 for valid tokens",
  "max_tokens": 2000,
  "project": "backend-api"
}
```

Response:
```json
{
  "context": "## Relevant Project Knowledge\n\n### Auth Configuration\nJWT uses RS256...\n\n### Known Issues\nToken validation was broken in v2.3...",
  "memories_used": 5,
  "total_tokens": 1847
}
```

### 6.2 MCP Protocol

MCP server exposes same functionality as REST API but via MCP tool protocol.

**Config for Claude CLI:**
```json
// ~/.claude/claude_desktop_config.json
{
  "mcpServers": {
    "memory": {
      "command": "memory",
      "args": ["mcp-server"],
      "env": {
        "MEMORY_API_KEY": "mem_sk_xxx",
        "MEMORY_URL": "https://api.memory.dev"
      }
    }
  }
}
```

**Config for Cursor:**
```json
// .cursor/mcp.json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@universalmemory/mcp-server"],
      "env": {
        "MEMORY_API_KEY": "mem_sk_xxx"
      }
    }
  }
}
```

### 6.3 GraphQL API (Optional, Phase 2)

```graphql
type Memory {
  id: ID!
  key: String!
  content: String!
  category: String!
  tags: [String!]!
  metadata: JSON
  source: String
  createdAt: DateTime!
  updatedAt: DateTime!
  versions: [MemoryVersion!]!
}

type Query {
  memory(key: String!): Memory
  memories(filter: MemoryFilter, limit: Int, offset: Int): MemoryConnection!
  search(query: String!, mode: SearchMode, limit: Int): SearchResult!
  context(prompt: String!, maxTokens: Int): ContextResult!
}

type Mutation {
  remember(input: RememberInput!): Memory!
  forget(key: String!): Boolean!
  updateMemory(key: String!, input: UpdateMemoryInput!): Memory!
}
```

---

## 7. Memory Data Model

### 7.1 PostgreSQL Schema

```sql
-- Users
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    avatar_url  TEXT,
    plan        TEXT NOT NULL DEFAULT 'free',  -- free, pro, team, enterprise
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    key_hash    TEXT NOT NULL,  -- bcrypt hash of key
    key_prefix  TEXT NOT NULL,  -- "mem_sk_xxxx" for display
    scopes      TEXT[] DEFAULT '{read,write}',
    last_used   TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- Teams
CREATE TABLE teams (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    owner_id    UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE team_members (
    team_id     UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member', -- owner, admin, member
    joined_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (team_id, user_id)
);

-- Categories
CREATE TABLE categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    color       TEXT,       -- hex color for UI
    icon        TEXT,       -- icon name
    parent_id   UUID REFERENCES categories(id), -- hierarchical
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);

-- Memories (partitioned by user_id hash for TB scale)
CREATE TABLE memories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id     UUID REFERENCES teams(id),  -- NULL = personal
    key         TEXT NOT NULL,
    content     TEXT NOT NULL,
    content_ts  TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    category_id UUID REFERENCES categories(id),
    tags        TEXT[] DEFAULT '{}',
    metadata    JSONB DEFAULT '{}',
    source      TEXT,               -- "claude-cli", "cursor", "web", "api"
    byte_size   BIGINT GENERATED ALWAYS AS (octet_length(content)) STORED,
    version     INTEGER DEFAULT 1,
    is_deleted  BOOLEAN DEFAULT false,
    confidence  REAL DEFAULT 1.0,   -- 0-1, for auto-decay
    access_count BIGINT DEFAULT 0,
    last_accessed TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,        -- optional TTL
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),

    UNIQUE(user_id, key)
) PARTITION BY HASH(user_id);

-- Create partitions (8 partitions to start, add more as needed)
CREATE TABLE memories_p0 PARTITION OF memories FOR VALUES WITH (modulus 8, remainder 0);
CREATE TABLE memories_p1 PARTITION OF memories FOR VALUES WITH (modulus 8, remainder 1);
CREATE TABLE memories_p2 PARTITION OF memories FOR VALUES WITH (modulus 8, remainder 2);
CREATE TABLE memories_p3 PARTITION OF memories FOR VALUES WITH (modulus 8, remainder 3);
CREATE TABLE memories_p4 PARTITION OF memories FOR VALUES WITH (modulus 8, remainder 4);
CREATE TABLE memories_p5 PARTITION OF memories FOR VALUES WITH (modulus 8, remainder 5);
CREATE TABLE memories_p6 PARTITION OF memories FOR VALUES WITH (modulus 8, remainder 6);
CREATE TABLE memories_p7 PARTITION OF memories FOR VALUES WITH (modulus 8, remainder 7);

-- Indexes
CREATE INDEX idx_memories_key ON memories (user_id, key);
CREATE INDEX idx_memories_category ON memories (user_id, category_id);
CREATE INDEX idx_memories_tags ON memories USING GIN (tags);
CREATE INDEX idx_memories_metadata ON memories USING GIN (metadata);
CREATE INDEX idx_memories_fts ON memories USING GIN (content_ts);
CREATE INDEX idx_memories_created ON memories (user_id, created_at DESC);
CREATE INDEX idx_memories_accessed ON memories (user_id, last_accessed DESC);
CREATE INDEX idx_memories_source ON memories (user_id, source);

-- Memory Versions (for history)
CREATE TABLE memory_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id   UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    content     TEXT NOT NULL,
    changed_by  TEXT,         -- user or tool that made change
    change_type TEXT,         -- "create", "update", "restore"
    diff        TEXT,         -- diff from previous version
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_versions_memory ON memory_versions(memory_id, version DESC);

-- Sync Queue (for offline/hybrid mode)
CREATE TABLE sync_queue (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    event_type  TEXT NOT NULL,    -- CREATE, UPDATE, DELETE
    memory_key  TEXT NOT NULL,
    payload     JSONB NOT NULL,
    checksum    TEXT NOT NULL,
    client_id   TEXT NOT NULL,
    status      TEXT DEFAULT 'pending', -- pending, synced, conflict, failed
    retry_count INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    synced_at   TIMESTAMPTZ
);
CREATE INDEX idx_sync_pending ON sync_queue(user_id, status) WHERE status = 'pending';

-- Activity Logs
CREATE TABLE activity_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    action      TEXT NOT NULL,     -- memory.create, memory.search, sync.push, etc.
    resource    TEXT,              -- memory key or ID
    details     JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_logs_user_time ON activity_logs(user_id, created_at DESC);

-- Usage Stats (aggregated hourly)
CREATE TABLE usage_stats (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    period      TIMESTAMPTZ NOT NULL,  -- truncated to hour
    memories_created INTEGER DEFAULT 0,
    memories_updated INTEGER DEFAULT 0,
    memories_deleted INTEGER DEFAULT 0,
    searches    INTEGER DEFAULT 0,
    api_calls   INTEGER DEFAULT 0,
    storage_bytes BIGINT DEFAULT 0,
    UNIQUE(user_id, period)
);

-- Row Level Security (multi-tenant isolation)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY memories_user_policy ON memories
    USING (user_id = current_setting('app.current_user_id')::UUID);
```

### 7.2 Qdrant Collection Schema

```json
{
  "collection_name": "memories",
  "vectors": {
    "size": 768,
    "distance": "Cosine"
  },
  "optimizers_config": {
    "indexing_threshold": 20000,
    "memmap_threshold": 50000
  },
  "quantization_config": {
    "scalar": {
      "type": "int8",
      "quantile": 0.99,
      "always_ram": true
    }
  },
  "payload_schema": {
    "user_id": "keyword",
    "category": "keyword",
    "tags": "keyword",
    "source": "keyword",
    "created_at": "datetime",
    "confidence": "float"
  }
}
```

### 7.3 Redis Cache Schema

```
# Memory cache (TTL: 1 hour)
memory:{user_id}:{key} → JSON string of memory object

# Search cache (TTL: 5 minutes)
search:{user_id}:{query_hash} → JSON array of results

# Rate limit
ratelimit:{api_key}:{window} → count

# Session
session:{session_id} → JSON user object

# Sync lock
synclock:{user_id} → timestamp
```

---

## 8. Search Architecture

### 8.1 Search Modes

| Mode | How | Best For |
|------|-----|----------|
| **Key lookup** | PostgreSQL B-tree index | Exact key retrieval, <1ms |
| **Keyword** | PostgreSQL tsvector + GIN | When user knows exact terms |
| **Semantic** | Qdrant HNSW vector search | Conceptual similarity |
| **Hybrid** | Semantic + keyword + re-rank | Default mode, best results |
| **Filtered** | Any mode + category/tag/metadata filter | Scoped searches |

### 8.2 Hybrid Search Algorithm

```
hybrid_search(query, filters):
  1. Generate query embedding (768-dim)
  2. Parallel:
     a. Qdrant: top-50 by cosine similarity (with payload filters)
     b. PostgreSQL: top-50 by ts_rank (full-text search)
  3. Normalize scores:
     - Qdrant scores: already 0-1 (cosine)
     - PostgreSQL: normalize ts_rank to 0-1
  4. Reciprocal Rank Fusion (RRF):
     - For each result: score = sum(1 / (k + rank_i)) for each search
     - k = 60 (standard RRF constant)
  5. Apply recency boost:
     - score *= 1 + (0.1 * recency_factor)
     - recency_factor = max(0, 1 - days_since_update / 365)
  6. Apply access frequency boost:
     - score *= 1 + (0.05 * log(access_count + 1))
  7. Sort by final score, return top-K
```

### 8.3 Auto-Categorization

Lightweight classifier for auto-categorizing new memories:

```
Default Categories:
  - architecture    → system design, patterns, tech choices
  - bugs           → bug fixes, known issues, workarounds
  - api            → API endpoints, request/response formats
  - deployment     → deploy process, CI/CD, infrastructure
  - configuration  → config files, env vars, settings
  - code-patterns  → coding conventions, style rules
  - business-logic → domain rules, business requirements
  - debugging      → debug techniques, log locations
  - dependencies   → packages, versions, compatibility
  - security       → auth, encryption, permissions
  - performance    → optimization, caching, bottlenecks
  - uncategorized  → fallback
```

**Method:** Keyword matching + embedding similarity to category exemplars. No ML model needed for v1.

---

## 9. Notification System

### 9.1 Architecture

```
Event Sources                    Delivery
+-----------+     +----------+  +-----------+
| Memory    |---->|          |->| WebSocket |---> Dashboard (real-time)
| CRUD      |     |  Event   |  +-----------+
+-----------+     |  Bus     |  +-----------+
| Sync      |---->| (Redis   |->| Email     |---> Digest (daily/weekly)
| Events    |     |  Pub/Sub)|  +-----------+
+-----------+     |          |  +-----------+
| System    |---->|          |->| Webhook   |---> External integrations
| Events    |     +----------+  +-----------+
+-----------+
```

### 9.2 Event Types

| Event | Channel | Priority |
|-------|---------|----------|
| `memory.created` | WebSocket | Low |
| `memory.updated` | WebSocket | Low |
| `memory.deleted` | WebSocket | Low |
| `sync.completed` | WebSocket | Medium |
| `sync.conflict` | WebSocket + Email | High |
| `quota.warning` (80%) | WebSocket + Email | High |
| `quota.exceeded` | WebSocket + Email | Critical |
| `team.memory_added` | WebSocket | Medium |
| `team.member_joined` | WebSocket + Email | Medium |
| `security.new_api_key` | Email | High |
| `security.suspicious_access` | Email | Critical |
| `system.maintenance` | WebSocket + Email | High |

### 9.3 Implementation

```typescript
// WebSocket (native, no Socket.io — lighter weight)
// Server
const wss = new WebSocketServer({ port: 8080 });
wss.on('connection', (ws, req) => {
  const userId = authenticateWs(req);
  userConnections.set(userId, ws);
});

// Notification dispatch
function notify(userId: string, event: NotificationEvent) {
  // Real-time (WebSocket)
  const ws = userConnections.get(userId);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }

  // Persistent (store for later)
  await db.notifications.create({
    userId, event, read: false, createdAt: new Date()
  });

  // Email (high priority only)
  if (event.priority >= Priority.HIGH) {
    await emailQueue.add('send', { userId, event });
  }
}
```

### 9.4 Tools & Costs

| Tool | Use | Free Tier | Paid |
|------|-----|-----------|------|
| Native WebSocket | Real-time | Free | Free |
| Resend | Email | 3000 emails/mo | $20/mo (50K) |
| Redis Pub/Sub | Event bus | Self-hosted free | Upstash: 10K/day free |
| Webhook delivery | External | Custom (free) | Free |

---

## 10. Logging & Observability

### 10.1 Logging Stack

```
App (Pino logger)
      |
      v
  Structured JSON logs
      |
      +---> stdout (development)
      +---> File rotation (production, local mode)
      +---> Grafana Loki (production, cloud mode) [FREE]
      +---> OpenTelemetry Collector (traces + metrics) [FREE]
```

### 10.2 What to Log

| Category | Events | Level |
|----------|--------|-------|
| **Memory CRUD** | create, read, update, delete with key + user | info |
| **Search** | query, results count, latency | info |
| **Auth** | login, logout, key create/revoke, failed auth | warn/info |
| **Sync** | push, pull, conflict, resolution | info/warn |
| **API** | request method, path, status, latency | info |
| **Errors** | stack traces, context | error |
| **Performance** | slow queries (>500ms), high memory | warn |
| **Rate limits** | throttled requests | warn |
| **Background jobs** | start, complete, fail | info/error |

### 10.3 Log Format

```json
{
  "level": "info",
  "time": "2025-05-03T10:30:00.000Z",
  "msg": "memory.created",
  "user_id": "550e8400...",
  "memory_key": "auth/jwt-config",
  "category": "architecture",
  "source": "claude-cli",
  "byte_size": 156,
  "latency_ms": 12,
  "request_id": "req_abc123"
}
```

### 10.4 Observability Tools

| Tool | Purpose | Free? | Cost |
|------|---------|-------|------|
| **Pino** | Structured logging (Node.js) | Yes | Free |
| **Grafana Loki** | Log aggregation + search | Yes (self-host) | Free |
| **Grafana** | Dashboards + alerting | Yes (self-host) | Free |
| **Prometheus** | Metrics collection | Yes | Free |
| **OpenTelemetry** | Distributed tracing | Yes | Free |
| **Sentry** | Error tracking | 5K events/mo free | $26/mo |
| **BetterStack (Logtail)** | Managed logs | 1 GB/mo free | $25/mo |
| **Datadog** | Full observability | N/A | ~$15/host/mo |

**Recommendation for MVP:** Pino → stdout → Grafana Loki (self-hosted, free). Add Sentry for error tracking (free tier).

### 10.5 Audit Logs (Enterprise)

For team/enterprise plans — immutable audit trail:

```sql
-- Append-only, never delete
INSERT INTO audit_logs (user_id, team_id, action, resource, old_value, new_value, ip, timestamp)
VALUES (...);

-- Query: who changed what, when
SELECT * FROM audit_logs
WHERE team_id = $1 AND action LIKE 'memory.%'
ORDER BY timestamp DESC
LIMIT 100;
```

---

## 11. Security Architecture

### 11.1 Authentication

```
+------------------+     +------------------+
| Web Dashboard    |     | AI Tools / CLI   |
| (NextAuth.js)    |     | (API Keys)       |
+--------+---------+     +--------+---------+
         |                         |
    OAuth 2.0 /               Bearer Token
    Email+Password            mem_sk_xxxx
         |                         |
         +-----------+-------------+
                     |
              +------v------+
              |  Auth       |
              |  Middleware  |
              +------+------+
                     |
              +------v------+
              |  PostgreSQL |
              |  RLS        |
              +-------------+
```

### 11.2 API Key Design

```
Format: mem_sk_{random_32_chars}
Example: mem_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

Storage: bcrypt hash in DB
Display: mem_sk_a1b2...p6 (prefix + last 2 chars)
Scopes: read, write, admin, search
Expiry: optional, user-configurable
```

### 11.3 Data Protection

| Layer | Protection |
|-------|-----------|
| Transit | TLS 1.3 (HTTPS everywhere) |
| Rest (DB) | PostgreSQL encryption + disk encryption |
| Rest (S3) | AES-256 server-side encryption |
| API Keys | bcrypt hashed in DB |
| Passwords | Argon2id |
| Sensitive metadata | AES-256-GCM application-level encryption |
| Zero-knowledge (optional) | Client-side encryption before upload |

### 11.4 Row-Level Security

```sql
-- Every query automatically scoped to current user
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON memories
    USING (user_id = current_setting('app.current_user_id')::UUID);

-- Team access
CREATE POLICY team_access ON memories
    USING (
        team_id IS NOT NULL
        AND team_id IN (
            SELECT team_id FROM team_members
            WHERE user_id = current_setting('app.current_user_id')::UUID
        )
    );
```

---

## 12. Scalability Design

### 12.1 Scaling Stages

| Users | Architecture | Estimated Cost |
|-------|-------------|---------------|
| 0-1K | Single server (Fly.io) + managed Postgres | ~$50/mo |
| 1K-10K | 2 app servers + read replica + Qdrant | ~$200/mo |
| 10K-100K | Auto-scaling + PgBouncer + Qdrant cluster | ~$1,000/mo |
| 100K-1M | Multi-region + sharded Postgres + CDN | ~$5,000/mo |
| 1M+ | Kubernetes + horizontal everything | ~$20,000+/mo |

### 12.2 Connection Pooling

```
App Servers (N instances)
      |
      v
  PgBouncer (connection pooler)
      |  (100 connections shared across all app instances)
      v
  PostgreSQL (max_connections = 100)
```

- PgBouncer in transaction mode
- Each app instance: 5-10 connections to PgBouncer
- PgBouncer: 100 connections to Postgres
- Handles 10,000+ concurrent app connections with 100 DB connections

### 12.3 Caching Strategy

```
Layer 1: CDN (Cloudflare)
  - Static assets
  - Immutable memory content (by version hash)

Layer 2: Redis/Valkey
  - Hot memories (recently accessed)
  - Search result cache (short TTL)
  - Session data

Layer 3: Application
  - In-memory LRU cache (per-process)
  - Embedding model cache
  - Category list cache
```

### 12.4 Rate Limiting

| Plan | API Calls/min | Searches/min | Writes/min |
|------|--------------|-------------|------------|
| Free | 60 | 20 | 10 |
| Pro | 300 | 100 | 50 |
| Team | 1,000 | 300 | 150 |
| Enterprise | Custom | Custom | Custom |

**Implementation:** Sliding window counter in Redis

```typescript
async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, windowSec);
  return current <= limit;
}
```

### 12.5 Lightweight Optimization Techniques

| Technique | Impact | Where |
|-----------|--------|-------|
| zstd compression on memory content | 60-80% storage reduction | DB + transfer |
| Lazy embedding generation | Non-blocking writes | Background queue |
| Pagination (cursor-based) | Constant time listing | API |
| Partial response (field selection) | Less data transfer | API |
| Batch operations | Fewer round trips | Bulk import |
| Edge caching (Cloudflare Workers) | Sub-10ms reads | Global |
| Streaming responses | Lower TTFB | Large exports |
| Index-only scans | No table access for counts | PostgreSQL |
| Materialized views | Pre-computed stats | Dashboard |
