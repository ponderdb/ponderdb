<p align="center">
  <img src="../../assets/icon.png" alt="PonderDB" width="80">
</p>

<h1 align="center">@ponderdb/cli</h1>

<p align="center">
  <strong>Terminal interface for PonderDB — manage AI agent memories from command line.</strong>
</p>

<p align="center">
  <a href="https://github.com/ponderdb/ponderdb/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/version-0.3.0-brightgreen.svg" alt="Version">
</p>

---

## Install

```bash
npm install -g @ponderdb/cli
```

Requires a running [PonderDB server](https://www.npmjs.com/package/@ponderdb/server).

## Setup

```bash
export PONDER_URL=http://127.0.0.1:7437   # default
export PONDER_API_KEY=pndr_YOUR_KEY
```

## Commands

### Core Memory Operations

#### `ponder remember` — Store a memory

```bash
ponder remember <key> <content> [options]

# Examples
ponder remember "auth/jwt" "RS256, 15min expiry, refresh 7d"
ponder remember "deploy/aws" "Use t3.medium, us-east-1" --tags deploy,aws
ponder remember "db/schema" "Users table has soft delete" --category architecture
ponder remember "api/rate-limit" "100 req/min per key" --project my-api --global
```

| Option | Description |
|--------|-------------|
| `-c, --category` | Memory category |
| `-i, --importance` | Importance level |
| `-t, --tags` | Comma-separated tags |
| `-p, --project` | Project ID |
| `-g, --global` | Accessible across all projects |

#### `ponder recall` — Retrieve a memory by key

```bash
ponder recall <key> [options]

# Example
ponder recall "auth/jwt"
ponder recall "deploy/aws" --project my-api
```

#### `ponder search` — Semantic search

```bash
ponder search <query> [options]

# Examples
ponder search "how does authentication work"
ponder search "database migrations" --category code --limit 10
ponder search "deploy" --project my-api
```

| Option | Description |
|--------|-------------|
| `-c, --category` | Filter by category |
| `-l, --limit` | Max results (default: 5) |
| `-p, --project` | Project ID |

#### `ponder list` — List all memories

```bash
ponder list [options]

# Examples
ponder list
ponder list --category config --limit 50
ponder list --project my-api
```

#### `ponder update` — Update an existing memory

```bash
ponder update <key> [options]

# Examples
ponder update "auth/jwt" --content "RS256, 30min expiry, refresh 14d"
ponder update "deploy/aws" --tags deploy,aws,production
ponder update "db/schema" --category architecture --importance high
```

| Option | Description |
|--------|-------------|
| `-C, --content` | New content |
| `-c, --category` | New category |
| `-i, --importance` | New importance level |
| `-t, --tags` | New comma-separated tags |
| `-p, --project` | Project ID |

#### `ponder forget` — Delete a memory

```bash
ponder forget <key> [options]

# Example
ponder forget "old/outdated-info"
ponder forget "temp/scratch" --project my-api
```

---

### Version History

#### `ponder history` — View version history

```bash
ponder history <key> [options]

# Example
ponder history "auth/jwt"
```

Shows all previous versions of a memory with timestamps and content previews.

#### `ponder restore` — Restore a previous version

```bash
ponder restore <key> <version> [options]

# Example
ponder restore "auth/jwt" 2
ponder restore "deploy/aws" 1 --project my-api
```

---

### Export

#### `ponder export` — Export memories

```bash
ponder export [options]

# Examples
ponder export                                    # JSON to stdout
ponder export --format markdown --output backup.md
ponder export --project my-api --format json -o api-memories.json
ponder export --category code --format markdown
```

| Option | Description |
|--------|-------------|
| `-f, --format` | `json` or `markdown` (default: json) |
| `-p, --project` | Project ID |
| `-c, --category` | Filter by category |
| `-o, --output` | Write to file |

---

### Projects

```bash
ponder projects list                             # List all projects
ponder projects create "My API" --slug my-api    # Create project
ponder projects delete <id>                      # Delete project + memories
```

---

### Categories

```bash
ponder categories                                # List categories with counts
ponder categories --project my-api               # Per-project categories
```

---

### API Keys

```bash
ponder keys list                                 # List keys (prefix only)
ponder keys create "laptop"                      # Create new key
ponder keys delete <id>                          # Delete a key
```

---

### Server Info

```bash
ponder stats                                     # Memory count + server version
ponder --version                                 # CLI version
```

---

### Sync

```bash
ponder sync                                      # Pull from cloud
ponder sync --status                             # Show sync status
```

---

### Import

```bash
ponder import <file> [options]

# Examples
ponder import CLAUDE.md --project my-api
ponder import .cursorrules --dry-run              # Preview without saving
```

---

## All Commands at a Glance

| Command | Description |
|---------|-------------|
| `remember` | Store a memory |
| `recall` | Get memory by key |
| `search` | Semantic search |
| `list` | List all memories |
| `update` | Update existing memory |
| `forget` | Delete a memory |
| `history` | View version history |
| `restore` | Restore previous version |
| `export` | Export as JSON/Markdown |
| `projects` | Manage projects |
| `categories` | List categories |
| `keys` | Manage API keys |
| `stats` | Server info |
| `sync` | Cloud sync |
| `import` | Import from files |
| `--version` | CLI version |

## Getting API Key & Project ID

1. Run `ponderdb-server` and open `http://127.0.0.1:7437`
2. API key shown on first start — or create one via `ponder keys create "my-key"`
3. Create a project via `ponder projects create "My Project"` — the slug is your project ID

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
