#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SqliteStore } from "@ponderdb/sqlite-store";
import { PgStore } from "@ponderdb/pg-store";
import { expandPath, DEFAULT_CONFIG } from "@ponderdb/core";
import type { StorageAdapter } from "@ponderdb/core";
import { createApp } from "./app.js";
import { createMcpServer } from "./mcp.js";
import { TransformerEmbeddingProvider } from "./embedder/transformer.js";
import { LocalEmbeddingProvider } from "./embedder/local.js";
import { OpenAIEmbeddingProvider } from "./embedder/openai.js";

const mode = process.argv[2] ?? "http";

async function main() {
  const dataDir = expandPath(process.env.PONDER_DATA_DIR ?? DEFAULT_CONFIG.dataDir);
  const port = Number(process.env.PONDER_PORT ?? DEFAULT_CONFIG.port);
  const host = process.env.PONDER_HOST ?? DEFAULT_CONFIG.host;

  // Initialize embedder first (need dimensions for store)
  let embedder;
  const embedderType = process.env.PONDER_EMBEDDER ?? "transformer";

  if (embedderType === "openai") {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.error("PONDER_EMBEDDER=openai requires OPENAI_API_KEY");
      process.exit(1);
    }
    const model = process.env.PONDER_EMBEDDING_MODEL ?? "text-embedding-3-small";
    const dims = Number(process.env.PONDER_EMBEDDING_DIMS ?? 1536);
    embedder = new OpenAIEmbeddingProvider(openaiKey, model, dims);
    console.log(`Embedder: OpenAI ${model} (${dims}d)`);
  } else if (embedderType === "local") {
    embedder = new LocalEmbeddingProvider();
    console.log("Embedder: hash-based (local placeholder)");
  } else {
    console.log("Embedder: all-MiniLM-L6-v2 (loading model...)");
    try {
      embedder = new TransformerEmbeddingProvider(dataDir);
      await embedder.embed("warmup");
      console.log("Embedder: all-MiniLM-L6-v2 (ready)");
    } catch (err) {
      console.error("Failed to load transformer model, falling back to hash-based:", err);
      embedder = new LocalEmbeddingProvider();
    }
  }

  // Initialize storage — PostgreSQL (cloud) or SQLite (local)
  let store: StorageAdapter;
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    store = new PgStore({ connectionString: dbUrl, dimensions: embedder.dimensions() });
    console.log("Storage: PostgreSQL + pgvector");
  } else {
    store = new SqliteStore(dataDir, embedder.dimensions());
    console.log("Storage: SQLite + sqlite-vec");
  }
  await store.init();

  if (mode === "mcp") {
    // MCP stdio mode — used by Claude, Cursor, Copilot, etc.
    // No auth needed — stdio is process-local, only the parent can talk to it.
    const mcpServer = createMcpServer(store, embedder);
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error("PonderDB MCP server running on stdio");
  } else {
    // HTTP mode — REST API with auth
    const apiKeyRequired = process.env.PONDER_API_KEY_REQUIRED !== "false";

    // Auto-generate default API key on first start (for MCP/SDK/CLI use)
    if (apiKeyRequired) {
      const keyCount = await store.countApiKeys("local");
      if (keyCount === 0) {
        await store.createApiKey("default", "local");
        console.log("  Default API key created. Manage keys from the dashboard.");
      }
    }

    const app = createApp({ store, embedder, apiKeyRequired });

    const server = serve({ fetch: app.fetch, port, hostname: host }, () => {
      console.log(`PonderDB server running at http://${host}:${port}`);
      console.log(`Data directory: ${dataDir}`);
      console.log(`Auth: ${apiKeyRequired ? "enabled" : "disabled"}`);
    });

    // Graceful shutdown — close HTTP server then DB, force exit quickly
    const shutdown = () => {
      console.log("\nShutting down...");
      server.close(() => { /* server closed */ });
      store.close().catch(() => { /* ignore */ }).finally(() => process.exit(0));
      // Force exit after 2s no matter what
      setTimeout(() => process.exit(0), 2000).unref();
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  // Graceful shutdown for MCP mode
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      await store.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("Failed to start PonderDB:", err);
  process.exit(1);
});
