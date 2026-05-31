import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.js";
import { ValidationError } from "@ponderdb/core";

export function marketplaceRouter(deps: AppDeps) {
  const router = new Hono<AppEnv>();
  const { store } = deps;

  // List public listings
  router.get("/", async (c) => {
    const category = c.req.query("category");
    const search = c.req.query("search");
    const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
    const offset = c.req.query("offset") ? Number(c.req.query("offset")) : undefined;

    const result = await store.listMarketplaceListings({ category, search, limit, offset });
    return c.json(result);
  });

  // Get listing by ID
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const listing = await store.getMarketplaceListing(id);
    if (!listing) return c.json({ error: { code: "NOT_FOUND", message: "Listing not found" } }, 404);
    return c.json(listing);
  });

  // Publish a memory to marketplace
  router.post("/", async (c) => {
    const userId = c.get("userId") || "local";
    const body = await c.req.json();
    if (!body.memoryId) throw new ValidationError("memoryId is required");
    if (!body.title) throw new ValidationError("title is required");

    const user = await store.getUserById(userId);
    const listing = await store.createMarketplaceListing({
      memoryId: body.memoryId,
      title: body.title,
      description: body.description ?? "",
      isPublic: body.isPublic,
      authorId: userId,
      authorName: user?.name ?? "Anonymous",
    });

    return c.json(listing, 201);
  });

  // Download/install a listing
  router.post("/:id/download", async (c) => {
    const id = c.req.param("id");
    const listing = await store.getMarketplaceListing(id);
    if (!listing) return c.json({ error: { code: "NOT_FOUND", message: "Listing not found" } }, 404);

    await store.recordMarketplaceDownload(id);

    // Get the source memory content
    const memory = await store.getById(listing.memoryId);
    return c.json({ listing, memory });
  });

  return router;
}
