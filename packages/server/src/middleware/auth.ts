import type { MiddlewareHandler } from "hono";
import type { StorageAdapter } from "@ponderdb/core";
import { AuthenticationError } from "@ponderdb/core";

export function authMiddleware(_store: StorageAdapter): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new AuthenticationError();
    }

    const token = authHeader.slice(7);
    if (!token.startsWith("pndr_")) {
      throw new AuthenticationError("Invalid API key format");
    }

    // TODO: validate against stored API keys
    // For MVP local mode, accept any well-formed key
    await next();
  };
}
