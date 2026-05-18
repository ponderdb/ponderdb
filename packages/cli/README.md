# @ponderdb/cli

Terminal interface for PonderDB — manage AI agent memories from command line.

Requires a running [PonderDB server](https://www.npmjs.com/package/@ponderdb/server).

## Install

```bash
npm install -g @ponderdb/cli
```

## Setup

```bash
export PONDER_API_KEY=pndr_YOUR_KEY
```

## Commands

```bash
ponder remember "auth/jwt" "RS256, 15min expiry" --project my-project --tags auth,jwt
ponder recall "auth/jwt" --project my-project
ponder search "authentication" --limit 5 --project my-project
ponder list --category config --limit 20 --project my-project
ponder forget "auth/jwt" --project my-project
ponder stats
```

## Getting API Key & Project ID

1. Run `ponderdb-server` and open `http://127.0.0.1:7437`
2. API key shown on first start — or create one in **API Keys**
3. Create a project in **Projects** — the slug is your project ID

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
