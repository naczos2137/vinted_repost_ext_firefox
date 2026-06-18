// Background script for Vinted Reposter

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetch_image_as_base64") {
    // Background scripts have looser CORS restrictions
    fetch(request.url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => sendResponse({ base64: reader.result });
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        console.error("[VintedBackground] Fetch error:", error);
        sendResponse({ error: error.message });
      });
    return true; // Keep channel open for async fetch
  }
  
  if (request.action === "repost_start") {
    console.log("[VintedBackground] Starting repost, saving data and redirecting...");
    chrome.storage.local.set({ repostData: request.data }, () => {
      chrome.tabs.update(sender.tab.id, { url: "https://www.vinted.fr/items/new" });
      sendResponse({ status: "redirecting" });
    });
    return true;
  }
});
