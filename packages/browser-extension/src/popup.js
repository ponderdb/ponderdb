// Load saved settings
chrome.storage.sync.get(
  { serverUrl: "http://127.0.0.1:7437", apiKey: "", projectId: "" },
  (items) => {
    document.getElementById("serverUrl").value = items.serverUrl;
    document.getElementById("apiKey").value = items.apiKey;
    document.getElementById("projectId").value = items.projectId;

    // Test connection on load
    if (items.apiKey) testConnection(items.serverUrl, items.apiKey);
  },
);

// Save settings
document.getElementById("save").addEventListener("click", () => {
  const serverUrl = document.getElementById("serverUrl").value.trim();
  const apiKey = document.getElementById("apiKey").value.trim();
  const projectId = document.getElementById("projectId").value.trim();

  chrome.storage.sync.set({ serverUrl, apiKey, projectId }, () => {
    const status = document.getElementById("status");
    status.textContent = "Settings saved!";
    status.className = "status ok";

    if (apiKey) testConnection(serverUrl, apiKey);
  });
});

async function testConnection(url, key) {
  const status = document.getElementById("status");
  try {
    const res = await fetch(`${url}/health`);
    if (res.ok) {
      const data = await res.json();
      status.textContent = `Connected — v${data.version}`;
      status.className = "status ok";
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    status.textContent = `Cannot connect: ${err.message}`;
    status.className = "status err";
  }
}
