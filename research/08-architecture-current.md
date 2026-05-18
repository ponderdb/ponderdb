# PonderDB — Architecture & Implementation Plan

## Current State + Planned Features

*Updated May 2025*

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Current Architecture](#2-current-architecture)
3. [Package Dependency Graph](#3-package-dependency-graph)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [Database Schema](#5-database-schema)
6. [API & MCP Architecture](#6-api--mcp-architecture)
7. [Authentication & Project Scoping](#7-authentication--project-scoping)
8. [Dashboard Architecture](#8-dashboard-architecture)
9. [Planned: Dynamic Categories](#9-planned-dynamic-categories)
10. [Planned: Enhanced Project System](#10-planned-enhanced-project-system)
11. [Implementation Roadmap](#11-implementation-roadmap)

---

## 1. System Overview

PonderDB is a **local-first AI agent memory server** with semantic search, REST API, MCP support, and a web dashboard.

### High-Level Architecture (Current)

```mermaid
graph TB
    subgraph Clients
        CLI[CLI Tool<br/>ponder]
        SDK[TypeScript SDK<br/>@ponderdb/sdk]
        MCP_STDIO[MCP stdio<br/>Claude/Cursor/Windsurf]
        MCP_HTTP[MCP HTTP<br/>Remote Clients]
        DASH[Web Dashboard<br/>React 19 + Vite]
    end

    subgraph Server["PonderDB Server (Hono)"]
        AUTH[Auth Middleware<br/>API Key Validation]
        REST[REST API<br/>/api/memories/*]
        MCP_S[MCP Server<br/>5 tools]
        STATIC[Static Files<br/>Dashboard SPA]
    end

    subgraph Storage
        SQLITE[(SQLite<br/>better-sqlite3)]
        VEC[(sqlite-vec<br/>Vector Search)]
        EMBED[Embedder<br/>all-MiniLM-L6-v2]
    end

    CLI --> REST
    SDK --> REST
    MCP_STDIO --> MCP_S
    MCP_HTTP --> AUTH --> MCP_S
    DASH --> AUTH --> REST

    REST --> SQLITE
    REST --> VEC
    REST --> EMBED
    MCP_S --> SQLITE
    MCP_S --> VEC
    MCP_S --> EMBED
```

---

## 2. Current Architecture

### Tech Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| Runtime | Node.js >= 22 | ES modules |
| API Server | Hono 4.x | Lightweight web framework |
| Database | SQLite + better-sqlite3 | Local-first, WAL mode |
| Vector DB | sqlite-vec 0.1.9 | KNN cosine search |
| Embeddings | Transformers.js + all-MiniLM-L6-v2 | 384-dim, local, ~80MB model |
| MCP | @modelcontextprotocol/sdk 1.12.1 | stdio + Streamable HTTP |
| Dashboard | React 19 + Vite 6.3.5 | Light theme SPA |
| CLI | Commander 13.1.0 | Terminal interface |
| Monorepo | npm workspaces | 6 packages |

### Monorepo Structure

```
packages/
  core/           → Types, interfaces, errors, utilities
  sqlite-store/   → StorageAdapter implementation (SQLite + sqlite-vec)
  server/         → Hono REST API + MCP server + embedders
  sdk/            → TypeScript client library
  cli/            → CLI tool (ponder command)
  dashboard/      → React SPA (served from server)
```

---

## 3. Package Dependency Graph

```mermaid
graph LR
    CORE["@ponderdb/core<br/>Types & Interfaces"]
    STORE["@ponderdb/sqlite-store<br/>SQLite + sqlite-vec"]
    SERVER["@ponderdb/server<br/>Hono + MCP"]
    SDK["@ponderdb/sdk<br/>HTTP Client"]
    CLI["@ponderdb/cli<br/>Commander"]
    DASH["@ponderdb/dashboard<br/>React 19"]

    STORE --> CORE
    SERVER --> CORE
    SERVER --> STORE
    SDK --> CORE
    CLI --> SDK
    SERVER -.serves.-> DASH
```

---

## 4. Data Flow Diagrams

### Memory Write Flow

```mermaid
sequenceDiagram
    participant C as Client (CLI/SDK/MCP/Dashboard)
    participant A as Auth Middleware
    participant S as Memory Service
    participant E as Embedder
    participant DB as SQLite
    participant V as sqlite-vec

    C->>A: POST /api/memories (Bearer pndr_xxx)
    A->>A: Validate API key (SHA256 hash lookup)
    A->>S: Authorized request
    S->>S: Validate input + auto-detect category
    S->>E: Embed "{key} {content}"
    E-->>S: 384-dim vector
    S->>DB: INSERT INTO memories
    S->>V: INSERT INTO vec_memories (embedding)
    S-->>C: 201 Created (Memory object)
```

### Memory Search Flow (Hybrid)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Search Service
    participant E as Embedder
    participant V as sqlite-vec
    participant DB as SQLite

    C->>S: POST /api/memories/search {query}
    S->>E: Embed query string
    E-->>S: 384-dim query vector

    par Parallel Search
        S->>V: KNN vector search (cosine)
        V-->>S: Top-N semantic results
    and
        S->>DB: LIKE keyword search
        DB-->>S: Top-N keyword results
    end

    S->>S: Merge + deduplicate
    S->>S: Weight keywords at 0.7x
    S->>S: Sort by score DESC
    S-->>C: Ranked results
```

### MCP Tool Flow

```mermaid
sequenceDiagram
    participant AI as AI Tool (Claude/Cursor)
    participant MCP as MCP Server
    participant Store as SQLite Store
    participant Embed as Embedder

    AI->>MCP: tool_call: remember(key, content)
    MCP->>Store: getByKey(key)
    alt Memory exists
        MCP->>Embed: embed(key + content)
        Embed-->>MCP: vector
        MCP->>Store: update(id, {content, embedding})
        MCP-->>AI: "Updated: {key}"
    else New memory
        MCP->>MCP: detectCategory(content)
        MCP->>Embed: embed(key + content)
        Embed-->>MCP: vector
        MCP->>Store: create({key, content, category, embedding})
        MCP-->>AI: "Remembered: {key} ({category})"
    end
```

---

## 5. Database Schema

### Current Schema

```mermaid
erDiagram
    MEMORIES {
        text id PK "24-char hex"
        text key "UNIQUE with project_id"
        text content
        text category "default: custom"
        text importance "default: medium"
        text tags "JSON array"
        text metadata "JSON object"
        blob embedding "Float32Array"
        text project_id "nullable"
        text created_at "ISO datetime"
        text updated_at "ISO datetime"
        text accessed_at "ISO datetime"
        int access_count "default: 0"
        int version "default: 1"
    }

    API_KEYS {
        text id PK
        text name
        text key_hash "UNIQUE, SHA256"
        text prefix "display only"
        text created_at
        text last_used_at "nullable"
        text expires_at "nullable"
    }

    VEC_MEMORIES {
        text memory_id PK "FK to memories.id"
        float384 embedding "cosine distance"
    }

    MEMORIES ||--o| VEC_MEMORIES : "has vector"
```

### Indexes

```sql
idx_memories_key         ON memories(key)
idx_memories_category    ON memories(category)
idx_memories_project_id  ON memories(project_id)
idx_memories_updated_at  ON memories(updated_at)
UNIQUE(key, project_id)  -- composite unique constraint
```

---

## 6. API & MCP Architecture

### REST API Endpoints

```mermaid
graph LR
    subgraph "No Auth"
        H[GET /health]
        STATIC[GET /* Dashboard SPA]
    end

    subgraph "Auth Required"
        subgraph "Memories"
            LIST[GET /api/memories]
            CREATE[POST /api/memories]
            GET[GET /api/memories/:key]
            UPDATE[PUT /api/memories/:key]
            DELETE[DELETE /api/memories/:key]
            SEARCH[POST /api/memories/search]
        end
        subgraph "Auth"
            KEYS_LIST[GET /api/auth/keys]
            KEYS_CREATE[POST /api/auth/keys]
            KEYS_REVOKE[DELETE /api/auth/keys/:id]
        end
        subgraph "MCP"
            MCP_HTTP[ALL /mcp]
        end
    end
```

### MCP Tools

| Tool | Description | Params |
|------|-------------|--------|
| `remember` | Store/update memory (upsert) | key, content, category?, importance?, tags?, projectId? |
| `recall` | Get memory by key | key, projectId? |
| `search_memories` | Hybrid semantic + keyword search | query, category?, limit?, projectId? |
| `forget` | Delete memory | key, projectId? |
| `list_memories` | List recent memories | category?, limit?, projectId? |

### MCP Transports

```mermaid
graph TB
    subgraph "stdio Transport"
        CLAUDE[Claude CLI] --> STDIO[stdin/stdout]
        CURSOR[Cursor] --> STDIO
        STDIO --> MCP_SERVER[MCP Server]
    end

    subgraph "HTTP Transport (Streamable HTTP)"
        REMOTE[Remote Client] --> HTTP_AUTH[Auth Middleware]
        HTTP_AUTH --> HTTP_TRANSPORT[StreamableHTTPServerTransport]
        HTTP_TRANSPORT --> MCP_SERVER2[MCP Server]
        HTTP_TRANSPORT --> SESSION[(Session Map)]
    end
```

---

## 7. Authentication & Project Scoping

### Current Auth Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as Auth Middleware
    participant DB as SQLite (api_keys table)

    C->>MW: Authorization: Bearer pndr_xxxxx
    MW->>MW: Extract token, validate format
    MW->>MW: SHA256 hash the token
    MW->>DB: SELECT * FROM api_keys WHERE key_hash = ?
    alt Key found & not expired
        MW->>DB: UPDATE last_used_at = now()
        MW->>MW: Allow request
    else Invalid/expired
        MW-->>C: 401 Unauthorized
    end
```

### API Key Format

```
pndr_<24-byte-random-base64url>
Example: pndr_g9Bo-qAXzzmyP-pHDCQb6uswG7vMWRtk

Storage: SHA256 hash in DB (never stored plaintext)
Display: prefix (first 12 chars) for identification
```

### Project Scoping (Current)

```mermaid
graph TB
    subgraph "User's Account"
        KEY[API Key: pndr_xxx]
        subgraph "Project A"
            MA1[memory: auth/jwt]
            MA2[memory: deploy/config]
        end
        subgraph "Project B"
            MB1[memory: db/schema]
            MB2[memory: api/routes]
        end
        subgraph "No Project"
            MN1[memory: general/notes]
        end
    end

    KEY --> |"projectId=A"| MA1
    KEY --> |"projectId=A"| MA2
    KEY --> |"projectId=B"| MB1
    KEY --> |"projectId=B"| MB2
    KEY --> |"no projectId"| MN1
```

**How it works:**
- API key authenticates the user
- `projectId` parameter scopes memories to a project
- `UNIQUE(key, project_id)` allows same key name in different projects
- SDK/MCP pass `projectId` with every operation
- Dashboard has project selector that filters all views

---

## 8. Dashboard Architecture

### Current Dashboard

```mermaid
graph TB
    subgraph "App State (React useState)"
        VIEW[view: dashboard/memories/categories/keys]
        APIKEY[apiKey: localStorage]
        PROJECT[projectId: localStorage]
        MEMORY[selectedMemory: Memory | null]
    end

    subgraph "Views"
        D[Dashboard<br/>Stats + Charts + MiniTables]
        M[MemoryList<br/>Paginated Table + Detail]
        C[Categories<br/>Grid + Drill-down]
        K[ApiKeys<br/>Create + Revoke]
    end

    subgraph "Sidebar"
        NAV[Navigation]
        PROJ_SEL[Project Selector]
        KEY_INPUT[API Key Input]
    end

    subgraph "Top Bar"
        PROJ_BADGE[Current Project Badge]
    end

    VIEW --> D
    VIEW --> M
    VIEW --> C
    VIEW --> K
    PROJECT --> D
    PROJECT --> M
    PROJECT --> C
    APIKEY --> D
    APIKEY --> M
    APIKEY --> C
    APIKEY --> K
```

### Dashboard Features

| View | Features |
|------|----------|
| **Dashboard** | Animated stat cards (count-up), bar charts (categories, tags), importance grid, mini-tables (recent, most accessed, high priority), clickable memory links |
| **Memories** | Paginated table, category filter, text search, click-to-detail, delete with confirm |
| **Categories** | Grid of 10 categories with counts, drill-down table, clickable rows |
| **API Keys** | Create key, show once + copy, list with prefix, revoke |

---

## 9. Planned: Dynamic Categories

### Problem

Currently categories are hardcoded as an enum:
```
architecture | bug | pattern | config | decision | snippet | debug | workflow | dependency | custom
```

Users can't create custom categories, and AI can't generate new ones.

### Planned Architecture

```mermaid
erDiagram
    CATEGORIES {
        text id PK
        text name "UNIQUE per project"
        text description
        text color "hex color"
        text icon "optional"
        text project_id "nullable (global if null)"
        bool is_system "true for built-in"
        bool is_ai_generated "true if AI created"
        text created_at
    }

    MEMORIES {
        text id PK
        text category_id FK "references categories.id"
        text category "kept for backward compat"
    }

    CATEGORIES ||--o{ MEMORIES : "has"
```

### How Dynamic Categories Work

```mermaid
flowchart TD
    A[New Memory Created] --> B{Category provided?}
    B -->|Yes| C{Category exists?}
    B -->|No| D[AI Auto-Detect]

    C -->|Yes| E[Use existing category]
    C -->|No| F[Create new category]

    D --> G{Match existing category?}
    G -->|Yes, confidence > 0.8| E
    G -->|No| H[AI suggests new category]
    H --> I{Similar to existing?}
    I -->|Yes| J[Map to existing]
    I -->|No| K[Create AI-generated category]

    E --> L[Store Memory]
    F --> L
    J --> L
    K --> L
```

### Category API (Planned)

```
GET    /api/categories                 List all categories
POST   /api/categories                 Create custom category
PUT    /api/categories/:id             Update category
DELETE /api/categories/:id             Delete category (reassign memories)
POST   /api/categories/suggest         AI suggests category for content
```

### MCP Tool Enhancement

```typescript
// New MCP tool
server.tool("list_categories", "List all memory categories with counts", {
  projectId: z.string().optional(),
}, async ({ projectId }) => {
  const categories = await store.listCategories(projectId);
  // Returns: [{name, description, count, isSystem, isAiGenerated}]
});
```

---

## 10. Planned: Enhanced Project System

### Current vs Planned

| Feature | Current | Planned |
|---------|---------|---------|
| Project creation | Implicit (any string) | Explicit (API + Dashboard) |
| Project metadata | None | Name, description, created_at |
| Project listing | Extracted from memories | Dedicated API endpoint |
| Project deletion | N/A | Cascade delete memories |
| Project categories | Global only | Per-project categories |
| Project settings | None | Custom embedder, search config |

### Planned Project Architecture

```mermaid
erDiagram
    PROJECTS {
        text id PK
        text name "display name"
        text slug "URL-friendly, UNIQUE"
        text description
        text created_at
        text updated_at
    }

    MEMORIES {
        text id PK
        text project_id FK "references projects.id"
        text category_id FK "references categories.id"
    }

    CATEGORIES {
        text id PK
        text project_id FK "nullable"
    }

    PROJECTS ||--o{ MEMORIES : "contains"
    PROJECTS ||--o{ CATEGORIES : "has custom"
```

### Project API (Planned)

```
GET    /api/projects                   List all projects
POST   /api/projects                   Create project
GET    /api/projects/:id               Get project details
PUT    /api/projects/:id               Update project
DELETE /api/projects/:id               Delete project + memories
GET    /api/projects/:id/stats         Project statistics
```

### SDK Usage (Planned)

```typescript
import { PonderClient } from '@ponderdb/sdk';

const client = new PonderClient({
  baseUrl: 'http://127.0.0.1:7437',
  apiKey: 'pndr_xxx',
  projectId: 'my-project',  // Scopes all operations
});

// All operations scoped to project
await client.remember({ key: 'auth/jwt', content: '...' });
const mem = await client.recall('auth/jwt');
```

### MCP Config (Planned)

```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "npx",
      "args": ["ponderdb-server", "mcp"],
      "env": {
        "PONDER_API_KEY": "pndr_xxx",
        "PONDER_PROJECT_ID": "my-project"
      }
    }
  }
}
```

---

## 11. Implementation Roadmap

### Phase 1: Core Improvements (Current Sprint)

```mermaid
gantt
    title PonderDB Implementation Plan
    dateFormat  YYYY-MM-DD
    section Dashboard
    Animated dashboard + project selector    :done, d1, 2025-05-18, 1d
    Remove search page                       :done, d2, 2025-05-18, 1d
    Clickable memory links                   :done, d3, 2025-05-18, 1d

    section Dynamic Categories
    Categories DB table                      :c1, 2025-05-19, 2d
    Categories CRUD API                      :c2, after c1, 2d
    AI auto-categorization upgrade           :c3, after c2, 2d
    Dashboard category management            :c4, after c3, 2d
    MCP list_categories tool                 :c5, after c2, 1d

    section Project System
    Projects DB table                        :p1, 2025-05-19, 1d
    Projects CRUD API                        :p2, after p1, 2d
    Dashboard project CRUD                   :p3, after p2, 2d
    SDK projectId default                    :p4, after p2, 1d
    MCP env-based project scoping            :p5, after p2, 1d
```

### Phase 2: Enhanced Features

- Memory versioning (history, diff, restore)
- Import/export (CLAUDE.md, .cursorrules, JSON)
- Stale memory detection
- Deduplication
- Memory quality/confidence scores

### Phase 3: Scale & Distribution

- PostgreSQL adapter (cloud mode)
- Cloud sync (local → cloud)
- Team/shared memories
- Multi-user auth (OAuth)

---

## Embedding Architecture

### Current

```mermaid
graph TB
    subgraph "Primary: TransformerEmbeddingProvider"
        MODEL[Xenova/all-MiniLM-L6-v2]
        ONNX[ONNX Runtime]
        DIM[384 dimensions]
        Q8[8-bit quantization]
    end

    subgraph "Fallback: LocalEmbeddingProvider"
        HASH[Hash-based TF-IDF]
        DET[Deterministic]
        FAST[No model download]
    end

    INPUT[Text Input] --> MODEL
    MODEL --> ONNX --> DIM
    MODEL -.fail.-> HASH
    HASH --> DIM
```

### Search Quality

| Search Type | Method | Score Weight | Best For |
|-------------|--------|-------------|----------|
| Semantic | sqlite-vec KNN (cosine) | 1.0x | Conceptual similarity |
| Keyword | SQLite LIKE on content+key | 0.7x | Exact phrases |
| Hybrid | Merge + deduplicate + sort | Combined | Default (best results) |

---

## Security Architecture

```mermaid
graph TB
    subgraph "Client"
        REQ[HTTP Request]
        KEY[API Key: pndr_xxx]
    end

    subgraph "Server"
        MW[Auth Middleware]
        HASH_CHECK[SHA256 Hash + DB Lookup]
        EXPIRY[Check Expiration]
        UPDATE[Update last_used_at]
    end

    subgraph "Storage"
        DB[(api_keys table)]
        HASH_STORE[key_hash: SHA256]
    end

    REQ --> |Bearer pndr_xxx| MW
    MW --> HASH_CHECK
    HASH_CHECK --> DB
    DB --> EXPIRY
    EXPIRY --> |Valid| UPDATE
    EXPIRY --> |Expired/Invalid| REJECT[401 Unauthorized]
    UPDATE --> ALLOW[Request Proceeds]
```

**Key Security Properties:**
- Keys never stored in plaintext (SHA256 hashed)
- Key format: `pndr_` prefix for easy identification
- Auto-generated on first server start
- Printed once to console (user must save)
- `last_used_at` tracking for audit
- Optional expiration support
