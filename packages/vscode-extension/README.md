<p align="center">
  <img src="icon.png" alt="PonderDB" width="80">
</p>

<h1 align="center">PonderDB for VS Code</h1>

<p align="center">
  <strong>AI memory management — search, store, and recall project knowledge from VS Code.</strong>
</p>

<p align="center">
  <a href="https://github.com/ponderdb/ponderdb/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://code.visualstudio.com"><img src="https://img.shields.io/badge/VS%20Code-%3E%3D1.85-blue.svg" alt="VS Code"></a>
  <img src="https://img.shields.io/badge/version-0.3.0-brightgreen.svg" alt="Version">
</p>

---

## Overview

The PonderDB VS Code extension brings AI memory management directly into your editor. Save code snippets, search across memories, and manage your knowledge base — all from the sidebar without leaving your workflow.

<!-- Sidebar overview screenshot -->
<!-- ![PonderDB Sidebar](media/screenshots/sidebar-overview.png) -->

## Features

### Sidebar Panel

PonderDB lives in the left activity bar with three dedicated views:

#### Connection Status

Shows real-time connection status to your PonderDB server with visual indicators:

- **Green dot** — Connected and ready
- **Yellow dot** — API key not configured (with quick link to settings)
- **Red dot** — Server unreachable (with retry button)

<!-- Connection status screenshot -->
<!-- ![Connection Status](media/screenshots/connection-status.png) -->

#### Search

Full-text semantic search built into the sidebar:

- Type your query and press Enter or click Search
- Results show memory key, category badge, match score, and content preview
- Click any result to open full memory as a markdown document

<!-- Search view screenshot -->
<!-- ![Search View](media/screenshots/search-view.png) -->

#### Memories Tree

Browse all memories organized by category:

- **Grouped by category** — code, architecture, config, debug, docs, knowledge, etc.
- **Category icons** — each category has a contextual icon for quick identification
- **Inline actions** — View, Copy to clipboard, and Delete per memory
- **Title bar actions** — Refresh and Import File buttons

<!-- Memories tree screenshot -->
<!-- ![Memories Tree](media/screenshots/memories-tree.png) -->

### Commands

All commands are available via the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `PonderDB: Remember Selection` | Save selected text as a new memory |
| `PonderDB: Search Memories` | Search memories via quick pick |
| `PonderDB: List Memories` | Browse all memories via quick pick |
| `PonderDB: Import Current File` | Import entire file as memories |

### Right-Click Context Menu

Select any text in the editor, right-click, and choose **"PonderDB: Remember Selection"** to save it instantly.

<!-- Context menu screenshot -->
<!-- ![Context Menu](media/screenshots/context-menu.png) -->

### Status Bar

A persistent status bar item at the bottom-right shows "PonderDB" — click it to quickly search memories.

---

## Installation

### From VSIX (recommended for local development)

1. Build the extension:

   ```bash
   cd packages/vscode-extension
   npm run build
   npx @vscode/vsce package --allow-package-env-file --no-dependencies
   ```

2. In VS Code: **Extensions** → **...** menu → **Install from VSIX** → select the `.vsix` file

### From Source (F5 debug mode)

1. Open the `packages/vscode-extension` folder in VS Code
2. Press **F5** to launch the Extension Development Host
3. A new VS Code window opens with PonderDB loaded

---

## Configuration

Open **Settings** (`Cmd+,` / `Ctrl+,`) and search for `ponderdb`:

| Setting | Description | Default |
|---------|-------------|---------|
| `ponderdb.serverUrl` | PonderDB server address | `http://127.0.0.1:7437` |
| `ponderdb.apiKey` | API key for authentication (`pndr_...`) | — |
| `ponderdb.projectId` | Optional project to scope memories | — |

You can also configure via `settings.json`:

```json
{
  "ponderdb.serverUrl": "http://127.0.0.1:7437",
  "ponderdb.apiKey": "pndr_your_api_key_here",
  "ponderdb.projectId": "my-project"
}
```

> **Note:** The extension auto-reconnects when settings change — no restart needed.

---

## Usage Guide

### 1. Connect to PonderDB

1. Make sure your PonderDB server is running
2. Click the PonderDB icon in the left activity bar
3. If you see a yellow "API Key Required" status, click **Open Settings**
4. Enter your server URL and API key
5. The status dot turns green when connected

### 2. Save a Memory

**Option A — Right-click:**

1. Select code or text in the editor
2. Right-click → **PonderDB: Remember Selection**
3. Enter a key (e.g., `auth/jwt-config`)
4. Memory is saved and appears in the sidebar tree

**Option B — Command Palette:**

1. Select text
2. `Cmd+Shift+P` → **PonderDB: Remember Selection**
3. Enter a key → saved

### 3. Search Memories

**From the sidebar:**

1. Click the PonderDB icon in the activity bar
2. Type your query in the Search section
3. Click a result to view full content

**From Command Palette:**

1. `Cmd+Shift+P` → **PonderDB: Search Memories**
2. Type your query
3. Select from results

### 4. Browse Memories

- Expand categories in the Memories tree to see all memories
- Click the **eye icon** to view a memory
- Click the **clipboard icon** to copy content
- Click the **trash icon** to delete (with confirmation)

### 5. Import a File

1. Open any file in the editor
2. Click the **upload icon** in the Memories tree title bar, or run `PonderDB: Import Current File`
3. The file content is parsed and imported as memories

---

## Project Structure

```
vscode-extension/
├── src/
│   └── extension.ts        # Main extension code
├── media/
│   └── ponderdb-sidebar.svg # Activity bar icon
├── dist/
│   └── extension.js         # Bundled output
├── icon.png                  # Extension marketplace icon
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
└── .vscodeignore             # Package exclusions
```

---

## Architecture

```
┌─────────────────────────────────────┐
│         VS Code Sidebar             │
├─────────────────────────────────────┤
│  StatusViewProvider (Webview)       │ ← Connection health check
│  SearchViewProvider (Webview)       │ ← Semantic search UI
│  MemoriesTreeProvider (TreeView)    │ ← Category-grouped tree
├─────────────────────────────────────┤
│           ponderFetch()             │ ← HTTP client
├─────────────────────────────────────┤
│         PonderDB Server             │ ← REST API
│        (http://127.0.0.1:7437)      │
└─────────────────────────────────────┘
```

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch

# Package as .vsix
npx @vscode/vsce package --allow-package-env-file --no-dependencies
```

Press **F5** in VS Code to launch the Extension Development Host for testing.

---

## Prerequisites

- **VS Code** >= 1.85.0
- **PonderDB server** running and accessible
- A valid **API key** (`pndr_...`)

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Sidebar icon not visible | Reload VS Code window (`Cmd+Shift+P` → "Reload Window") |
| "Disconnected" status | Check server is running, verify URL and API key in settings |
| No memories showing | Click refresh button, check project ID matches server |
| Extension not activating | Ensure `dist/extension.js` exists — run `npm run build` |

---

## License

[MIT](https://github.com/ponderdb/ponderdb/blob/main/LICENSE)
