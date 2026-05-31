import * as vscode from "vscode";

// ── Types ──────────────────────────────────────────────────────────────

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

// ── Config & API ───────────────────────────────────────────────────────

function getConfig(): PonderConfig {
  const config = vscode.workspace.getConfiguration("ponderdb");
  return {
    serverUrl: config.get("serverUrl", "http://127.0.0.1:7437"),
    apiKey: config.get("apiKey", ""),
    projectId: config.get("projectId", ""),
  };
}

async function ponderFetch(
  path: string,
  options: RequestInit = {}
): Promise<Record<string, unknown> | null> {
  const config = getConfig();
  if (!config.apiKey) {
    vscode.window.showErrorMessage(
      "PonderDB: Set your API key in Settings → PonderDB"
    );
    return null;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  try {
    const res = await fetch(`${config.serverUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string>) },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const err = body?.error as Record<string, unknown> | undefined;
      const msg = err?.message || `HTTP ${res.status}`;
      throw new Error(String(msg));
    }

    return res.json();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Connection failed";
    throw new Error(message);
  }
}

// ── Memories Tree Provider ─────────────────────────────────────────────

class MemoryItem extends vscode.TreeItem {
  constructor(
    public readonly memory: PonderMemory,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(memory.key, collapsibleState);
    this.contextValue = "memory";
    this.tooltip = `${memory.key}\n${memory.category} · ${memory.importance}\n${memory.content.slice(0, 200)}`;
    this.description = memory.category;
    this.iconPath = new vscode.ThemeIcon(getCategoryIcon(memory.category));
    this.command = {
      command: "ponderdb.viewMemory",
      title: "View Memory",
      arguments: [memory],
    };
  }
}

class CategoryItem extends vscode.TreeItem {
  constructor(
    public readonly category: string,
    public readonly count: number,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(category, collapsibleState);
    this.contextValue = "category";
    this.description = `${count}`;
    this.iconPath = new vscode.ThemeIcon(getCategoryIcon(category));
  }
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    code: "code",
    architecture: "symbol-structure",
    config: "gear",
    debug: "bug",
    docs: "book",
    knowledge: "lightbulb",
    reference: "references",
    workflow: "tasklist",
    decision: "law",
    context: "info",
  };
  return icons[category.toLowerCase()] || "note";
}

class MemoriesTreeProvider
  implements vscode.TreeDataProvider<MemoryItem | CategoryItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    MemoryItem | CategoryItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private memories: PonderMemory[] = [];
  private grouped: Map<string, PonderMemory[]> = new Map();

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async loadMemories(): Promise<void> {
    try {
      const config = getConfig();
      const params = new URLSearchParams({
        limit: "100",
        sortBy: "updatedAt",
        sortOrder: "desc",
      });
      if (config.projectId) params.set("projectId", config.projectId);

      const result = await ponderFetch(`/api/memories?${params}`);
      if (result?.items) {
        this.memories = result.items as PonderMemory[];
        this.grouped = new Map();
        for (const m of this.memories) {
          const cat = m.category || "uncategorized";
          if (!this.grouped.has(cat)) this.grouped.set(cat, []);
          this.grouped.get(cat)!.push(m);
        }
      } else {
        this.memories = [];
        this.grouped = new Map();
      }
    } catch {
      this.memories = [];
      this.grouped = new Map();
    }
    this.refresh();
  }

  getTreeItem(element: MemoryItem | CategoryItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: MemoryItem | CategoryItem
  ): (MemoryItem | CategoryItem)[] {
    if (!element) {
      // Root: show categories
      const categories = Array.from(this.grouped.entries())
        .sort((a, b) => b[1].length - a[1].length)
        .map(
          ([cat, mems]) =>
            new CategoryItem(
              cat,
              mems.length,
              vscode.TreeItemCollapsibleState.Collapsed
            )
        );
      return categories;
    }

    if (element instanceof CategoryItem) {
      const mems = this.grouped.get(element.category) || [];
      return mems.map(
        (m) =>
          new MemoryItem(m, vscode.TreeItemCollapsibleState.None)
      );
    }

    return [];
  }

  getMemoryCount(): number {
    return this.memories.length;
  }

  getCategoryCount(): number {
    return this.grouped.size;
  }
}

// ── Connection Status Webview ──────────────────────────────────────────

class StatusViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _connected = false;
  private _serverInfo: Record<string, unknown> | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "openSettings") {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "ponderdb"
        );
      } else if (msg.command === "refresh") {
        this.checkConnection();
      }
    });
    this.checkConnection();
  }

  async checkConnection(): Promise<boolean> {
    const config = getConfig();

    if (!config.apiKey) {
      this._connected = false;
      this._serverInfo = null;
      this._updateView("no-key");
      return false;
    }

    try {
      const result = await ponderFetch("/health");
      this._connected = true;
      this._serverInfo = result;
      this._updateView("connected");
      return true;
    } catch {
      this._connected = false;
      this._serverInfo = null;
      this._updateView("disconnected");
      return false;
    }
  }

  isConnected(): boolean {
    return this._connected;
  }

  private _updateView(
    state: "connected" | "disconnected" | "no-key"
  ) {
    if (!this._view) return;

    const config = getConfig();
    const serverUrl = config.serverUrl;

    let statusHtml: string;
    if (state === "connected") {
      statusHtml = `
        <div class="status-card connected">
          <div class="status-dot green"></div>
          <div class="status-text">
            <span class="label">Connected</span>
            <span class="server">${serverUrl}</span>
          </div>
        </div>`;
    } else if (state === "no-key") {
      statusHtml = `
        <div class="status-card warning">
          <div class="status-dot yellow"></div>
          <div class="status-text">
            <span class="label">API Key Required</span>
            <span class="server">Configure in settings</span>
          </div>
        </div>
        <button class="btn" onclick="post('openSettings')">Open Settings</button>`;
    } else {
      statusHtml = `
        <div class="status-card error">
          <div class="status-dot red"></div>
          <div class="status-text">
            <span class="label">Disconnected</span>
            <span class="server">${serverUrl}</span>
          </div>
        </div>
        <button class="btn" onclick="post('refresh')">Retry</button>
        <button class="btn secondary" onclick="post('openSettings')">Settings</button>`;
    }

    this._view.webview.html = `<!DOCTYPE html>
<html><head><style>
  body { font-family: var(--vscode-font-family); padding: 8px; margin: 0; color: var(--vscode-foreground); }
  .status-card { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 6px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); }
  .status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .green { background: #16a34a; box-shadow: 0 0 6px #16a34a88; }
  .yellow { background: #eab308; box-shadow: 0 0 6px #eab30888; }
  .red { background: #dc2626; box-shadow: 0 0 6px #dc262688; }
  .status-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .label { font-weight: 600; font-size: 12px; }
  .server { font-size: 11px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn { display: block; width: 100%; margin-top: 8px; padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
</style></head><body>
  ${statusHtml}
  <script>
    const vscode = acquireVsCodeApi();
    function post(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body></html>`;
  }
}

// ── Search Webview ─────────────────────────────────────────────────────

class SearchViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.command === "search") {
        await this._doSearch(msg.query);
      } else if (msg.command === "viewMemory") {
        const memory = msg.memory as PonderMemory;
        showMemoryDocument(memory);
      }
    });

    this._renderSearchView([]);
  }

  private async _doSearch(query: string) {
    if (!query.trim()) {
      this._renderSearchView([]);
      return;
    }

    this._renderSearchView([], true);

    try {
      const config = getConfig();
      const body: Record<string, unknown> = { query, limit: 20 };
      if (config.projectId) body.projectId = config.projectId;

      const result = await ponderFetch("/api/memories/search", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const results = (result?.results as PonderSearchResult[]) || [];
      this._renderSearchView(results);
    } catch {
      this._renderSearchView([]);
    }
  }

  private _renderSearchView(
    results: PonderSearchResult[],
    loading = false
  ) {
    if (!this._view) return;

    const resultsHtml = loading
      ? '<div class="loading">Searching...</div>'
      : results.length === 0
        ? ""
        : results
            .map(
              (r, i) => `
          <div class="result" onclick="viewMemory(${i})">
            <div class="result-key">${escapeHtml(r.memory.key)}</div>
            <div class="result-meta">
              <span class="category">${escapeHtml(r.memory.category)}</span>
              <span class="score">${(r.score * 100).toFixed(0)}%</span>
            </div>
            <div class="result-preview">${escapeHtml(r.memory.content.slice(0, 120))}</div>
          </div>`
            )
            .join("");

    this._view.webview.html = `<!DOCTYPE html>
<html><head><style>
  body { font-family: var(--vscode-font-family); padding: 8px; margin: 0; color: var(--vscode-foreground); }
  .search-box { display: flex; gap: 4px; margin-bottom: 8px; }
  input { flex: 1; padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 12px; outline: none; }
  input:focus { border-color: var(--vscode-focusBorder); }
  .search-btn { padding: 6px 10px; border: none; border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); cursor: pointer; font-size: 12px; }
  .search-btn:hover { background: var(--vscode-button-hoverBackground); }
  .result { padding: 8px; margin-bottom: 6px; border-radius: 4px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); cursor: pointer; }
  .result:hover { border-color: var(--vscode-focusBorder); }
  .result-key { font-weight: 600; font-size: 12px; margin-bottom: 3px; }
  .result-meta { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .category { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .score { font-size: 10px; opacity: 0.6; }
  .result-preview { font-size: 11px; opacity: 0.7; line-height: 1.4; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .loading { text-align: center; padding: 16px; opacity: 0.6; font-size: 12px; }
  .count { font-size: 11px; opacity: 0.5; margin-bottom: 8px; }
</style></head><body>
  <div class="search-box">
    <input id="q" type="text" placeholder="Search memories..." onkeydown="if(event.key==='Enter')doSearch()" />
    <button class="search-btn" onclick="doSearch()">Search</button>
  </div>
  ${results.length > 0 ? `<div class="count">${results.length} result${results.length !== 1 ? "s" : ""}</div>` : ""}
  ${resultsHtml}
  <script>
    const vscode = acquireVsCodeApi();
    const results = ${JSON.stringify(results.map((r) => r.memory))};
    function doSearch() {
      const q = document.getElementById('q').value;
      vscode.postMessage({ command: 'search', query: q });
    }
    function viewMemory(i) {
      vscode.postMessage({ command: 'viewMemory', memory: results[i] });
    }
    document.getElementById('q').focus();
  </script>
</body></html>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Helpers ────────────────────────────────────────────────────────────

function showMemoryDocument(memory: PonderMemory) {
  const content = [
    `# ${memory.key}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| Category | ${memory.category} |`,
    `| Importance | ${memory.importance} |`,
    `| Tags | ${memory.tags?.join(", ") || "none"} |`,
    `| Updated | ${memory.updatedAt} |`,
    `| ID | ${memory.id} |`,
    "",
    "---",
    "",
    memory.content,
  ].join("\n");

  vscode.workspace
    .openTextDocument({ content, language: "markdown" })
    .then((doc) => vscode.window.showTextDocument(doc, { preview: true }));
}

// ── Activation ─────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  // Providers
  const memoriesProvider = new MemoriesTreeProvider();
  const statusProvider = new StatusViewProvider(context.extensionUri);
  const searchProvider = new SearchViewProvider(context.extensionUri);

  // Register views
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "ponderdb.status",
      statusProvider
    ),
    vscode.window.registerWebviewViewProvider(
      "ponderdb.search",
      searchProvider
    ),
    vscode.window.registerTreeDataProvider(
      "ponderdb.memories",
      memoriesProvider
    )
  );

  // Initial load
  statusProvider.checkConnection().then((connected) => {
    if (connected) memoriesProvider.loadMemories();
  });

  // Command: Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand("ponderdb.refresh", async () => {
      await statusProvider.checkConnection();
      await memoriesProvider.loadMemories();
    })
  );

  // Command: View Memory
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ponderdb.viewMemory",
      (memory: PonderMemory) => {
        showMemoryDocument(memory);
      }
    )
  );

  // Command: Copy Content
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ponderdb.copyContent",
      async (item: MemoryItem) => {
        await vscode.env.clipboard.writeText(item.memory.content);
        vscode.window.showInformationMessage(
          `PonderDB: Copied "${item.memory.key}" to clipboard`
        );
      }
    )
  );

  // Command: Delete Memory
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "ponderdb.deleteMemory",
      async (item: MemoryItem) => {
        const confirm = await vscode.window.showWarningMessage(
          `Delete memory "${item.memory.key}"?`,
          { modal: true },
          "Delete"
        );
        if (confirm !== "Delete") return;

        try {
          await ponderFetch(`/api/memories/${item.memory.id}`, {
            method: "DELETE",
          });
          vscode.window.showInformationMessage(
            `PonderDB: Deleted "${item.memory.key}"`
          );
          memoriesProvider.loadMemories();
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Delete failed";
          vscode.window.showErrorMessage(`PonderDB: ${message}`);
        }
      }
    )
  );

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

      try {
        const result = await ponderFetch("/api/memories", {
          method: "POST",
          body: JSON.stringify(body),
        });

        if (result) {
          vscode.window.showInformationMessage(
            `PonderDB: Remembered "${key}" [${result.category}]`
          );
          memoriesProvider.loadMemories();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Save failed";
        vscode.window.showErrorMessage(`PonderDB: ${message}`);
      }
    })
  );

  // Command: Search Memories (via command palette)
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

      try {
        const result = await ponderFetch("/api/memories/search", {
          method: "POST",
          body: JSON.stringify(body),
        });

        if (!result?.results || (result.results as unknown[]).length === 0) {
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

        if (selected) showMemoryDocument(selected.memory);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Search failed";
        vscode.window.showErrorMessage(`PonderDB: ${message}`);
      }
    })
  );

  // Command: List Memories (via command palette)
  context.subscriptions.push(
    vscode.commands.registerCommand("ponderdb.list", async () => {
      const config = getConfig();
      const params = new URLSearchParams({
        limit: "50",
        sortBy: "updatedAt",
        sortOrder: "desc",
      });
      if (config.projectId) params.set("projectId", config.projectId);

      try {
        const result = await ponderFetch(`/api/memories?${params}`);
        if (!result?.items || (result.items as unknown[]).length === 0) {
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
          placeHolder: `${(result as Record<string, unknown>).total} memories — select to view`,
        });

        if (selected) showMemoryDocument(selected.memory);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "List failed";
        vscode.window.showErrorMessage(`PonderDB: ${message}`);
      }
    })
  );

  // Command: Import Current File
  context.subscriptions.push(
    vscode.commands.registerCommand("ponderdb.importFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const fileName = editor.document.fileName.split("/").pop() || "file";
      const content = editor.document.getText();

      const config = getConfig();
      const body: Record<string, unknown> = {
        content,
        source: fileName.toLowerCase(),
      };
      if (config.projectId) body.projectId = config.projectId;

      try {
        const result = await ponderFetch("/api/import", {
          method: "POST",
          body: JSON.stringify(body),
        });

        if (result) {
          vscode.window.showInformationMessage(
            `PonderDB: Imported ${result.imported} memories from ${fileName}${result.skipped ? ` (${result.skipped} skipped)` : ""}`
          );
          memoriesProvider.loadMemories();
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Import failed";
        vscode.window.showErrorMessage(`PonderDB: ${message}`);
      }
    })
  );

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBar.text = "$(database) PonderDB";
  statusBar.command = "ponderdb.search";
  statusBar.tooltip = "Search PonderDB memories";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Auto-refresh on config change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("ponderdb")) {
        statusProvider.checkConnection().then((connected) => {
          if (connected) memoriesProvider.loadMemories();
        });
      }
    })
  );
}

export function deactivate() {}
