import * as vscode from "vscode";

interface PonderMemory {
  id: string;
  key: string;
  content: string;
  category: string;
  importance: string;
  tags: string[];
  updatedAt: string;
}

interface PonderSearchResult {
  memory: PonderMemory;
  score: number;
}

interface PonderConfig {
  serverUrl: string;
  apiKey: string;
  projectId: string;
}

function getConfig(): PonderConfig {
  const config = vscode.workspace.getConfiguration("ponderdb");
  return {
    serverUrl: config.get("serverUrl", "http://127.0.0.1:7437"),
    apiKey: config.get("apiKey", ""),
    projectId: config.get("projectId", ""),
  };
}

async function ponderFetch(path: string, options: RequestInit = {}): Promise<Record<string, unknown> | null> {
  const config = getConfig();
  if (!config.apiKey) {
    vscode.window.showErrorMessage("PonderDB: Set your API key in Settings → PonderDB");
    return null;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  const res = await fetch(`${config.serverUrl}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers as Record<string, string> },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = body?.error?.message || `HTTP ${res.status}`;
    vscode.window.showErrorMessage(`PonderDB: ${msg}`);
    return null;
  }

  return res.json();
}

export function activate(context: vscode.ExtensionContext) {
  // Command: Remember Selection
  context.subscriptions.push(
    vscode.commands.registerCommand("ponderdb.remember", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.document.getText(editor.selection);
      if (!selection) {
        vscode.window.showWarningMessage("PonderDB: Select text first");
        return;
      }

      const key = await vscode.window.showInputBox({
        prompt: "Memory key (e.g. auth/jwt-config)",
        placeHolder: "category/name",
      });
      if (!key) return;

      const config = getConfig();
      const body: Record<string, unknown> = { key, content: selection };
      if (config.projectId) body.projectId = config.projectId;

      const result = await ponderFetch("/api/memories", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (result) {
        vscode.window.showInformationMessage(`PonderDB: Remembered "${key}" [${result.category}]`);
      }
    }),
  );

  // Command: Search Memories
  context.subscriptions.push(
    vscode.commands.registerCommand("ponderdb.search", async () => {
      const query = await vscode.window.showInputBox({
        prompt: "Search memories",
        placeHolder: "e.g. authentication, deploy process",
      });
      if (!query) return;

      const config = getConfig();
      const body: Record<string, unknown> = { query, limit: 10 };
      if (config.projectId) body.projectId = config.projectId;

      const result = await ponderFetch("/api/memories/search", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!result?.results?.length) {
        vscode.window.showInformationMessage("PonderDB: No memories found");
        return;
      }

      const items = (result.results as PonderSearchResult[]).map((r) => ({
        label: r.memory.key,
        description: `[${r.memory.category}] score: ${r.score.toFixed(2)}`,
        detail: r.memory.content.slice(0, 200),
        memory: r.memory,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select memory to view",
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        const doc = await vscode.workspace.openTextDocument({
          content: `# ${selected.memory.key}\n\nCategory: ${selected.memory.category}\nTags: ${selected.memory.tags?.join(", ") || "none"}\n\n---\n\n${selected.memory.content}`,
          language: "markdown",
        });
        vscode.window.showTextDocument(doc, { preview: true });
      }
    }),
  );

  // Command: List Memories
  context.subscriptions.push(
    vscode.commands.registerCommand("ponderdb.list", async () => {
      const config = getConfig();
      const params = new URLSearchParams({ limit: "50", sortBy: "updatedAt", sortOrder: "desc" });
      if (config.projectId) params.set("projectId", config.projectId);

      const result = await ponderFetch(`/api/memories?${params}`);
      if (!result?.items?.length) {
        vscode.window.showInformationMessage("PonderDB: No memories found");
        return;
      }

      const items = (result.items as PonderMemory[]).map((m) => ({
        label: m.key,
        description: `[${m.category}] ${m.importance}`,
        detail: m.content.slice(0, 150),
        memory: m,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `${result.total} memories — select to view`,
      });

      if (selected) {
        const doc = await vscode.workspace.openTextDocument({
          content: `# ${selected.memory.key}\n\nCategory: ${selected.memory.category}\nImportance: ${selected.memory.importance}\nTags: ${selected.memory.tags?.join(", ") || "none"}\nUpdated: ${selected.memory.updatedAt}\n\n---\n\n${selected.memory.content}`,
          language: "markdown",
        });
        vscode.window.showTextDocument(doc, { preview: true });
      }
    }),
  );

  // Command: Import Current File
  context.subscriptions.push(
    vscode.commands.registerCommand("ponderdb.importFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const fileName = editor.document.fileName.split("/").pop() || "file";
      const content = editor.document.getText();

      const config = getConfig();
      const body: Record<string, unknown> = { content, source: fileName.toLowerCase() };
      if (config.projectId) body.projectId = config.projectId;

      const result = await ponderFetch("/api/import", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (result) {
        vscode.window.showInformationMessage(
          `PonderDB: Imported ${result.imported} memories from ${fileName}${result.skipped ? ` (${result.skipped} skipped)` : ""}`,
        );
      }
    }),
  );

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(database) PonderDB";
  statusBar.command = "ponderdb.search";
  statusBar.tooltip = "Search PonderDB memories";
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate() {}
