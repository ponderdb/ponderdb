import { Command } from "commander";
import { PonderClient } from "@ponderdb/sdk";

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
    .version("0.2.1");

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

  program
    .command("stats")
    .description("Show memory stats")
    .action(async () => {
      const client = getClient();
      const stats = await client.stats();
      console.log(`Total memories: ${stats.total}`);
      console.log(`Server: ${stats.version}`);
    });

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

      // Pull changes from cloud
      console.log("Pulling from cloud...");
      const pulled = await client.syncPull(null);
      console.log(`  ${pulled.memories.length} memories, ${pulled.projects.length} projects`);
      console.log(`Synced at: ${pulled.syncedAt}`);
    });

  return program;
}
