import { serve } from "@hono/node-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SqliteStore } from "@ponderdb/sqlite-store";
import { expandPath, DEFAULT_CONFIG } from "@ponderdb/core";
import { createApp } from "./app.js";
import { createMcpServer } from "./mcp.js";
import { LocalEmbeddingProvider } from "./embedder/local.js";

const mode = process.argv[2] ?? "http";

async function main() {
  const dataDir = expandPath(process.env.PONDER_DATA_DIR ?? DEFAULT_CONFIG.dataDir);
  const port = Number(process.env.PONDER_PORT ?? DEFAULT_CONFIG.port);
  const host = process.env.PONDER_HOST ?? DEFAULT_CONFIG.host;

  // Initialize storage
  const store = new SqliteStore(dataDir);
  await store.init();

  // Initialize embedder (local placeholder for MVP)
  const embedder = new LocalEmbeddingProvider();

  if (mode === "mcp") {
    // MCP stdio mode — used by Claude, Cursor, Copilot, etc.
    const mcpServer = createMcpServer(store, embedder);
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error("PonderDB MCP server running on stdio");
  } else {
    // HTTP mode — REST API
    const app = createApp({
      store,
      embedder,
      apiKeyRequired: process.env.PONDER_API_KEY_REQUIRED !== "false",
    });

    serve({ fetch: app.fetch, port, hostname: host }, () => {
      console.log(`PonderDB server running at http://${host}:${port}`);
      console.log(`Data directory: ${dataDir}`);
    });
  }

  // Graceful shutdown
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}, shutting down...`);
      await store.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("Failed to start PonderDB:", err);
  process.exit(1);
});
