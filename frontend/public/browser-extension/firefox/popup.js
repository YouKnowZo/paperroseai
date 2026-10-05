const button = document.getElementById("review");
const status = document.getElementById("status");
const extensionApi = globalThis.browser || globalThis.chrome;

async function readVisibleText(tabId) {
  const extractVisibleText = () => (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60000);
  if (extensionApi.scripting?.executeScript) {
    const [injected] = await extensionApi.scripting.executeScript({ target: { tabId }, func: extractVisibleText });
    return injected?.result || "";
  }
  if (extensionApi.tabs?.executeScript) {
    const results = await extensionApi.tabs.executeScript(tabId, { code: `(${extractVisibleText.toString()})()` });
    return results?.[0] || "";
  }
  throw new Error("This browser does not support the page-reader permission API.");
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.classList.remove("error");
  status.textContent = "Reading visible page text…";
  try {
    const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:\/\//i.test(tab.url || "")) throw new Error("This page cannot be read. Try a normal website tab.");
    const text = await readVisibleText(tab.id);
    if (!text || text.length < 80) throw new Error("Not enough readable text. Open the terms page or select text on the page first.");
    await navigator.clipboard.writeText(text);
    const appUrl = new URL("https://" + new URL(tab.url).hostname + "/");
    appUrl.searchParams.set("extension", "1");
    await extensionApi.tabs.create({ url: appUrl.toString() });
    status.textContent = "Copied. Paste the text into PaperRoseAI, then press Analyze when ready.";
  } catch (error) {
    status.classList.add("error");
    status.textContent = error?.message || "Could not read this page.";
    button.disabled = false;
  }
});
