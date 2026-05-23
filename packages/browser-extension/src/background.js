// Context menu: right-click → Save to PonderDB
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ponderdb-save",
    title: "Save to PonderDB",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "ponderdb-save" || !info.selectionText) return;

  const { serverUrl, apiKey, projectId } = await chrome.storage.sync.get({
    serverUrl: "http://127.0.0.1:7437",
    apiKey: "",
    projectId: "",
  });

  if (!apiKey) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "PonderDB",
      message: "Set your API key in the extension popup first.",
    });
    return;
  }

  const pageTitle = tab?.title || "untitled";
  const key = `web/${slugify(pageTitle)}`;
  const content = info.selectionText;

  try {
    const body = { key, content, tags: ["web", "saved"], projectId: projectId || undefined };
    const res = await fetch(`${serverUrl}/api/memories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icon48.png",
        title: "PonderDB",
        message: `Saved: ${key}`,
      });
    } else {
      const data = await res.json();
      throw new Error(data?.error?.message || `HTTP ${res.status}`);
    }
  } catch (err) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "PonderDB Error",
      message: err.message || "Failed to save memory",
    });
  }
});

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
