// Power surface. Owns the deep-scan gesture + host-permission request (only valid
// from an extension page), shows live coverage + a flagged-results list. Talks to
// the active SERP tab's content script (covered by the google.com/search host perm).
import { coverage } from "../shared/coverage.js";

const SCAN_PERMISSION = { origins: ["https://*/*"] };
const AUDIT_PREFILL = "https://pseolint.dev/?prefill=";
const NO_SERP = "Open a Google results page to analyze it.";
const $ = (id) => document.getElementById(id);

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function loadLandscape() {
  try {
    const reply = await chrome.tabs.sendMessage(await activeTabId(), { type: "pseolint:landscape" });
    const s = reply?.summary;
    $("landscape").textContent =
      s && s.templated ? `${s.templated}/${s.total} results templated · ${s.hostCount} host(s)` : NO_SERP;
  } catch {
    $("landscape").textContent = NO_SERP;
  }
}

async function deepScan() {
  $("scan").disabled = true;
  $("status").textContent = "Requesting access…";
  const granted = await chrome.permissions.request(SCAN_PERMISSION).catch(() => false);
  if (!granted) {
    $("status").textContent = "Host access is needed to deep-scan the results.";
    $("scan").disabled = false;
    return;
  }
  $("status").textContent = "Scanning…";
  try {
    const reply = await chrome.tabs.sendMessage(await activeTabId(), { type: "pseolint:deep-scan" });
    render(reply?.results ?? []);
  } catch {
    $("status").textContent = NO_SERP;
  }
  $("scan").disabled = false;
}

function render(results) {
  const c = coverage(results);
  $("status").textContent =
    `Scanned ${c.scanned}/${c.total}${c.failed ? ` · ${c.failed} failed` : ""} · ${c.flagged} flagged`;
  const list = $("results");
  list.textContent = ""; // clear
  for (const r of results.filter((x) => x.verdict)) {
    const li = document.createElement("li");
    const host = document.createElement("span");
    host.className = "host";
    try {
      host.textContent = new URL(r.url).hostname.replace(/^www\./, ""); // untrusted → textContent
    } catch {
      host.textContent = r.url;
    }
    const v = document.createElement("span");
    v.className = `v ${r.verdict.level}`;
    v.textContent = r.verdict.label;
    const a = document.createElement("a");
    a.href = AUDIT_PREFILL + encodeURIComponent(r.url);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "full audit ↗";
    li.append(host, v, a);
    list.append(li);
  }
}

$("scan").addEventListener("click", deepScan);
loadLandscape();
