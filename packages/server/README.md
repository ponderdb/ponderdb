# @ponderdb/server

Persistent memory server for AI tools — one install, every AI tool remembers.

## Install & Run

```bash
npm install -g @ponderdb/server
ponderdb-server
```

Opens at **http://127.0.0.1:7437** with REST API, MCP server, and web dashboard.
API key auto-generated on first start — save it from the console output.

## Connect Your AI Tools

Set `PONDER_PROJECT_ID` to scope memories to your project.

**Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "ponderdb-server",
      "args": ["mcp"],
      "env": { "PONDER_PROJECT_ID": "my-project" }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "ponderdb": {
      "command": "ponderdb-server",
      "args": ["mcp"],
      "env": { "PONDER_PROJECT_ID": "my-project" }
    }
  }
}
```

**Copilot / Windsurf / JetBrains / Gemini CLI** — same pattern.

**MCP over HTTP** (remote access):
```json
{
  "mcpServers": {
    "ponderdb": {
      "type": "http",
      "url": "http://127.0.0.1:7437/mcp",
      "headers": { "Authorization": "Bearer pndr_YOUR_KEY" }
    }
  }
}
```

## Getting Your Project ID

1. Open `http://127.0.0.1:7437` and enter your API key
2. Go to **Projects** → create a project
3. The **slug** is your project ID (e.g. `my-backend-api`)

## Dashboard

Served at `http://127.0.0.1:7437` — no extra setup:

- Browse and search memories
- Manage categories and projects
- Create and revoke API keys
- View stats, charts, and token usage

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PONDER_PORT` | `7437` | Server port |
| `PONDER_HOST` | `127.0.0.1` | Bind address |
| `PONDER_DATA_DIR` | `~/.ponderdb` | Data directory |
| `PONDER_PROJECT_ID` | — | Default project for MCP |
| `PONDER_API_KEY_REQUIRED` | `true` | Require API key |

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
