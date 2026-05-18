# @ponderdb/cli

Command-line interface for PonderDB — manage AI agent memories from the terminal.

## Installation

```bash
npm install -g @ponderdb/cli
```

## Setup

```bash
export PONDER_API_KEY=pndr_YOUR_KEY              # API key
export PONDER_URL=http://127.0.0.1:7437          # Server URL (default)
```

## Commands

### Remember (Store)

```bash
ponder remember "auth/jwt-config" "JWT uses RS256 with 15min expiry" \
  --category config \
  --importance high \
  --tags auth,jwt \
  --project my-backend-api
```

### Recall (Get)

```bash
ponder recall "auth/jwt-config" --project my-backend-api
```

Output:
```
auth/jwt-config [config, high]
JWT uses RS256 with 15min expiry

Tags: auth, jwt
Updated: 2025-05-18T10:30:00.000Z
Access count: 3
```

### Search

```bash
ponder search "how does authentication work" \
  --category config \
  --limit 5 \
  --project my-backend-api
```

### List

```bash
ponder list \
  --category architecture \
  --limit 20 \
  --project my-backend-api
```

### Forget (Delete)

```bash
ponder forget "auth/jwt-config" --project my-backend-api
```

### Stats

```bash
ponder stats
```

## Options

All commands support:

| Flag | Short | Description |
|------|-------|-------------|
| `--project <id>` | `-p` | Project ID (slug) |
| `--category <cat>` | `-c` | Category filter |
| `--importance <imp>` | `-i` | Importance level |
| `--tags <t1,t2>` | `-t` | Comma-separated tags |
| `--limit <n>` | `-l` | Max results |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PONDER_URL` | `http://127.0.0.1:7437` | PonderDB server URL |
| `PONDER_API_KEY` | _(none)_ | API key for authentication |

## Requirements

- Node.js >= 22
- PonderDB server running

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
