import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import type { StorageAdapter, EmbeddingProvider } from "@ponderdb/core";
import { PonderError } from "@ponderdb/core";
import { memoriesRouter } from "./routes/memories.js";
import { authRouter } from "./routes/auth.js";
import { oauthRouter } from "./routes/oauth.js";
import { categoriesRouter } from "./routes/categories.js";
import { projectsRouter } from "./routes/projects.js";
import { authMiddleware } from "./middleware/auth.js";
import { mcpHttpRouter } from "./mcp-http.js";

/** Hono context variables set by auth middleware */
export type AppEnv = {
  Variables: {
    userId: string;
    apiKeyId: string;
  };
};

export interface AppDeps {
  store: StorageAdapter;
  embedder: EmbeddingProvider;
  apiKeyRequired: boolean;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", cors());
  app.use("*", logger());

  if (deps.apiKeyRequired) {
    app.use("/api/*", authMiddleware(deps.store));
    app.use("/mcp/*", authMiddleware(deps.store));
  }

  // Health check (no auth)
  app.get("/health", (c) => c.json({ status: "ok", version: "0.2.1" }));

  // OAuth routes (no auth — these ARE the login flow)
  app.route("/auth", oauthRouter(deps.store));

  // MCP over HTTP (auth via API key, sessions managed by MCP protocol)
  app.route("/mcp", mcpHttpRouter(deps));

  // API routes (auth required)
  app.route("/api/memories", memoriesRouter(deps));
  app.route("/api/auth", authRouter(deps));
  app.route("/api/categories", categoriesRouter(deps));
  app.route("/api/projects", projectsRouter(deps));

  // Dashboard static files — check bundled location first, then monorepo location
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const bundledDashboard = resolve(__dirname, "../public");
  const monorepoDashboard = resolve(__dirname, "../../dashboard/dist");
  const dashboardDist = existsSync(bundledDashboard) ? bundledDashboard : monorepoDashboard;
  if (existsSync(dashboardDist)) {
    app.use("/*", serveStatic({ root: dashboardDist, rewriteRequestPath: (path) => path }));
    // SPA fallback — serve index.html for non-API routes
    app.get("*", serveStatic({ root: dashboardDist, rewriteRequestPath: () => "/index.html" }));
  }

  // Error handler
  app.onError((err, c) => {
    if (err instanceof PonderError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.statusCode as 400);
    }
    console.error("Unhandled error:", err);
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
  });

  return app;
}
