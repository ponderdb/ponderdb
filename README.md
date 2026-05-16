<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./assets/logo.svg">
    <img alt="PonderDB" src="./assets/logo.svg" width="360">
  </picture>
</p>

<p align="center">
  <strong>Universal AI Agent Memory Server</strong> — One install, every AI tool gets persistent memory.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#connect-your-ai-tools">Integrations</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#configuration">Config</a> &bull;
  <a href="#roadmap">Roadmap</a>
</p>

---

PonderDB is a centralized memory server that gives all your AI coding tools (Claude, Cursor, Copilot, ChatGPT, Gemini, and more) shared long-term project memory. Memories are stored locally, searched semantically, and accessible via MCP protocol, REST API, CLI, or SDK.

## Why PonderDB?

AI tools forget everything between sessions. You re-explain your architecture, your conventions, your past decisions — every single time. PonderDB fixes this.

- **One memory, every tool** — Claude, Cursor, Copilot, ChatGPT, Gemini CLI, JetBrains, and more share the same memory via MCP
- **Developer-specific** — Optimized for code patterns, architecture decisions, bug fixes, configs, and workflows
- **Local-first** — Your data stays on your machine. No internet required.
- **Semantic search** — Find memories by meaning, not just keywords
- **Zero config** — Install, start, connect. That's it.

## Quick Start

```bash
# Clone and setup (installs dependencies + builds all packages)
git clone https://github.com/ponderdb/ponderdb.git
cd ponderdb
npm run setup

# Start the server
npm run dev
```

PonderDB runs at `http://127.0.0.1:7437` by default.

## Connect Your AI Tools

### Claude (Claude Code / Claude Desktop)

Add to your MCP config:

```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "node",
      "args": ["<path-to-ponderdb>/packages/server/dist/bin.js", "mcp"]
    }
  }
}
```

Claude will automatically use `remember`, `recall`, `search_memories`, `forget`, and `list_memories` tools.

### Cursor / Windsurf / Copilot (VS Code)

Same MCP config — add to your tool's MCP settings. All MCP-compatible tools work out of the box.

### REST API

```bash
# Store a memory
curl -X POST http://127.0.0.1:7437/api/memories \
  -H "Content-Type: application/json" \
  -d '{"key": "auth/jwt-config", "content": "JWT uses RS256 with 15min expiry"}'

# Search memories
curl -X POST http://127.0.0.1:7437/api/memories/search \
  -H "Content-Type: application/json" \
  -d '{"query": "how does authentication work"}'

# Recall a memory
curl http://127.0.0.1:7437/api/memories/auth/jwt-config
```

### CLI

```bash
# Store
ponder remember "auth/jwt-config" "JWT uses RS256, 15min expiry"

# Recall
ponder recall "auth/jwt-config"

# Search
ponder search "how does authentication work"

# List
ponder list --category architecture
```

### SDK

```typescript
import { PonderClient } from "@ponderdb/sdk";

const ponder = new PonderClient({ baseUrl: "http://127.0.0.1:7437" });

await ponder.remember({
  key: "auth/jwt-config",
  content: "JWT uses RS256 with 15min expiry",
});

const results = await ponder.search({ query: "authentication" });
```

## Architecture

```
packages/
  core/          — Types, interfaces, storage abstractions, utilities
  sqlite-store/  — SQLite storage adapter (local-first)
  server/        — Hono REST API + MCP server
  sdk/           — TypeScript client SDK
  cli/           — Terminal interface
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `remember` | Store a memory (auto-categorized, with embeddings) |
| `recall` | Retrieve a specific memory by key |
| `search_memories` | Semantic + keyword hybrid search |
| `forget` | Delete a memory |
| `list_memories` | List memories with optional filters |

### Memory Categories

Memories are auto-categorized: `architecture`, `bug`, `pattern`, `config`, `decision`, `snippet`, `debug`, `workflow`, `dependency`, `custom`.

## Configuration

Environment variables or `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `PONDER_PORT` | `7437` | Server port |
| `PONDER_HOST` | `127.0.0.1` | Server host |
| `PONDER_DATA_DIR` | `~/.ponderdb` | Data directory |
| `PONDER_API_KEY_REQUIRED` | `true` | Require API key for REST API |

## Development

```bash
npm run setup     # Install deps + build all packages
npm run dev       # Start dev server with hot reload
npm run build     # Build all packages
npm run lint      # Lint all source files
npm run lint:fix  # Auto-fix lint issues
npm run format    # Format with Prettier
npm run clean     # Remove build artifacts
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 22 (LTS) |
| API Framework | Hono |
| Storage | SQLite (better-sqlite3) |
| MCP | @modelcontextprotocol/sdk |
| Language | TypeScript 5.x |
| Linter | ESLint 9 + Prettier |
| Package Manager | npm workspaces |

## Roadmap

- [ ] Real embedding models (BGE / OpenAI)
- [ ] sqlite-vec for native vector search
- [ ] Cloud sync mode
- [ ] Web dashboard
- [ ] Team/shared memories
- [ ] VS Code extension
- [ ] Browser extension

## License

MIT
