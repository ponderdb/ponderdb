"""PonderDB Python SDK — programmatic access to PonderDB memory server."""

from __future__ import annotations

from typing import Any, Optional

import httpx


class PonderError(Exception):
    """Error from PonderDB API."""

    def __init__(self, message: str, status_code: int = 0, code: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class PonderClient:
    """PonderDB client for Python.

    Example::

        from ponderdb import PonderClient

        client = PonderClient(
            base_url="http://127.0.0.1:7437",
            api_key="pndr_xxx",
            project_id="my-project",
        )

        # Store
        client.remember("auth/jwt", "RS256 with 15min expiry")

        # Recall
        memory = client.recall("auth/jwt")

        # Search
        results = client.search("authentication")

        # List
        memories = client.list(category="config")
    """

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:7437",
        api_key: Optional[str] = None,
        project_id: Optional[str] = None,
        timeout: float = 30.0,
    ):
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        self._http = httpx.Client(base_url=base_url, headers=headers, timeout=timeout)
        self._default_project_id = project_id

    def close(self) -> None:
        """Close the HTTP client."""
        self._http.close()

    def __enter__(self) -> "PonderClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        res = self._http.request(method, path, **kwargs)
        if res.status_code >= 400:
            body = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            error = body.get("error", {})
            raise PonderError(
                error.get("message", f"HTTP {res.status_code}"),
                status_code=res.status_code,
                code=error.get("code", ""),
            )
        return res.json()

    # ── Memory operations ──

    def remember(
        self,
        key: str,
        content: str,
        *,
        category: Optional[str] = None,
        importance: Optional[str] = None,
        tags: Optional[list[str]] = None,
        project_id: Optional[str] = None,
        is_global: bool = False,
    ) -> dict[str, Any]:
        """Store a memory."""
        body: dict[str, Any] = {"key": key, "content": content}
        if category:
            body["category"] = category
        if importance:
            body["importance"] = importance
        if tags:
            body["tags"] = tags
        if is_global:
            body["isGlobal"] = True
        body["projectId"] = project_id or self._default_project_id
        return self._request("POST", "/api/memories", json=body)

    def recall(self, key: str, project_id: Optional[str] = None) -> Optional[dict[str, Any]]:
        """Retrieve a memory by key. Returns None if not found."""
        pid = project_id or self._default_project_id
        params = {"projectId": pid} if pid else {}
        try:
            return self._request("GET", f"/api/memories/{key}", params=params)
        except PonderError as e:
            if e.status_code == 404:
                return None
            raise

    def search(
        self,
        query: str,
        *,
        category: Optional[str] = None,
        limit: int = 10,
        project_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Semantic + keyword search."""
        body: dict[str, Any] = {"query": query, "limit": limit}
        if category:
            body["category"] = category
        body["projectId"] = project_id or self._default_project_id
        res = self._request("POST", "/api/memories/search", json=body)
        return res.get("results", [])

    def list(
        self,
        *,
        category: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "updatedAt",
        sort_order: str = "desc",
    ) -> dict[str, Any]:
        """List memories with filters."""
        params: dict[str, Any] = {"limit": limit, "offset": offset, "sortBy": sort_by, "sortOrder": sort_order}
        if category:
            params["category"] = category
        pid = project_id or self._default_project_id
        if pid:
            params["projectId"] = pid
        return self._request("GET", "/api/memories", params=params)

    def forget(self, key: str, project_id: Optional[str] = None) -> dict[str, Any]:
        """Delete a memory."""
        pid = project_id or self._default_project_id
        params = {"projectId": pid} if pid else {}
        return self._request("DELETE", f"/api/memories/{key}", params=params)

    # ── History ──

    def history(self, key: str, project_id: Optional[str] = None) -> dict[str, Any]:
        """Get version history for a memory."""
        body: dict[str, Any] = {"key": key}
        body["projectId"] = project_id or self._default_project_id
        return self._request("POST", "/api/memories/history", json=body)

    def restore(self, key: str, version: int, project_id: Optional[str] = None) -> dict[str, Any]:
        """Restore a memory to a previous version."""
        body: dict[str, Any] = {"key": key, "version": version}
        body["projectId"] = project_id or self._default_project_id
        return self._request("POST", "/api/memories/restore", json=body)

    # ── Import ──

    def import_file(
        self,
        content: str,
        source: str,
        project_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Import memories from instruction file content."""
        body: dict[str, Any] = {"content": content, "source": source}
        body["projectId"] = project_id or self._default_project_id
        return self._request("POST", "/api/import", json=body)

    def import_preview(self, content: str, source: str) -> dict[str, Any]:
        """Preview what would be imported (dry run)."""
        return self._request("POST", "/api/import/preview", json={"content": content, "source": source})

    # ── Sync ──

    def sync_pull(self, since: Optional[str] = None) -> dict[str, Any]:
        """Pull changes from cloud since timestamp."""
        return self._request("POST", "/api/sync/pull", json={"since": since})

    def sync_push(self, changes: dict[str, Any]) -> dict[str, Any]:
        """Push local changes to cloud."""
        return self._request("POST", "/api/sync/push", json=changes)

    def sync_status(self) -> dict[str, Any]:
        """Get sync overview."""
        return self._request("GET", "/api/sync/status")

    # ── Update ──

    def update(
        self,
        key: str,
        *,
        content: Optional[str] = None,
        category: Optional[str] = None,
        importance: Optional[str] = None,
        tags: Optional[list[str]] = None,
        project_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Update an existing memory."""
        body: dict[str, Any] = {}
        if content is not None:
            body["content"] = content
        if category is not None:
            body["category"] = category
        if importance is not None:
            body["importance"] = importance
        if tags is not None:
            body["tags"] = tags
        pid = project_id or self._default_project_id
        params = {"projectId": pid} if pid else {}
        return self._request("PUT", f"/api/memories/{key}", json=body, params=params)

    # ── Projects ──

    def list_projects(self) -> dict[str, Any]:
        """List all projects."""
        return self._request("GET", "/api/projects")

    def create_project(
        self,
        name: str,
        *,
        slug: Optional[str] = None,
        description: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new project."""
        body: dict[str, Any] = {"name": name}
        if slug:
            body["slug"] = slug
        if description:
            body["description"] = description
        return self._request("POST", "/api/projects", json=body)

    def delete_project(self, project_id: str) -> dict[str, Any]:
        """Delete a project and all its memories."""
        return self._request("DELETE", f"/api/projects/{project_id}")

    # ── Categories ──

    def list_categories(self, project_id: Optional[str] = None) -> dict[str, Any]:
        """List categories with memory counts."""
        pid = project_id or self._default_project_id
        params = {"projectId": pid} if pid else {}
        return self._request("GET", "/api/categories", params=params)

    # ── API Keys ──

    def list_api_keys(self) -> dict[str, Any]:
        """List API keys (prefix only, no secrets)."""
        return self._request("GET", "/api/auth/keys")

    def create_api_key(self, name: str) -> dict[str, Any]:
        """Create a new API key. Save the returned key — it won't be shown again."""
        return self._request("POST", "/api/auth/keys", json={"name": name})

    def delete_api_key(self, key_id: str) -> dict[str, Any]:
        """Delete an API key."""
        return self._request("DELETE", f"/api/auth/keys/{key_id}")

    # ── Health ──

    def health(self) -> dict[str, Any]:
        """Check server health and version."""
        return self._request("GET", "/health")

    # ── Export ──

    def export(
        self,
        *,
        project_id: Optional[str] = None,
        category: Optional[str] = None,
        limit: int = 10000,
    ) -> list[dict[str, Any]]:
        """Export all memories as a list of dicts."""
        result = self.list(
            project_id=project_id,
            category=category,
            limit=limit,
            sort_by="updatedAt",
            sort_order="desc",
        )
        return result.get("items", [])

    # ── Stats ──

    def stats(self) -> dict[str, Any]:
        """Get server stats."""
        health = self._request("GET", "/health")
        memories = self._request("GET", "/api/memories", params={"limit": 0})
        return {"total": memories.get("total", 0), "version": health.get("version", "")}
