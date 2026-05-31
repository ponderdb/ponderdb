<p align="center">
  <img src="../../assets/icon.png" alt="PonderDB" width="80">
</p>

<h1 align="center">ponderdb</h1>

<p align="center">
  <strong>Python SDK for PonderDB — Universal AI Agent Memory Server.</strong>
</p>

<p align="center">
  <a href="https://github.com/ponderdb/ponderdb/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://pypi.org/project/ponderdb/"><img src="https://img.shields.io/badge/python-%3E%3D3.9-blue.svg" alt="Python"></a>
  <img src="https://img.shields.io/badge/version-0.3.0-brightgreen.svg" alt="Version">
</p>

---

## Install

```bash
pip install ponderdb
```

## Quick Start

```python
from ponderdb import PonderClient

client = PonderClient(
    base_url="http://127.0.0.1:7437",
    api_key="pndr_xxx",
    project_id="my-project",  # optional
)

# Store a memory
client.remember("auth/jwt", "RS256, 15min expiry", tags=["auth"])

# Recall by key
memory = client.recall("auth/jwt")
print(memory["content"])

# Semantic search
results = client.search("authentication", limit=5)
for r in results:
    print(f"  [{r['score']:.2f}] {r['memory']['key']}")

# List all
page = client.list(category="config", limit=20)
print(f"Total: {page['total']}")
```

## Context Manager

```python
with PonderClient(api_key="pndr_xxx") as client:
    client.remember("key", "value")
# connection auto-closed
```

---

## API Reference

### Memory Operations

#### `remember(key, content, **kwargs)`

Store a memory.

```python
client.remember(
    "deploy/aws",
    "Use t3.medium in us-east-1",
    category="config",
    importance="high",
    tags=["deploy", "aws"],
    is_global=True,
)
```

#### `recall(key, project_id=None)`

Retrieve a memory by key. Returns `None` if not found.

```python
memory = client.recall("auth/jwt")
if memory:
    print(memory["content"])
```

#### `search(query, **kwargs)`

Semantic + keyword search. Returns list of `{memory, score}`.

```python
results = client.search("authentication", category="code", limit=10)
```

#### `list(**kwargs)`

List memories with filters and pagination.

```python
page = client.list(category="config", limit=50, offset=0, sort_by="updatedAt")
for m in page["items"]:
    print(m["key"])
```

#### `update(key, **kwargs)`

Update an existing memory's content, category, importance, or tags.

```python
client.update("auth/jwt", content="RS256, 30min expiry", tags=["auth", "updated"])
```

#### `forget(key, project_id=None)`

Delete a memory.

```python
client.forget("old/outdated-info")
```

---

### Version History

#### `history(key, project_id=None)`

View all versions of a memory.

```python
result = client.history("auth/jwt")
print(f"Current: {result['current']['key']}")
for h in result["history"]:
    print(f"  v{h['version']}  {h['updatedAt']}")
```

#### `restore(key, version, project_id=None)`

Restore a memory to a previous version.

```python
client.restore("auth/jwt", version=2)
```

---

### Export

#### `export(**kwargs)`

Export all memories as a list of dicts.

```python
memories = client.export(project_id="my-api", category="code")

# Save as JSON
import json
with open("backup.json", "w") as f:
    json.dump(memories, f, indent=2)
```

---

### Projects

#### `list_projects()`

```python
result = client.list_projects()
for p in result["projects"]:
    print(f"  {p['slug']} — {p['name']} ({p['memoryCount']} memories)")
```

#### `create_project(name, **kwargs)`

```python
client.create_project("My API", slug="my-api", description="Backend service")
```

#### `delete_project(project_id)`

```python
client.delete_project("project-id-here")
```

---

### Categories

#### `list_categories(project_id=None)`

```python
result = client.list_categories()
for cat in result["categories"]:
    print(f"  {cat['name']} ({cat['count']} memories)")
```

---

### API Keys

#### `list_api_keys()`

```python
result = client.list_api_keys()
for k in result["keys"]:
    print(f"  {k['prefix']}... — {k['name']}")
```

#### `create_api_key(name)`

```python
result = client.create_api_key("laptop")
print(f"Key: {result['key']}")  # save this — shown only once
```

#### `delete_api_key(key_id)`

```python
client.delete_api_key("key-id-here")
```

---

### Server Info

#### `health()`

```python
info = client.health()
print(f"Status: {info['status']}, Version: {info['version']}")
```

#### `stats()`

```python
stats = client.stats()
print(f"Total memories: {stats['total']}, Server: {stats['version']}")
```

---

### Import

#### `import_file(content, source, project_id=None)`

```python
with open("CLAUDE.md") as f:
    result = client.import_file(f.read(), "claude.md")
    print(f"Imported: {result['imported']}, Skipped: {result['skipped']}")
```

#### `import_preview(content, source)`

```python
with open("CLAUDE.md") as f:
    preview = client.import_preview(f.read(), "claude.md")
    print(f"Would import {preview['count']} memories")
```

---

### Sync

```python
# Pull from cloud
pulled = client.sync_pull()

# Push to cloud
client.sync_push(changes)

# Status
status = client.sync_status()
print(f"Memories: {status['totalMemories']}")
```

---

## All Methods

| Method | Description |
|--------|-------------|
| `remember()` | Store a memory |
| `recall()` | Get memory by key |
| `search()` | Semantic search |
| `list()` | List memories |
| `update()` | Update existing memory |
| `forget()` | Delete a memory |
| `history()` | View version history |
| `restore()` | Restore previous version |
| `export()` | Export all memories |
| `list_projects()` | List projects |
| `create_project()` | Create project |
| `delete_project()` | Delete project |
| `list_categories()` | List categories |
| `list_api_keys()` | List API keys |
| `create_api_key()` | Create API key |
| `delete_api_key()` | Delete API key |
| `health()` | Server health check |
| `stats()` | Memory count + version |
| `import_file()` | Import from file |
| `import_preview()` | Dry-run import |
| `sync_pull()` | Pull from cloud |
| `sync_push()` | Push to cloud |
| `sync_status()` | Sync overview |

## License

MIT — [PonderDB](https://github.com/ponderdb/ponderdb)
