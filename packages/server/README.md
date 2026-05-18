# @ponderdb/server

PonderDB server — Hono REST API + MCP server + web dashboard. The main package for running PonderDB.

## Installation

```bash
npm install -g @ponderdb/server
ponderdb-server
```

Or from source:

```bash
git clone https://github.com/ponderdb/ponderdb.git
cd ponderdb && npm run setup
npm run dev
```

## Quick Start

```bash
ponderdb-server
# Server running at http://127.0.0.1:7437
# API key auto-generated on first start (printed to console)
# Dashboard at http://127.0.0.1:7437
```

## MCP Integration

### Claude Code / Cursor / Windsurf / Copilot

```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "ponderdb-server",
      "args": ["mcp"],
      "env": {
        "PONDER_PROJECT_ID": "my-project"
      }
    }
  }
}
```

### MCP over HTTP

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

## MCP Tools

| Tool | Description |
|------|-------------|
| `remember` | Store/update a memory (upsert, auto-categorized) |
| `recall` | Retrieve memory by key |
| `search_memories` | Semantic + keyword hybrid search |
| `forget` | Delete a memory |
| `list_memories` | List recent memories |
| `list_categories` | List all categories with counts |

## REST API

All endpoints require `Authorization: Bearer pndr_xxx` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/api/memories` | List memories |
| `POST` | `/api/memories` | Create memory |
| `GET` | `/api/memories/:key` | Get by key |
| `PUT` | `/api/memories/:key` | Update memory |
| `DELETE` | `/api/memories/:key` | Delete memory |
| `POST` | `/api/memories/search` | Hybrid search |
| `GET/POST/PUT/DELETE` | `/api/categories` | Category CRUD |
| `GET/POST/PUT/DELETE` | `/api/projects` | Project CRUD |
| `GET/POST/DELETE` | `/api/auth/keys` | API key management |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PONDER_PORT` | `7437` | Server port |
| `PONDER_HOST` | `127.0.0.1` | Server host |
| `PONDER_DATA_DIR` | `~/.ponderdb` | Data directory |
| `PONDER_API_KEY_REQUIRED` | `true` | Require API key |
| `PONDER_PROJECT_ID` | _(none)_ | Default project for MCP |
| `PONDER_EMBEDDER` | `transformer` | `transformer` or `local` |

## Web Dashboard

Built-in at `http://127.0.0.1:7437` with:

- Dashboard with animated stats and charts
- Memory browser with filtering and detail view
- Dynamic category management (create, edit, delete)
- Project management (create, edit, delete with safety checks)
- API key management (create, copy, revoke)
- Project selector scoping all views
- Token usage tracking per memory

## Embedding Models

| Provider | Model | Dimensions | Download |
|----------|-------|------------|----------|
| `transformer` (default) | all-MiniLM-L6-v2 | 384 | ~80MB on first use |
| `local` (fallback) | Hash-based TF-IDF | 384 | None |

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
