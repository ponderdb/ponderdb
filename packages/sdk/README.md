# @ponderdb/sdk

TypeScript SDK for PonderDB — use AI agent memory in your code.

Requires a running [PonderDB server](https://www.npmjs.com/package/@ponderdb/server).

## Install

```bash
npm install @ponderdb/sdk
```

## Usage

```typescript
import { PonderClient } from "@ponderdb/sdk";

const ponder = new PonderClient({
  baseUrl: "http://127.0.0.1:7437",
  apiKey: "pndr_YOUR_KEY",
  projectId: "my-project",
});

// Store
await ponder.remember({ key: "auth/jwt", content: "RS256, 15min expiry", tags: ["auth"] });

// Get
const memory = await ponder.recall("auth/jwt");

// Search
const results = await ponder.search({ query: "authentication", limit: 5 });

// List
const page = await ponder.list({ category: "config", limit: 20 });

// Delete
await ponder.forget("auth/jwt");
```

## Getting API Key & Project ID

1. Run `ponderdb-server` and open `http://127.0.0.1:7437`
2. API key shown on first start — or create one in **API Keys**
3. Create a project in **Projects** — the slug is your project ID

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
