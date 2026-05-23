import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../app.js";
import { ValidationError, detectCategory } from "@ponderdb/core";

interface ImportedMemory {
  key: string;
  content: string;
  category?: string;
  source: string;
}

/** Parse CLAUDE.md / .cursorrules / .github/copilot-instructions.md into memories */
function parseInstructionFile(content: string, source: string): ImportedMemory[] {
  const memories: ImportedMemory[] = [];
  const lines = content.split("\n");

  let currentHeading = "";
  let currentContent: string[] = [];

  const flush = () => {
    if (currentHeading && currentContent.length > 0) {
      const text = currentContent.join("\n").trim();
      if (text.length > 10) {
        const key = `import/${source}/${slugifyHeading(currentHeading)}`;
        memories.push({
          key,
          content: text,
          category: detectCategory(text, currentHeading),
          source,
        });
      }
    }
    currentContent = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
    } else {
      currentContent.push(line);
    }
  }
  flush();

  // If no headings found, treat whole file as one memory
  if (memories.length === 0 && content.trim().length > 10) {
    memories.push({
      key: `import/${source}/instructions`,
      content: content.trim(),
      category: detectCategory(content, source),
      source,
    });
  }

  return memories;
}

function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function importRouter(deps: AppDeps) {
  const router = new Hono<AppEnv>();
  const { store, embedder } = deps;

  /** Import from instruction file content */
  router.post("/", async (c) => {
    const body = await c.req.json();
    if (!body.content) throw new ValidationError("content is required");
    if (!body.source) throw new ValidationError("source is required (e.g. 'claude.md', '.cursorrules')");

    const projectId = body.projectId;
    const parsed = parseInstructionFile(body.content, body.source);

    const imported: { key: string; category: string }[] = [];
    const skipped: string[] = [];

    for (const item of parsed) {
      const existing = await store.getByKey(item.key, projectId);
      if (existing) {
        skipped.push(item.key);
        continue;
      }

      const embedding = await embedder.embed(`${item.key} ${item.content}`);
      await store.create({
        key: item.key,
        content: item.content,
        category: item.category,
        tags: ["imported", item.source],
        projectId,
        embedding,
      });
      imported.push({ key: item.key, category: item.category ?? "custom" });
    }

    return c.json({
      imported: imported.length,
      skipped: skipped.length,
      memories: imported,
      skippedKeys: skipped,
    });
  });

  /** Preview what would be imported (dry run) */
  router.post("/preview", async (c) => {
    const body = await c.req.json();
    if (!body.content) throw new ValidationError("content is required");
    if (!body.source) throw new ValidationError("source is required");

    const parsed = parseInstructionFile(body.content, body.source);
    return c.json({
      count: parsed.length,
      memories: parsed.map((m) => ({ key: m.key, category: m.category, contentLength: m.content.length })),
    });
  });

  return router;
}
