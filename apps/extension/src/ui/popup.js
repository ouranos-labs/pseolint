// pseolint extension — toolbar popup (architecture §3 `ui/`, §7/§11).
//
// The popup exists for one structural reason: chrome.permissions.request() must
// run from an extension page inside a live user gesture — a content script can't
// call it at all (chrome.permissions is undefined there), and forwarding it to
// the service worker loses the gesture. So the "Scan" gesture lives HERE: it
// requests host access (granted for this scan, not standing — §7) and tells the
// SERP content script to detect + badge. That click is also the §11 consent that
// we fetch the ranked results on the user's behalf.

// Broad but OPTIONAL: results live on arbitrary hosts. Granted on this click only.
const SCAN_PERMISSION = { origins: ["https://*/*"] };

const button = document.getElementById("scan");
const status = document.getElementById("status");

button.addEventListener("click", async () => {
  button.disabled = true;
  status.textContent = "Requesting access…";

  const granted = await chrome.permissions.request(SCAN_PERMISSION).catch(() => false);
  if (!granted) {
    status.textContent = "Host access is needed to scan the results.";
    button.disabled = false;
    return;
  }

  // activeTab (granted by this action click) lets us message the active tab's
  // content script without standing `tabs` access.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  status.textContent = "Scanning…";
  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: "pseolint:run" });
    status.textContent =
      reply?.flagged > 0 ? `Flagged ${reply.flagged} result(s).` : "No issues flagged.";
  } catch {
    // No content script answered → not a Google results page.
    status.textContent = "Open a Google search results page, then scan.";
  }
  button.disabled = false;
});
