import { Command } from "commander";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PonderClient } from "@ponderdb/sdk";

const VERSION = "0.3.0";

function getClient(): PonderClient {
  const baseUrl = process.env.PONDER_URL ?? "http://127.0.0.1:7437";
  const apiKey = process.env.PONDER_API_KEY;
  return new PonderClient({ baseUrl, apiKey });
}

export function createCli() {
  const program = new Command();

  program
    .name("ponder")
    .description("PonderDB — Universal AI Agent Memory")
    .version(VERSION, "-v, --version", "Show PonderDB CLI version");

  // ── remember ─────────────────────────────────────────────────────────

  program
    .command("remember")
    .description("Store a memory")
    .argument("<key>", "Memory key (e.g. auth/jwt-config)")
    .argument("<content>", "Memory content")
    .option("-c, --category <category>", "Category")
    .option("-i, --importance <importance>", "Importance level")
    .option("-t, --tags <tags>", "Comma-separated tags")
    .option("-p, --project <projectId>", "Project ID")
    .option("-g, --global", "Mark as global (accessible across all projects)")
    .action(async (key: string, content: string, opts) => {
      const client = getClient();
      const memory = await client.remember({
        key,
        content,
        category: opts.category,
        importance: opts.importance,
        tags: opts.tags?.split(",").map((t: string) => t.trim()),
        projectId: opts.project,
        isGlobal: opts.global || undefined,
      });
      const scope = memory.isGlobal ? " [global]" : memory.projectId ? ` [${memory.projectId}]` : "";
      console.log(`Remembered: ${memory.key} [${memory.category}]${scope}`);
    });

  // ── recall ───────────────────────────────────────────────────────────

  program
    .command("recall")
    .description("Retrieve a memory by key")
    .argument("<key>", "Memory key")
    .option("-p, --project <projectId>", "Project ID")
    .action(async (key: string, opts) => {
      const client = getClient();
      const memory = await client.recall(key, opts.project);
      if (!memory) {
        console.log(`No memory found: ${key}`);
        process.exit(1);
      }
      const scope = memory.isGlobal ? " [global]" : memory.projectId ? ` [${memory.projectId}]` : "";
      console.log(`\n${memory.key} [${memory.category}, ${memory.importance}]${scope}\n`);
      console.log(memory.content);
      console.log(`\nTags: ${memory.tags.join(", ") || "none"}`);
      console.log(`Updated: ${memory.updatedAt}`);
    });

  // ── search ───────────────────────────────────────────────────────────

  program
    .command("search")
    .description("Search memories by meaning")
    .argument("<query>", "Search query")
    .option("-c, --category <category>", "Filter by category")
    .option("-l, --limit <limit>", "Max results", "5")
    .option("-p, --project <projectId>", "Project ID")
    .action(async (query: string, opts) => {
      const client = getClient();
      const results = await client.search({
        query,
        category: opts.category,
        limit: Number(opts.limit),
        projectId: opts.project,
      });

      if (results.length === 0) {
        console.log("No memories found.");
        return;
      }

      for (const r of results) {
        console.log(`\n[${r.score.toFixed(2)}] ${r.memory.key} [${r.memory.category}]`);
        console.log(`  ${r.memory.content.slice(0, 150)}${r.memory.content.length > 150 ? "..." : ""}`);
      }
    });

  // ── list ─────────────────────────────────────────────────────────────

  program
    .command("list")
    .description("List memories")
    .option("-c, --category <category>", "Filter by category")
    .option("-l, --limit <limit>", "Max results", "20")
    .option("-p, --project <projectId>", "Project ID")
    .action(async (opts) => {
      const client = getClient();
      const result = await client.list({
        category: opts.category,
        limit: Number(opts.limit),
        projectId: opts.project,
      });

      console.log(`${result.total} memories total\n`);
      for (const m of result.items) {
        const scope = m.isGlobal ? " [global]" : "";
        console.log(`  ${m.key} [${m.category}]${scope} — ${m.content.slice(0, 80)}${m.content.length > 80 ? "..." : ""}`);
      }
    });

  // ── update ───────────────────────────────────────────────────────────

  program
    .command("update")
    .description("Update an existing memory")
    .argument("<key>", "Memory key to update")
    .option("-C, --content <content>", "New content")
    .option("-c, --category <category>", "New category")
    .option("-i, --importance <importance>", "New importance level")
    .option("-t, --tags <tags>", "New comma-separated tags")
    .option("-p, --project <projectId>", "Project ID")
    .action(async (key: string, opts) => {
      const updates: Record<string, unknown> = {};
      if (opts.content) updates.content = opts.content;
      if (opts.category) updates.category = opts.category;
      if (opts.importance) updates.importance = opts.importance;
      if (opts.tags) updates.tags = opts.tags.split(",").map((t: string) => t.trim());

      if (Object.keys(updates).length === 0) {
        console.log("Nothing to update. Use --content, --category, --importance, or --tags.");
        process.exit(1);
      }

      const client = getClient();
      const memory = await client.update(key, updates, opts.project);
      console.log(`Updated: ${memory.key} [${memory.category}]`);
    });

  // ── forget ───────────────────────────────────────────────────────────

  program
    .command("forget")
    .description("Delete a memory")
    .argument("<key>", "Memory key to delete")
    .option("-p, --project <projectId>", "Project ID")
    .action(async (key: string, opts) => {
      const client = getClient();
      await client.forget(key, opts.project);
      console.log(`Forgotten: ${key}`);
    });

  // ── history ──────────────────────────────────────────────────────────

  program
    .command("history")
    .description("View version history of a memory")
    .argument("<key>", "Memory key")
    .option("-p, --project <projectId>", "Project ID")
    .action(async (key: string, opts) => {
      const client = getClient();
      const result = await client.history(key, opts.project);

      console.log(`\nCurrent: ${result.current.key} [${result.current.category}]`);
      console.log(`Updated: ${result.current.updatedAt}\n`);

      const history = result.history as { version: number; content: string; updatedAt: string }[];
      if (history.length === 0) {
        console.log("No previous versions.");
        return;
      }

      console.log(`${history.length} version(s):\n`);
      for (const h of history) {
        console.log(`  v${h.version}  ${h.updatedAt}`);
        console.log(`    ${h.content.slice(0, 100)}${h.content.length > 100 ? "..." : ""}`);
      }
    });

  // ── restore ──────────────────────────────────────────────────────────

  program
    .command("restore")
    .description("Restore a memory to a previous version")
    .argument("<key>", "Memory key")
    .argument("<version>", "Version number to restore")
    .option("-p, --project <projectId>", "Project ID")
    .action(async (key: string, version: string, opts) => {
      const client = getClient();
      const memory = await client.restore(key, Number(version), opts.project);
      console.log(`Restored: ${memory.key} to version ${version}`);
    });

  // ── export ───────────────────────────────────────────────────────────

  program
    .command("export")
    .description("Export all memories as JSON or Markdown")
    .option("-f, --format <format>", "Output format: json or markdown", "json")
    .option("-p, --project <projectId>", "Project ID")
    .option("-c, --category <category>", "Filter by category")
    .option("-o, --output <file>", "Write to file instead of stdout")
    .action(async (opts) => {
      const client = getClient();
      const result = await client.list({
        limit: 10000,
        projectId: opts.project,
        category: opts.category,
        sortBy: "updatedAt",
        sortOrder: "desc",
      });

      let output: string;

      if (opts.format === "markdown") {
        const lines: string[] = [
          `# PonderDB Export`,
          ``,
          `> ${result.total} memories exported on ${new Date().toISOString()}`,
          ``,
        ];

        let currentCategory = "";
        for (const m of result.items) {
          if (m.category !== currentCategory) {
            currentCategory = m.category;
            lines.push(`## ${currentCategory}`, ``);
          }
          lines.push(`### ${m.key}`);
          lines.push(``);
          if (m.tags.length) lines.push(`**Tags:** ${m.tags.join(", ")}`);
          lines.push(`**Importance:** ${m.importance} | **Updated:** ${m.updatedAt}`);
          lines.push(``);
          lines.push(m.content);
          lines.push(``);
          lines.push(`---`);
          lines.push(``);
        }
        output = lines.join("\n");
      } else {
        output = JSON.stringify({ exported: new Date().toISOString(), total: result.total, memories: result.items }, null, 2);
      }

      if (opts.output) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(opts.output, output);
        console.log(`Exported ${result.total} memories to ${opts.output}`);
      } else {
        console.log(output);
      }
    });

  // ── projects ─────────────────────────────────────────────────────────

  const projects = program
    .command("projects")
    .description("Manage projects");

  projects
    .command("list")
    .description("List all projects")
    .action(async () => {
      const client = getClient();
      const result = await client.listProjects() as { projects: { name: string; slug: string; description?: string; memoryCount: number }[] };

      if (result.projects.length === 0) {
        console.log("No projects found.");
        return;
      }

      console.log(`${result.projects.length} project(s):\n`);
      for (const p of result.projects) {
        console.log(`  ${p.slug}  "${p.name}"  (${p.memoryCount} memories)`);
        if (p.description) console.log(`    ${p.description}`);
      }
    });

  projects
    .command("create")
    .description("Create a new project")
    .argument("<name>", "Project name")
    .option("-s, --slug <slug>", "URL-friendly slug")
    .option("-d, --description <desc>", "Project description")
    .action(async (name: string, opts) => {
      const client = getClient();
      const project = await client.createProject(name, {
        slug: opts.slug,
        description: opts.description,
      }) as { slug: string };
      console.log(`Created project: ${project.slug}`);
    });

  projects
    .command("delete")
    .description("Delete a project and all its memories")
    .argument("<id>", "Project ID")
    .action(async (id: string) => {
      const client = getClient();
      await client.deleteProject(id);
      console.log(`Deleted project: ${id}`);
    });

  // ── categories ───────────────────────────────────────────────────────

  program
    .command("categories")
    .description("List categories with memory counts")
    .option("-p, --project <projectId>", "Project ID")
    .action(async (opts) => {
      const client = getClient();
      const result = await client.listCategories(opts.project) as { categories: { name: string; count: number; isSystem: boolean; description?: string }[] };

      if (result.categories.length === 0) {
        console.log("No categories found.");
        return;
      }

      console.log(`${result.categories.length} categories:\n`);
      for (const cat of result.categories) {
        const badge = cat.isSystem ? "" : " [custom]";
        console.log(`  ${cat.name}${badge}  (${cat.count} memories)`);
        if (cat.description) console.log(`    ${cat.description}`);
      }
    });

  // ── keys ─────────────────────────────────────────────────────────────

  const keys = program
    .command("keys")
    .description("Manage API keys");

  keys
    .command("list")
    .description("List API keys (prefix only)")
    .action(async () => {
      const client = getClient();
      const result = await client.listApiKeys() as { keys: { id: string; name: string; prefix: string; createdAt: string }[] };

      if (result.keys.length === 0) {
        console.log("No API keys found.");
        return;
      }

      console.log(`${result.keys.length} API key(s):\n`);
      for (const k of result.keys) {
        console.log(`  ${k.prefix}...  "${k.name}"  (created: ${k.createdAt})`);
      }
    });

  keys
    .command("create")
    .description("Create a new API key")
    .argument("<name>", "Key name (e.g. 'laptop', 'ci-server')")
    .action(async (name: string) => {
      const client = getClient();
      const result = await client.createApiKey(name) as { key: string; prefix: string; message: string };
      console.log(`\nAPI Key created: ${result.key}`);
      console.log(`\n  ${result.message}`);
    });

  keys
    .command("delete")
    .description("Delete an API key")
    .argument("<id>", "Key ID")
    .action(async (id: string) => {
      const client = getClient();
      await client.deleteApiKey(id);
      console.log(`Deleted API key: ${id}`);
    });

  // ── stats ────────────────────────────────────────────────────────────

  program
    .command("stats")
    .description("Show memory stats")
    .action(async () => {
      const client = getClient();
      const stats = await client.stats();
      console.log(`Total memories: ${stats.total}`);
      console.log(`Server: ${stats.version}`);
    });

  // ── sync ─────────────────────────────────────────────────────────────

  program
    .command("sync")
    .description("Sync memories with cloud server")
    .option("--status", "Show sync status only")
    .action(async (opts) => {
      const client = getClient();

      if (opts.status) {
        const status = await client.syncStatus();
        console.log(`Memories: ${status.totalMemories}`);
        console.log(`Projects: ${status.totalProjects}`);
        console.log(`Categories: ${status.totalCategories}`);
        return;
      }

      console.log("Pulling from cloud...");
      const pulled = await client.syncPull(null);
      console.log(`  ${pulled.memories.length} memories, ${pulled.projects.length} projects`);
      console.log(`Synced at: ${pulled.syncedAt}`);
    });

  // ── import ───────────────────────────────────────────────────────────

  program
    .command("import")
    .description("Import memories from CLAUDE.md, .cursorrules, or similar files")
    .argument("<file>", "File to import (e.g. CLAUDE.md, .cursorrules)")
    .option("-p, --project <projectId>", "Project ID")
    .option("--dry-run", "Preview what would be imported without saving")
    .action(async (file: string, opts) => {
      const content = readFileSync(file, "utf-8");
      const source = basename(file).toLowerCase().replace(/\s+/g, "-");
      const client = getClient();

      if (opts.dryRun) {
        const res = await client.importPreview(content, source);
        console.log(`Would import ${res.count} memories from ${file}:\n`);
        for (const m of res.memories) {
          console.log(`  ${m.key} [${m.category}] (${m.contentLength} chars)`);
        }
        return;
      }

      const res = await client.importFile(content, source, opts.project);
      console.log(`Imported ${res.imported} memories from ${file}`);
      if (res.skipped > 0) console.log(`Skipped ${res.skipped} (already exist)`);
      for (const m of res.memories) {
        console.log(`  ${m.key} [${m.category}]`);
      }
    });

  return program;
}
