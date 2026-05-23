# @ponderdb/python-sdk

Python SDK for [PonderDB](https://github.com/ponderdb/ponderdb) — Universal AI Agent Memory Server.

## Install

```bash
pip install ponderdb
```

## Usage

```python
from ponderdb import PonderClient

client = PonderClient(
    base_url="http://127.0.0.1:7437",
    api_key="pndr_xxx",
    project_id="my-project",
)

# Store
client.remember("auth/jwt", "RS256, 15min expiry", tags=["auth"])

# Recall
memory = client.recall("auth/jwt")

# Search
results = client.search("authentication", limit=5)

# List
page = client.list(category="config", limit=20)

# Delete
client.forget("auth/jwt")

# History
history = client.history("auth/jwt")
client.restore("auth/jwt", version=1)

# Import
with open("CLAUDE.md") as f:
    client.import_file(f.read(), "claude.md")
```

## Context Manager

```python
with PonderClient(api_key="pndr_xxx") as client:
    client.remember("key", "value")
```
