<p align="center">
  <img src="icon128.png" alt="PonderDB" width="80">
</p>

<h1 align="center">PonderDB Browser Extension</h1>

<p align="center">
  <strong>Save web content as AI memories to PonderDB — right from your browser.</strong>
</p>

<p align="center">
  <a href="https://github.com/ponderdb/ponderdb/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/ponderdb/ponderdb"><img src="https://img.shields.io/badge/manifest-v3-brightgreen.svg" alt="Manifest V3"></a>
</p>

---

## Overview

The PonderDB Browser Extension lets you clip text from any webpage and save it directly to your [PonderDB](https://github.com/ponderdb/ponderdb) server as a searchable memory. Select text, right-click, and it's stored — ready for any AI tool connected to PonderDB.

## Features

- **Right-click to save** — Select any text on any page, right-click, and choose "Save to PonderDB"
- **Automatic key generation** — Memories are keyed as `web/<page-title>` for easy organization
- **Auto-tagging** — Saved content is tagged with `web` and `saved` for filtering
- **Desktop notifications** — Instant feedback on save success or failure
- **Project scoping** — Optionally scope memories to a specific project
- **Manifest V3** — Built on the latest Chrome extension platform

## Installation

### From source (Developer mode)

1. Clone the repository:

   ```bash
   git clone https://github.com/ponderdb/ponderdb.git
   cd ponderdb/packages/browser-extension
   ```

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (toggle in the top-right corner)

4. Click **Load unpacked** and select the `packages/browser-extension` directory

5. The PonderDB icon appears in your toolbar — pin it for quick access

## Configuration

Click the PonderDB icon in the toolbar to open the settings popup:

| Field | Description | Default |
|-------|-------------|---------|
| **Server URL** | Your PonderDB server address | `http://127.0.0.1:7437` |
| **API Key** | Your PonderDB API key (`pndr_...`) | — |
| **Project ID** | Optional project to scope memories to | — |

> **Note:** The PonderDB server must be running for the extension to save memories. See the [main PonderDB docs](https://github.com/ponderdb/ponderdb#quick-start) for setup instructions.

## Usage

1. **Select text** on any webpage
2. **Right-click** the selection
3. Click **"Save to PonderDB"**
4. A notification confirms the memory was saved

The saved memory will have:
- **Key:** `web/<slugified-page-title>`
- **Tags:** `["web", "saved"]`
- **Content:** The selected text

## Project Structure

```
browser-extension/
├── manifest.json       # Chrome extension manifest (V3)
├── popup.html          # Settings popup UI
├── icon48.png          # Toolbar icon (48x48)
├── icon128.png         # Extension icon (128x128)
└── src/
    ├── background.js   # Service worker — context menu & API calls
    ├── content.js      # Content script (reserved for future features)
    └── popup.js        # Settings popup logic
```

## Prerequisites

- **Google Chrome** (or any Chromium-based browser)
- **PonderDB server** running and accessible
- A valid **API key** (`pndr_...`)

## Development

No build step required — the extension is plain JavaScript and loads directly from source.

After making changes, go to `chrome://extensions` and click the reload button on the PonderDB card to pick up updates.

## Privacy

- All data is sent directly to **your** PonderDB server — no third-party services involved
- The API key is stored locally in Chrome's `chrome.storage.sync`
- The extension only activates on explicit user action (right-click context menu)

## License

[MIT](https://github.com/ponderdb/ponderdb/blob/main/LICENSE)
