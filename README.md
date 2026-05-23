<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/logo.svg">
    <img alt="PonderDB" src="./assets/logo.svg" width="360">
  </picture>
</p>

<p align="center">
  <strong>Universal AI Agent Memory Server</strong><br>
  One install, every AI tool gets persistent memory.
</p>

<p align="center">
  <a href="https://github.com/ponderdb/ponderdb/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node.js"></a>
  <a href="https://github.com/ponderdb/ponderdb"><img src="https://img.shields.io/github/stars/ponderdb/ponderdb?style=social" alt="Stars"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#connect-your-ai-tools">Integrations</a> &bull;
  <a href="#authentication">Auth</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#configuration">Config</a> &bull;
  <a href="#roadmap">Roadmap</a>
</p>

---

## The Problem

AI tools forget everything between sessions. You re-explain your architecture, conventions, past decisions, bug fixes — every single time. Context is lost. Work is repeated.

## The Solution

PonderDB gives **all** your AI tools a shared, persistent memory. One server, every tool remembers.

```
Claude ──┐
Cursor ──┤
Copilot ─┤──▶ PonderDB ──▶ SQLite (local) ──▶ Your memories, searchable by meaning
Gemini ──┤
ChatGPT ─┘
```

### Key Features

- **Cross-tool memory** — Claude, Cursor, Copilot, ChatGPT, Gemini CLI, JetBrains all share the same memory via MCP
- **Developer-specific** — Optimized for code patterns, architecture decisions, bug fixes, configs, workflows
- **Local-first** — Data stays on your machine. No internet required. No cloud dependency.
- **Semantic search** — Find memories by meaning, not just keywords
- **Auto-categorized** — Memories tagged as `architecture`, `bug`, `pattern`, `config`, `decision`, `snippet`, etc.
- **Secure by default** — API key auth for REST API, auto-generated on first start
- **MCP native** — Works with any MCP-compatible tool out of the box (stdio + HTTP)
- **Web dashboard** — Browse memories, search, manage API keys at `localhost:7437`

---

## Quick Start

### From Source

```bash
git clone https://github.com/ponderdb/ponderdb.git
cd ponderdb
npm run setup    # installs deps + builds all packages

npm run dev      # starts server + dashboard at http://127.0.0.1:7437
```

### From npm (coming soon)

```bash
# Server (includes MCP + REST API)
npm install -g @ponderdb/server
ponderdb-server

# CLI (optional)
npm install -g @ponderdb/cli
ponder remember "auth/jwt" "RS256, 15min expiry"
```

On first start, PonderDB auto-generates an API key and prints it to the console:

```
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │  Your API key (save this — shown only once):        │
  │  pndr_xK9mR2vT8pL1qN7wF3jB5cY6aD8eH0iJ2kM4nP6    │
  │                                                     │
  └─────────────────────────────────────────────────────┘

  PonderDB server running at http://127.0.0.1:7437
  Auth: enabled
```

---

## Connect Your AI Tools

### Claude Code

Add to `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "node",
      "args": ["/path/to/ponderdb/packages/server/dist/bin.js", "mcp"]
    }
  }
}
```

> MCP uses stdio transport (stdin/stdout). No URL, no token, no network. The AI tool spawns PonderDB as a child process — only that process can communicate with it. Secure by design.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "node",
      "args": ["/path/to/ponderdb/packages/server/dist/bin.js", "mcp"]
    }
  }
}
```

### Cursor

Add to Cursor Settings > MCP Servers:

```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "node",
      "args": ["/path/to/ponderdb/packages/server/dist/bin.js", "mcp"]
    }
  }
}
```

### GitHub Copilot (VS Code)

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "ponderdb": {
      "command": "node",
      "args": ["/path/to/ponderdb/packages/server/dist/bin.js", "mcp"]
    }
  }
}
```

### Windsurf / Continue.dev / JetBrains / Gemini CLI

Same pattern — add MCP server config pointing to the PonderDB binary with `mcp` argument. All MCP-compatible tools work identically.

### MCP over HTTP (Streamable HTTP)

For tools that support HTTP-based MCP (instead of stdio), PonderDB exposes an MCP endpoint at `/mcp` when running in HTTP mode.

Add to your MCP client config:

```json
{
  "mcpServers": {
    "ponderdb": {
      "type": "http",
      "url": "http://127.0.0.1:7437/mcp",
      "headers": {
        "Authorization": "Bearer pndr_YOUR_KEY"
      }
    }
  }
}
```

> **Auth:** The HTTP MCP endpoint requires a valid PonderDB API key via the `Authorization` header (same key used for REST API). This replaces the need for session-based auth — your API key authenticates every request.

This is useful for remote access, ChatGPT integrations, or when stdio is not available. The HTTP MCP endpoint is always available when the server is running — no extra config needed.

### After npm publish (future)

```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "ponderdb-server",
      "args": ["mcp"]
    }
  }
}
```

---

## MCP Tools

Once connected, your AI tool automatically gets these tools:

| Tool | Description | Example |
|------|-------------|---------|
| `remember` | Store a memory (auto-categorized, with embeddings, optional `isGlobal`) | "Remember that auth uses JWT RS256" |
| `recall` | Retrieve a specific memory by key | "Recall the JWT config" |
| `search_memories` | Semantic + keyword hybrid search (includes global memories) | "Search for anything about authentication" |
| `forget` | Delete a memory | "Forget the old deploy process" |
| `list_memories` | List memories with optional filters (includes global memories) | "List all architecture decisions" |
| `list_categories` | List all categories (system + custom) with counts | "What categories exist?" |
| `create_category` | Create a custom memory category | "Create a category called api-notes" |
| `update_category` | Update a custom category's name, description, or color | "Rename category api-notes to api-docs" |
| `delete_category` | Delete a custom category (memories reassigned to `custom`) | "Delete the api-notes category" |
| `list_projects` | List all memory projects | "What projects exist?" |
| `create_project` | Create a new project to organize memories | "Create a project called My Backend API" |
| `update_project` | Update a project's name or description | "Update the backend project description" |
| `delete_project` | Delete a project and all its memories (requires confirmation) | "Delete the old-project project" |
| `tag_memory` | Add or remove tags on an existing memory | "Add tags auth and security to auth/jwt" |

The AI tool decides when to remember and recall. You don't need to do anything manually — just use your AI tool normally and it will build up project memory over time.

---

## Authentication

### MCP Mode (stdio)
No auth needed. MCP runs as a child process over stdin/stdout — only the parent AI tool can communicate with it. Inherently secure.

### REST API Mode (HTTP)
API key required by default. Key auto-generated on first start.

```bash
# Use the key in requests
curl -H "Authorization: Bearer pndr_YOUR_KEY" \
  http://127.0.0.1:7437/api/memories

# Generate additional keys
curl -X POST http://127.0.0.1:7437/api/auth/keys \
  -H "Authorization: Bearer pndr_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-script"}'

# List keys (shows prefix only)
curl -H "Authorization: Bearer pndr_YOUR_KEY" \
  http://127.0.0.1:7437/api/auth/keys

# Revoke a key
curl -X DELETE -H "Authorization: Bearer pndr_YOUR_KEY" \
  http://127.0.0.1:7437/api/auth/keys/<key-id>

# Disable auth (not recommended)
PONDER_API_KEY_REQUIRED=false npm run dev
```

---

## Projects

Projects let you organize memories into separate scopes. Each project gets its own isolated set of memories and custom categories.

### Creating a Project

**Via Dashboard:** Go to the Projects page and click "+ New Project". Enter a name — a URL-friendly slug is auto-generated (e.g. "My Backend API" → `my-backend-api`).

**Via REST API:**
```bash
curl -X POST http://127.0.0.1:7437/api/projects \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Backend API", "description": "Backend service memories"}'
```

Response includes the `slug` — this is your project ID:
```json
{
  "id": "a1b2c3...",
  "name": "My Backend API",
  "slug": "my-backend-api",
  "description": "Backend service memories"
}
```

### Getting Your Project ID

Your project ID is the `slug` field. Find it via:

- **Dashboard:** Projects page shows the slug under each project name
- **API:** `GET /api/projects` returns all projects with their slugs
- **Project selector:** The sidebar dropdown value is the slug

### Using Project ID with MCP

Set `PONDER_PROJECT_ID` in your MCP config to scope all AI tool operations to a project:

**Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "node",
      "args": ["/path/to/ponderdb/packages/server/dist/bin.js", "mcp"],
      "env": {
        "PONDER_PROJECT_ID": "my-backend-api"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "node",
      "args": ["/path/to/ponderdb/packages/server/dist/bin.js", "mcp"],
      "env": {
        "PONDER_PROJECT_ID": "my-backend-api"
      }
    }
  }
}
```

**Any MCP client (stdio)** — add `PONDER_PROJECT_ID` to the `env` block. All `remember`, `recall`, `search_memories`, `forget`, and `list_memories` calls will be scoped to that project automatically.

**HTTP MCP** — use the `X-Project-ID` header to scope all operations to a project:
```json
{
  "mcpServers": {
    "ponderdb": {
      "type": "http",
      "url": "http://127.0.0.1:7437/mcp",
      "headers": {
        "Authorization": "Bearer pndr_YOUR_KEY",
        "X-Project-ID": "my-backend-api"
      }
    }
  }
}
```

> **Priority:** `X-Project-ID` header > `PONDER_PROJECT_ID` env var > per-call `projectId` param. If none set, memories are stored globally (no project scope).

### Using Project ID with SDK

```typescript
import { PonderClient } from "@ponderdb/sdk";

const ponder = new PonderClient({
  baseUrl: "http://127.0.0.1:7437",
  apiKey: "pndr_YOUR_KEY",
  projectId: "my-backend-api",  // All operations scoped to this project
});

// These are all scoped to "my-backend-api"
await ponder.remember({ key: "auth/jwt", content: "RS256, 15min expiry" });
const mem = await ponder.recall("auth/jwt");
await ponder.search({ query: "authentication" });
```

### Using Project ID with CLI

```bash
export PONDER_PROJECT_ID=my-backend-api

ponder remember "auth/jwt" "RS256, 15min expiry" --project my-backend-api
ponder recall "auth/jwt" --project my-backend-api
ponder list --project my-backend-api
```

### Project API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects` | List all projects with memory counts |
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects/:slug` | Get project details |
| `PUT` | `/api/projects/:id` | Update project name/description |
| `DELETE` | `/api/projects/:id` | Delete project (cascades: all memories, vectors, categories) |
| `GET` | `/api/projects/:slug/stats` | Per-project statistics |

---

## Web Dashboard

PonderDB includes a built-in web dashboard at `http://127.0.0.1:7437` when running in HTTP mode.

**Features:**
- **Dashboard** — Animated stats (total memories, categories, tags, accesses, tokens), bar charts, clickable mini-tables
- **Memory Browser** — List, filter by category, paginate, click to detail view with token count
- **Categories** — Dynamic categories (system + custom + AI-generated), create/edit/delete with color picker
- **Projects** — Create and manage projects, view memory counts, cascade delete
- **API Key Management** — Create, view, copy, and revoke API keys
- **Project Selector** — Filter all views by project via sidebar dropdown

The dashboard is served as static files from the same Hono server — no extra setup needed. Just start the server and open `http://127.0.0.1:7437` in your browser.

For development, run `npm run dev --workspace=@ponderdb/dashboard` for hot-reload (proxies API to port 7437).

---

## REST API

All endpoints require `Authorization: Bearer pndr_xxx` header (unless auth is disabled).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `ALL` | `/mcp` | MCP over HTTP endpoint (API key auth required) |
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/api/memories` | List memories (paginated, filterable) |
| `POST` | `/api/memories` | Create a memory |
| `GET` | `/api/memories/:key` | Get memory by key |
| `PUT` | `/api/memories/:key` | Update a memory |
| `DELETE` | `/api/memories/:key` | Delete a memory |
| `POST` | `/api/memories/search` | Semantic + keyword search |
| `POST` | `/api/auth/keys` | Generate new API key |
| `GET` | `/api/auth/keys` | List API keys |
| `DELETE` | `/api/auth/keys/:id` | Revoke an API key |
| `GET` | `/api/categories` | List categories (system + custom) |
| `POST` | `/api/categories` | Create custom category |
| `PUT` | `/api/categories/:id` | Update category |
| `DELETE` | `/api/categories/:id` | Delete category (reassigns memories) |
| `POST` | `/api/categories/suggest` | AI suggest category for content |
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects/:slug` | Get project details |
| `PUT` | `/api/projects/:id` | Update project |
| `DELETE` | `/api/projects/:id` | Delete project (cascade) |
| `GET` | `/api/projects/:slug/stats` | Project statistics |

### Examples

```bash
API_KEY="pndr_YOUR_KEY"

# Create memory
curl -X POST http://127.0.0.1:7437/api/memories \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "auth/jwt-config",
    "content": "JWT uses RS256 algorithm with 15min token expiry and 7-day refresh tokens",
    "tags": ["auth", "jwt", "security"]
  }'

# Search
curl -X POST http://127.0.0.1:7437/api/memories/search \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "how does authentication work", "limit": 5}'

# Recall
curl -H "Authorization: Bearer $API_KEY" \
  http://127.0.0.1:7437/api/memories/auth/jwt-config

# List by category
curl -H "Authorization: Bearer $API_KEY" \
  "http://127.0.0.1:7437/api/memories?category=architecture&limit=10"

# Delete
curl -X DELETE -H "Authorization: Bearer $API_KEY" \
  http://127.0.0.1:7437/api/memories/auth/jwt-config
```

---

## CLI

```bash
# Set API key (or pass --api-key flag)
export PONDER_API_KEY=pndr_YOUR_KEY
export PONDER_URL=http://127.0.0.1:7437  # default

# Store a memory
ponder remember "auth/jwt-config" "JWT uses RS256, 15min expiry" \
  --category config --tags auth,jwt

# Recall by key
ponder recall "auth/jwt-config"

# Semantic search
ponder search "how does authentication work" --limit 5

# List memories
ponder list --category architecture --limit 20

# Delete
ponder forget "auth/jwt-config"

# Server stats
ponder stats
```

---

## SDK

```typescript
import { PonderClient } from "@ponderdb/sdk";

const ponder = new PonderClient({
  baseUrl: "http://127.0.0.1:7437",
  apiKey: "pndr_YOUR_KEY",
  projectId: "my-backend-api",  // optional — scopes all operations
});

// Store
await ponder.remember({
  key: "auth/jwt-config",
  content: "JWT uses RS256 with 15min expiry",
  category: "config",
  tags: ["auth", "jwt"],
});

// Recall
const memory = await ponder.recall("auth/jwt-config");

// Search
const results = await ponder.search({
  query: "authentication setup",
  limit: 5,
});

// List
const list = await ponder.list({
  category: "architecture",
  sortBy: "updatedAt",
});

// Delete
await ponder.forget("auth/jwt-config");
```

---

## Architecture

```
ponderdb/
├── packages/
│   ├── core/           — Types, interfaces, storage abstractions, utilities
│   ├── sqlite-store/   — SQLite + better-sqlite3 storage adapter
│   ├── server/         — Hono REST API + MCP server (stdio + HTTP)
│   ├── dashboard/      — React + Vite web dashboard
│   ├── sdk/            — TypeScript client SDK
│   └── cli/            — Terminal interface (ponder command)
├── research/           — Design documents and architecture research
└── assets/             — Logo and branding
```

### How It Works

```
┌─────────────────────────────────────────────────┐
│                   AI Tools                       │
│  Claude | Cursor | Copilot | Gemini | ChatGPT   │
└──────────────────┬──────────────────────────────┘
                   │ MCP (stdio) or REST API (HTTP)
┌──────────────────▼──────────────────────────────┐
│              PonderDB Server                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ MCP      │  │ REST API  │  │ Dashboard    │  │
│  │stdio+HTTP│  │ (Hono)    │  │ (React)      │  │
│  └────┬─────┘  └─────┬─────┘  └──────────────┘  │
│       │               │                          │
│  ┌────▼───────────────▼─────┐                    │
│  │     Memory Service        │                    │
│  │  - Auto-categorize        │                    │
│  │  - Generate embeddings    │                    │
│  │  - Hybrid search          │                    │
│  └────────────┬─────────────┘                    │
│  ┌────────────▼─────────────┐                    │
│  │   SQLite + Embeddings     │                    │
│  │   ~/.ponderdb/ponder.db   │                    │
│  └──────────────────────────┘                    │
└──────────────────────────────────────────────────┘
```

### Memory Categories

PonderDB ships with 10 system categories. You can also create custom categories via the dashboard or API (`POST /api/categories`). Memories are auto-categorized based on content:

| Category | Detected When Content Contains |
|----------|-------------------------------|
| `architecture` | design, structure, diagram, system |
| `bug` | bug, fix, error, crash, exception |
| `pattern` | pattern, convention, style, naming |
| `config` | config, env, setting, option |
| `decision` | decision, chose, tradeoff, why |
| `snippet` | snippet, code, function, template |
| `debug` | debug, log, trace, inspect |
| `workflow` | workflow, process, pipeline, deploy |
| `dependency` | dependency, package, library, version |
| `custom` | everything else |

---

## Configuration

Environment variables or `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `PONDER_PORT` | `7437` | Server port |
| `PONDER_HOST` | `127.0.0.1` | Server host |
| `PONDER_DATA_DIR` | `~/.ponderdb` | Data directory (SQLite DB stored here) |
| `PONDER_API_KEY_REQUIRED` | `true` | Require API key for REST API |
| `PONDER_PROJECT_ID` | _(none)_ | Default project ID for MCP operations |
| `PONDER_EMBEDDER` | `transformer` | Embedding provider (`transformer` or `local`) |

---

## Development

```bash
npm run setup        # Install deps + build all packages (single command)
npm run dev          # Start dev server with hot reload
npm run build        # Build all packages
npm run lint         # Lint all source files
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format with Prettier
npm run format:check # Check formatting
npm run clean        # Remove build artifacts
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js >= 22 (LTS) | Stable, native fetch, modern ES |
| API | [Hono](https://hono.dev) | Ultrafast, lightweight, 14KB |
| Storage | [SQLite](https://sqlite.org) (better-sqlite3) | Zero config, local-first, reliable |
| MCP | [@modelcontextprotocol/sdk](https://modelcontextprotocol.io) | Standard protocol for AI tool integration |
| Language | TypeScript 5.x | Type safety across all packages |
| Linter | ESLint 9 + Prettier | Code quality + consistent formatting |
| Monorepo | npm workspaces | Simple, no extra tooling |

---

## Roadmap

### Phase 1 — MVP ✅
- [x] Monorepo scaffold with npm workspaces
- [x] Core types, interfaces, storage abstractions
- [x] SQLite storage adapter (local-first)
- [x] Hono REST API server
- [x] MCP server (stdio transport)
- [x] MCP over HTTP (Streamable HTTP transport)
- [x] Web dashboard (memory browser, categories, projects, API key management)
- [x] API key authentication
- [x] TypeScript SDK
- [x] CLI tool
- [x] sqlite-vec for native vector search
- [x] Transformer embeddings (all-MiniLM-L6-v2)
- [x] Project scoping (`projectId` across all layers)
- [x] Global memories (`isGlobal` — accessible across all projects)
- [x] Custom styled dashboard (full-width layout, custom dropdowns, setup screen)
- [ ] Real embedding models (BGE / OpenAI)
- [ ] npm publish (`@ponderdb/server`, `@ponderdb/cli`, `@ponderdb/sdk`)

### Phase 2 — Cloud (in progress)
- [x] Multi-user data model (User type, `userId` scoping on projects + API keys)
- [x] Auth middleware with user context extraction
- [ ] PostgreSQL + pgvector storage adapter (`@ponderdb/pg-store`)
- [ ] Google + GitHub OAuth login
- [ ] JWT session management for web dashboard
- [ ] Cloud sync (local <-> cloud)
- [ ] Team/shared memories
- [ ] Hosted service at ponderdb.dev

### Phase 3 — Polish
- [ ] VS Code extension
- [ ] Browser extension
- [ ] Python SDK
- [ ] Import from CLAUDE.md, .cursorrules, etc.
- [ ] Memory versioning and history

### Phase 4 — Scale
- [ ] Multi-region deployment
- [ ] Enterprise features (SSO, audit logs, zero-knowledge encryption)
- [ ] Memory marketplace
- [ ] AI-powered suggestions and auto-learning

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) — PonderDB is free and open source.
