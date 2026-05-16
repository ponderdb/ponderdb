# AI Tool Integrations — Universal Memory Protocol

## How Every AI Tool Connects to Universal Memory

---

## Table of Contents

1. [Integration Matrix](#1-integration-matrix)
2. [MCP Protocol (Primary)](#2-mcp-protocol)
3. [Claude CLI / Claude Code](#3-claude-cli--claude-code)
4. [Cursor](#4-cursor)
5. [Windsurf](#5-windsurf)
6. [GitHub Copilot](#6-github-copilot)
7. [ChatGPT](#7-chatgpt)
8. [Gemini](#8-gemini)
9. [VS Code Extension](#9-vs-code-extension)
10. [JetBrains IDEs](#10-jetbrains-ides)
11. [Terminal / CLI Scripts](#11-terminal--cli-scripts)
12. [Other Tools](#12-other-tools)
13. [Proxy Approach](#13-proxy-approach)
14. [SDK & Client Libraries](#14-sdk--client-libraries)
15. [Browser Extension](#15-browser-extension)

---

## 1. Integration Matrix

| Tool | Method | Difficulty | Official Support | Real-Time |
|------|--------|-----------|-----------------|-----------|
| **Claude CLI** | MCP Server | Easy | Yes (native MCP) | Yes |
| **Claude Desktop** | MCP Server | Easy | Yes (native MCP) | Yes |
| **Cursor** | MCP Server | Easy | Yes (native MCP) | Yes |
| **Windsurf** | MCP Server | Easy | Yes (native MCP) | Yes |
| **GitHub Copilot** | MCP (via VS Code) | Easy | Yes (full MCP, most complete client) | Yes |
| **ChatGPT** | MCP (remote only, HTTPS + OAuth) | Medium | Yes (Tools, Apps, DCR) | No |
| **Gemini CLI** | MCP Server | Easy | Yes (Tools, Prompts, Instructions) | Yes |
| **Gemini Web/API** | No MCP; Function Calling | Hard | No | No |
| **VS Code** | MCP + Extension API | Easy | Yes (full MCP via Copilot) | Yes |
| **JetBrains** | MCP (AI Assistant + Junie) | Easy | Yes (Tools) | Yes |
| **Terminal/CLI** | REST API / CLI tool / mcpc | Easy | Full | No |
| **Aider** | No MCP; file injection or proxy | Hard | No | No |
| **Continue.dev** | MCP Server | Easy | Yes (Resources, Tools, Prompts) | Yes |
| **Cody (Sourcegraph)** | No MCP (use Amp instead) | Hard | No | No |

> **Key update (2025):** MCP adoption exploded. GitHub Copilot in VS Code is now the most feature-complete MCP client. ChatGPT supports remote MCP servers. Gemini CLI supports MCP. JetBrains AI Assistant and Junie both support MCP natively. MCP spec version: `2025-11-25`.

---

## 2. MCP Protocol (Primary Integration Method)

### What is MCP?

Model Context Protocol — open standard (created by Anthropic, now independently governed) for connecting AI tools to external data sources. Uses JSON-RPC 2.0 over stateful sessions. Acts as "USB-C for AI tools."

**Latest spec version:** `2025-11-25`

### MCP Server Primitives

| Primitive | Controlled by | Purpose | Memory Server Example |
|-----------|--------------|---------|----------------------|
| **Tools** | Model (auto-invoked) | Functions LLM can call | `remember`, `recall`, `search` |
| **Resources** | Application | Read-only data (URI-addressable) | `memory://snapshot` |
| **Prompts** | User (explicit) | Reusable templates | "Recall context for project" |

### Available MCP SDKs

| Language | Tier | Package |
|----------|------|---------|
| TypeScript | Tier 1 | `@modelcontextprotocol/sdk` |
| Python | Tier 1 | `mcp[cli]` (includes FastMCP) |
| C# | Tier 1 | NuGet `ModelContextProtocol` |
| Go | Tier 1 | `github.com/modelcontextprotocol/go-sdk` |
| Java | Tier 2 | Maven `io.modelcontextprotocol:sdk` |
| Rust | Tier 2 | Crate `mcp-sdk` |
| Ruby, PHP, Swift, Kotlin | Tier 3 | Community-maintained |

### MCP Architecture

```
AI Tool (Host)          MCP Server (our memory server)
+-------------+         +------------------+
| Claude /    |  stdio  | Memory MCP       |
| Cursor /    |<------->| Server           |
| Windsurf    |  or SSE | (Node.js/Python) |
+-------------+         +--------+---------+
                                 |
                         +-------v--------+
                         | Memory API     |
                         | (local/cloud)  |
                         +----------------+
```

### Transport Options

| Transport | Use Case | Pros | Cons |
|-----------|----------|------|------|
| **stdio** | Local process | Fastest, simplest | Same machine only |
| **SSE (HTTP)** | Remote/cloud | Cross-machine, stateless | Slightly slower |
| **Streamable HTTP** | Production | Best for cloud deploy | Newer, less tested |

### MCP Server Implementation

```typescript
// packages/mcp-server/src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "universal-memory",
  version: "1.0.0",
});

// Tool: Remember
server.tool(
  "remember",
  "Store a memory with a key for later retrieval",
  {
    key: { type: "string", description: "Unique key (e.g., 'auth/jwt-config')" },
    content: { type: "string", description: "The memory content to store" },
    category: { type: "string", description: "Category (auto-detected if omitted)" },
    tags: { type: "array", items: { type: "string" }, description: "Tags" },
  },
  async ({ key, content, category, tags }) => {
    const memory = await memoryService.create({ key, content, category, tags });
    return { content: [{ type: "text", text: `Remembered: ${key}` }] };
  }
);

// Tool: Recall
server.tool(
  "recall",
  "Retrieve a specific memory by its key",
  {
    key: { type: "string", description: "The memory key to retrieve" },
  },
  async ({ key }) => {
    const memory = await memoryService.get(key);
    if (!memory) return { content: [{ type: "text", text: `No memory found for key: ${key}` }] };
    return { content: [{ type: "text", text: memory.content }] };
  }
);

// Tool: Search
server.tool(
  "search",
  "Search memories by semantic similarity or keyword",
  {
    query: { type: "string", description: "Search query" },
    category: { type: "string", description: "Filter by category" },
    limit: { type: "number", description: "Max results (default 10)" },
  },
  async ({ query, category, limit = 10 }) => {
    const results = await searchService.hybrid(query, { category, limit });
    const text = results.map(r =>
      `[${r.relevance.toFixed(2)}] ${r.memory.key}: ${r.memory.content.slice(0, 200)}`
    ).join("\n\n");
    return { content: [{ type: "text", text: text || "No results found." }] };
  }
);

// Tool: Context (auto-inject relevant memories)
server.tool(
  "context",
  "Get relevant context for the current task/prompt",
  {
    prompt: { type: "string", description: "Current task or prompt" },
    max_tokens: { type: "number", description: "Max tokens for context (default 2000)" },
  },
  async ({ prompt, max_tokens = 2000 }) => {
    const context = await contextService.getRelevant(prompt, max_tokens);
    return { content: [{ type: "text", text: context }] };
  }
);

// Tool: Forget
server.tool(
  "forget",
  "Delete a memory by key",
  { key: { type: "string" } },
  async ({ key }) => {
    await memoryService.delete(key);
    return { content: [{ type: "text", text: `Forgot: ${key}` }] };
  }
);

// Tool: List Categories
server.tool(
  "list_categories",
  "List all memory categories with counts",
  {},
  async () => {
    const categories = await categoryService.listWithCounts();
    const text = categories.map(c => `${c.name} (${c.count})`).join("\n");
    return { content: [{ type: "text", text }] };
  }
);

// Resource: expose memories as MCP resources
server.resource(
  "memory://{key}",
  "Access a specific memory as a resource",
  async (uri) => {
    const key = uri.pathname;
    const memory = await memoryService.get(key);
    return { contents: [{ uri: uri.href, text: memory?.content || "" }] };
  }
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Building the MCP Server

```bash
# Package structure
packages/mcp-server/
  src/
    index.ts          # MCP server entry
    tools/            # Tool implementations
    transport/        # stdio + SSE transports
  package.json
  tsconfig.json

# Dependencies
npm install @modelcontextprotocol/sdk

# Build
npm run build

# Publish
npm publish @universalmemory/mcp-server
```

---

## 3. Claude CLI / Claude Code

### Integration: MCP Server (Native)

Claude CLI has first-class MCP support. Easiest integration.

### Config Location

```
~/.claude/claude_desktop_config.json    # Claude Desktop
# Claude CLI reads MCP config from project or global settings
```

### Setup

```json
// ~/.claude/claude_desktop_config.json (Claude Desktop)
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@universalmemory/mcp-server"],
      "env": {
        "MEMORY_API_KEY": "mem_sk_xxxxx",
        "MEMORY_MODE": "local"
      }
    }
  }
}
```

```json
// .mcp.json (project-level, Claude Code)
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@universalmemory/mcp-server"],
      "env": {
        "MEMORY_API_KEY": "mem_sk_xxxxx",
        "MEMORY_URL": "https://api.memory.dev"
      }
    }
  }
}
```

### How Claude Uses It

Claude automatically discovers MCP tools. When user asks something, Claude can:
1. Call `search` to find relevant memories
2. Call `context` to get auto-injected context
3. Call `remember` to store new learnings
4. Call `recall` to get specific known memories

### Auto-Context Injection

Via MCP Resources — Claude can read memory resources automatically:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@universalmemory/mcp-server", "--auto-context"],
      "env": {
        "MEMORY_AUTO_INJECT": "true",
        "MEMORY_AUTO_INJECT_LIMIT": "2000"
      }
    }
  }
}
```

---

## 4. Cursor

### Integration: MCP Server (Native)

Cursor supports MCP servers natively since early 2025.

### Config Location

```
.cursor/mcp.json         # Project-level
~/.cursor/mcp.json       # Global
```

### Setup

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@universalmemory/mcp-server"],
      "env": {
        "MEMORY_API_KEY": "mem_sk_xxxxx"
      }
    }
  }
}
```

### Cursor Rules Integration

Cursor also supports `.cursorrules` file. We can auto-generate rules from memory:

```bash
# CLI command to generate .cursorrules from memory
memory export --format cursorrules --category code-patterns > .cursorrules
```

Example generated `.cursorrules`:
```
# Auto-generated from Universal Memory

## Architecture
- JWT uses RS256. Access tokens 15min, refresh 7 days.
- All API routes use middleware/auth.ts for authentication.

## Code Patterns
- Use Zod for all input validation.
- Prefer server actions over API routes for mutations.

## Known Issues
- Redis connection drops on cold start — retry logic in lib/redis.ts
```

---

## 5. Windsurf

### Integration: MCP Server (Native)

Windsurf (Codeium) supports MCP.

### Config

```json
// ~/.codeium/windsurf/mcp_config.json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@universalmemory/mcp-server"],
      "env": {
        "MEMORY_API_KEY": "mem_sk_xxxxx"
      }
    }
  }
}
```

Same MCP server works across Claude, Cursor, and Windsurf. Zero extra work.

---

## 6. GitHub Copilot (via VS Code)

### Integration: MCP (Official, Full Support)

> **UPDATE:** As of 2025, GitHub Copilot in VS Code has **full MCP support** — the most feature-complete MCP client available. Supports: Resources, Prompts, Tools, Discovery, Sampling, Roots, Elicitation, Instructions, MCP Apps, CIMD, DCR, Tasks.

### Config Locations

| Scope | Location |
|-------|----------|
| Workspace | `.vscode/mcp.json` |
| User settings | VS Code `settings.json` under `"mcp"` key |
| Copilot Agent (background) | `.github/copilot/mcp.json` |

### Setup

```json
// .vscode/mcp.json
{
  "servers": {
    "memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["@universalmemory/mcp-server"],
      "env": {
        "MEMORY_API_KEY": "${input:memoryApiKey}"
      }
    }
  },
  "inputs": [
    {
      "id": "memoryApiKey",
      "type": "promptString",
      "description": "Memory server API key",
      "password": true
    }
  ]
}
```

Remote server:
```json
{
  "servers": {
    "memory": {
      "type": "http",
      "url": "https://your-memory-server.com/mcp"
    }
  }
}
```

### Transports: stdio, SSE, Streamable HTTP
### Additional Context: `.github/copilot-instructions.md` (static, auto-generate from memory)
### Sandbox: macOS/Linux stdio servers can be sandboxed to restrict filesystem/network
### VS Code MCP Gallery: One-click server installation available

### Difficulty: Easy

Same MCP config format as Claude/Cursor. Zero extra work.

---

## 7. ChatGPT

### Integration: MCP (Remote Only) + Custom GPT Actions

> **UPDATE:** ChatGPT added MCP support in 2025. Remote servers only (HTTPS + OAuth 2.1 required). Configure via Settings → Connections → Add custom connector → Enter MCP URL. Supports: Tools, MCP Apps, DCR.

### MCP Setup (Preferred)

- Server must be publicly accessible HTTPS endpoint
- Must implement OAuth 2.1 with Dynamic Client Registration (DCR)
- No config file — configured through ChatGPT web UI
- No Resources or Prompts support (Tools only)

### Fallback: Custom GPT with Actions

Create a Custom GPT that calls our memory API:

```yaml
# OpenAPI spec for Custom GPT Action
openapi: 3.0.0
info:
  title: Universal Memory API
  version: 1.0.0
servers:
  - url: https://api.memory.dev/api/v1
paths:
  /memories/search:
    post:
      operationId: searchMemories
      summary: Search project memories
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                query:
                  type: string
                limit:
                  type: integer
                  default: 10
      responses:
        '200':
          description: Search results
  /memories:
    post:
      operationId: createMemory
      summary: Store a new memory
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [key, content]
              properties:
                key:
                  type: string
                content:
                  type: string
                category:
                  type: string
```

### Option B: ChatGPT API with System Prompt

For developers using ChatGPT API in their apps:

```python
import openai
from universal_memory import MemoryClient

memory = MemoryClient(api_key="mem_sk_xxx")

# Get relevant context
context = memory.context(prompt=user_message, max_tokens=2000)

response = openai.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": f"Project context:\n{context}"},
        {"role": "user", "content": user_message}
    ]
)
```

### Option C: ChatGPT MCP Support (Future)

OpenAI has shown interest in MCP. When/if supported, same MCP server works.

### Difficulty: Medium

- Custom GPT: Easy (just paste OpenAPI spec)
- API integration: Easy (SDK call)
- Native MCP: Waiting on OpenAI

---

## 8. Gemini

### Integration: MCP via Gemini CLI (Official) + Limited for Web/API

> **UPDATE:** Gemini CLI (`github.com/google-gemini/gemini-cli`) supports MCP natively. Supports: Tools, Prompts, Instructions, DCR. Config: `~/.gemini/settings.json`. Transports: stdio, SSE.

### Gemini CLI Setup (Easy)

```json
// ~/.gemini/settings.json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@universalmemory/mcp-server"],
      "env": { "MEMORY_API_KEY": "mem_sk_xxx" }
    }
  }
}
```

### Gemini Web/API: No MCP Support

### Option A: Gemini Extensions (Google AI Studio)

Google's extension system — more restricted than MCP:

```python
# Gemini API with function calling
import google.generativeai as genai
from universal_memory import MemoryClient

memory = MemoryClient(api_key="mem_sk_xxx")

# Define tools for Gemini
tools = [
    genai.types.Tool(
        function_declarations=[
            genai.types.FunctionDeclaration(
                name="search_memory",
                description="Search project memories",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"}
                    }
                }
            )
        ]
    )
]

model = genai.GenerativeModel("gemini-2.0-flash", tools=tools)

# Handle function calls
response = model.generate_content(user_message)
if response.candidates[0].content.parts[0].function_call:
    fc = response.candidates[0].content.parts[0].function_call
    if fc.name == "search_memory":
        results = memory.search(fc.args["query"])
        # Feed results back to Gemini
```

### Option B: System Prompt Injection

```python
context = memory.context(prompt=user_message)
response = model.generate_content(
    f"Project context:\n{context}\n\nUser: {user_message}"
)
```

### Difficulty: Hard

- No MCP support
- Function calling is API-only (not in Gemini web UI)
- Google AI Studio extensions are limited

---

## 9. VS Code Extension

### Integration: Custom Extension

Build a VS Code extension that integrates memory into the editor:

### Features

```
+-------------------------------------------+
|  VS Code Extension Features               |
+-------------------------------------------+
| 1. Memory Panel (sidebar)                 |
|    - Browse/search memories               |
|    - Create/edit/delete                   |
|    - Category tree view                   |
|                                           |
| 2. Context Injection                      |
|    - Auto-inject into AI tools            |
|    - Workspace context provider           |
|                                           |
| 3. Quick Actions                          |
|    - Cmd+Shift+M: Quick memory search     |
|    - Cmd+Shift+R: Remember selection      |
|    - Cmd+Shift+C: Get context             |
|                                           |
| 4. Inline Suggestions                     |
|    - Show relevant memories as hints      |
|    - Code comment annotations             |
|                                           |
| 5. Status Bar                             |
|    - Memory count, sync status            |
+-------------------------------------------+
```

### Extension Architecture

```typescript
// extension.ts
import * as vscode from 'vscode';
import { MemoryClient } from '@universalmemory/sdk';

export function activate(context: vscode.ExtensionContext) {
  const memory = new MemoryClient({
    apiKey: vscode.workspace.getConfiguration('memory').get('apiKey'),
  });

  // Command: Remember selection
  context.subscriptions.push(
    vscode.commands.registerCommand('memory.remember', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const selection = editor.document.getText(editor.selection);
      const key = await vscode.window.showInputBox({ prompt: 'Memory key' });
      if (!key) return;

      await memory.remember(key, selection);
      vscode.window.showInformationMessage(`Remembered: ${key}`);
    })
  );

  // Command: Search memories
  context.subscriptions.push(
    vscode.commands.registerCommand('memory.search', async () => {
      const query = await vscode.window.showInputBox({ prompt: 'Search memories' });
      if (!query) return;

      const results = await memory.search(query);
      // Show in QuickPick
      const items = results.map(r => ({
        label: r.key,
        description: r.category,
        detail: r.content.slice(0, 100),
      }));

      const selected = await vscode.window.showQuickPick(items);
      if (selected) {
        // Insert into editor or show in panel
      }
    })
  );

  // Sidebar: Memory Tree View
  const treeProvider = new MemoryTreeProvider(memory);
  vscode.window.registerTreeDataProvider('memoryExplorer', treeProvider);

  // Auto-context: provide to Copilot/AI features
  vscode.workspace.registerTextDocumentContentProvider('memory', {
    provideTextDocumentContent: async (uri) => {
      const key = uri.path;
      const mem = await memory.recall(key);
      return mem?.content || '';
    }
  });
}
```

### Difficulty: Medium

- ~1-2 weeks for full-featured extension
- Publish on VS Code Marketplace
- Works alongside Copilot, Cursor (when running in VS Code)

---

## 10. JetBrains IDEs

### Integration: MCP (Native Support)

> **UPDATE:** Both JetBrains AI Assistant and Junie now support MCP natively.

### JetBrains AI Assistant

- MCP config: via IDE Settings → AI Assistant → Model Context Protocol
- Supports: Tools
- Transports: stdio, SSE (via `npx mcp-remote` proxy)

### JetBrains Junie (Coding Agent)

Config locations:
- Global: `~/.junie/mcp.json`
- Project: `.junie/mcp/` directory

```json
// Same schema as Claude Desktop mcpServers
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["@universalmemory/mcp-server"],
      "env": { "MEMORY_API_KEY": "mem_sk_xxx" }
    }
  }
}
```

- Per-command approval with allowlist support
- Supports: Tools only, stdio transport

### Other JetBrains MCP Plugins

- **Firebender** (IntelliJ): MCP via stdio, project and local rules
- **Augment Code**: MCP tools in VS Code and JetBrains
- **Zencoder**: MCP tool library with one-click installs

### Difficulty: Easy (same MCP config as Claude/Cursor)

No custom plugin needed — MCP works out of box.

---

## 11. Terminal / CLI Scripts

### Integration: CLI Tool + REST API

### CLI Tool

```bash
# Install
npm install -g @universalmemory/cli
# or
brew install universal-memory

# Login
memory login

# Remember
memory remember "auth/jwt-config" "JWT uses RS256, 15min expiry"

# Recall
memory recall "auth/jwt-config"

# Search
memory search "how does authentication work"

# Context (pipe into other tools)
memory context "fix the login bug" | pbcopy

# List
memory list --category architecture

# Import from file
memory import ./CLAUDE.md --format markdown

# Export
memory export --format json > memories.json

# Sync
memory sync

# Stats
memory stats
```

### Shell Integration

```bash
# .bashrc / .zshrc

# Auto-remember commands that fix things
memory_hook() {
  if [ $? -eq 0 ] && [[ "$1" == *"fix"* || "$1" == *"resolve"* ]]; then
    memory remember "fix/$(date +%s)" "Command: $1"
  fi
}

# Quick context for AI prompts
mctx() {
  memory context "$*"
}

# Alias
alias mr="memory recall"
alias ms="memory search"
alias mm="memory remember"
```

### Script Integration

```python
# Python
from universal_memory import MemoryClient

memory = MemoryClient(api_key="mem_sk_xxx")
memory.remember("deploy/last", "Deployed v2.3.1 to production at 2025-05-03")
results = memory.search("deployment process")
```

```javascript
// Node.js
import { MemoryClient } from '@universalmemory/sdk';

const memory = new MemoryClient({ apiKey: 'mem_sk_xxx' });
await memory.remember('test/results', 'All 142 tests passing');
```

### Difficulty: Easy

- REST API works from any language
- SDKs for Python, Node.js, Go, Rust

---

## 12. Other Tools

### Aider

```yaml
# .aider.conf.yml
# Auto-inject memory context
read: [".aider-context.md"]

# Generate context file from memory
# Run before aider: memory export --format markdown > .aider-context.md
```

### Continue.dev

Native MCP support:

```json
// ~/.continue/config.json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["@universalmemory/mcp-server"]
        }
      }
    ]
  }
}
```

### Cody (Sourcegraph)

```json
// Cody context files
// Auto-generate from memory:
// memory export --format cody > .sourcegraph/cody-context.md
```

### Open Interpreter

```python
# Inject memory as system prompt
import interpreter
from universal_memory import MemoryClient

memory = MemoryClient()
context = memory.context("current task description")
interpreter.system_message += f"\n\nProject Memory:\n{context}"
```

---

## 13. Proxy Approach (Universal, Any Tool)

### Concept

HTTP proxy that sits between ANY AI tool and its LLM API. Intercepts requests, injects memory context.

```
AI Tool → Proxy (localhost:8081) → LLM API (api.openai.com, etc.)
                |
                +→ Inject memory context into system prompt
```

### Implementation

```typescript
// Proxy server
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { MemoryClient } from '@universalmemory/sdk';

const app = express();
const memory = new MemoryClient({ apiKey: process.env.MEMORY_API_KEY });

// Intercept OpenAI-compatible requests
app.use('/v1/chat/completions', async (req, res, next) => {
  const body = JSON.parse(req.body);

  // Extract user's latest message
  const lastMessage = body.messages[body.messages.length - 1].content;

  // Get relevant memory context
  const context = await memory.context({
    prompt: lastMessage,
    max_tokens: 2000
  });

  // Inject into system message
  const systemMsg = body.messages.find(m => m.role === 'system');
  if (systemMsg) {
    systemMsg.content += `\n\n## Project Memory Context\n${context}`;
  } else {
    body.messages.unshift({
      role: 'system',
      content: `## Project Memory Context\n${context}`
    });
  }

  req.body = JSON.stringify(body);
  next();
});

// Proxy to actual API
app.use('/', createProxyMiddleware({
  target: process.env.LLM_API_URL || 'https://api.openai.com',
  changeOrigin: true,
}));

app.listen(8081);
```

### Usage

```bash
# Point any tool at the proxy
export OPENAI_API_BASE=http://localhost:8081/v1

# Now ANY tool using OpenAI API automatically gets memory context
# Works with: Aider, LangChain, any OpenAI-compatible client
```

### Pros

- Works with ANY tool that uses OpenAI-compatible API
- No tool-specific integration needed
- Transparent to the user

### Cons

- Extra latency (~50-100ms for memory lookup)
- Only works for API calls (not IDE features)
- Requires running proxy process
- May not work with tools that pin API URLs

---

## 14. SDK & Client Libraries

### Official SDKs

```
@universalmemory/sdk          # TypeScript/JavaScript (npm)
universal-memory              # Python (pip)
universal-memory-go           # Go (go get)
universal-memory-rs           # Rust (cargo)
```

### TypeScript SDK

```typescript
import { MemoryClient } from '@universalmemory/sdk';

const memory = new MemoryClient({
  apiKey: 'mem_sk_xxx',
  baseUrl: 'https://api.memory.dev', // or 'http://localhost:3000'
});

// CRUD
await memory.remember('key', 'content', { category: 'bugs', tags: ['auth'] });
const mem = await memory.recall('key');
await memory.update('key', { content: 'updated content' });
await memory.forget('key');

// Search
const results = await memory.search('authentication flow', { limit: 10 });

// Context
const ctx = await memory.context('fix the login bug', { maxTokens: 2000 });

// Bulk
await memory.bulkRemember([
  { key: 'k1', content: 'c1' },
  { key: 'k2', content: 'c2' },
]);

// Export/Import
const all = await memory.export({ format: 'json' });
await memory.import(jsonData);

// Categories
const cats = await memory.listCategories();

// Stats
const stats = await memory.stats();
```

### Python SDK

```python
from universal_memory import MemoryClient

memory = MemoryClient(api_key="mem_sk_xxx")

# CRUD
memory.remember("key", "content", category="bugs")
mem = memory.recall("key")
memory.forget("key")

# Search
results = memory.search("auth flow", limit=10)

# Context (for LLM integration)
context = memory.context("fix login bug", max_tokens=2000)

# LangChain integration
from universal_memory.integrations import LangChainMemory
llm_memory = LangChainMemory(client=memory)
```

---

## 15. Browser Extension

### Concept

Chrome/Firefox extension to capture memories from web browsing.

### Features

- Right-click → "Remember this" on any text
- Auto-capture from Stack Overflow solutions
- Save API documentation snippets
- Capture meeting notes from web apps
- Quick search popup (Cmd+Shift+M)

### Architecture

```
Browser Extension
      |
      +→ Content Script (capture text from pages)
      +→ Background Script (sync with memory API)
      +→ Popup UI (quick search/add)
      +→ Options Page (settings, API key)
```

### Manifest

```json
{
  "manifest_version": 3,
  "name": "Universal Memory",
  "permissions": ["contextMenus", "storage", "activeTab"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"]
  }],
  "commands": {
    "quick-search": {
      "suggested_key": { "default": "Ctrl+Shift+M" },
      "description": "Quick memory search"
    }
  }
}
```

### Priority: Phase 2

Nice to have, not MVP. Focus on MCP + CLI first.

---

## Integration Priority (Build Order)

| Priority | Integration | Effort | Impact |
|----------|-------------|--------|--------|
| P0 | MCP Server (Claude, Cursor, Windsurf, Continue) | 1 week | Highest |
| P0 | CLI Tool | 1 week | High |
| P0 | REST API | Built with server | Highest |
| P1 | TypeScript SDK | 3 days | High |
| P1 | Python SDK | 3 days | High |
| P1 | VS Code Extension | 1 week | Medium |
| P2 | Copilot Instructions export | 2 days | Medium |
| P2 | ChatGPT Custom GPT template | 2 days | Medium |
| P2 | Proxy server | 3 days | Medium |
| P3 | JetBrains Plugin | 2 weeks | Medium |
| P3 | Browser Extension | 2 weeks | Low |
| P3 | Go / Rust SDKs | 1 week | Low |
