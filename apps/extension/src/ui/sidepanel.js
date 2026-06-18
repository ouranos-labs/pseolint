// Power surface. Owns the deep-scan gesture + host-permission request (only valid
// from an extension page), shows live coverage + a flagged-results list. Talks to
// the active SERP tab's content script (covered by the google.com/search host perm).
import { teardown, takeaway, userHost } from "../shared/teardown.js";
import { scanPage } from "../shared/rules-client.js";

const SCAN_PERMISSION = { origins: ["https://*/*"] };
const AUDIT_PREFILL = "https://pseolint.dev/?prefill=";
const NO_SERP = "Open a Google results page to analyze it.";
const $ = (id) => document.getElementById(id);

let lastResults = []; // cached so "your site" can re-render when the domain changes
let myHost = ""; // the user's tracked domain (stored locally, never transmitted)

function isGoogleSerp(url) {
  if (!url) return false;
  return /^https:\/\/(www\.)?google\.[a-z.]+\/search/i.test(url);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderLandscapeSummary(s) {
  // Distinguish "not a SERP" (no summary) from "on a SERP, nothing templated".
  $("landscape").textContent = !s
    ? NO_SERP
    : s.templated
      ? `${s.templated}/${s.total} results templated · ${s.hostCount} host(s)`
      : `${s.total} results · none look templated`;

  // AI Overview (SGE) citation checks
  const aioEl = $("aio");
  if (s && s.aioCitations && s.aioCitations.length > 0) {
    aioEl.style.display = "block";
    const count = s.aioCitations.length;
    
    const hostClean = myHost ? myHost.toLowerCase() : "";
    const isCited = s.aioCitations.some(url => {
      try {
        return new URL(url).hostname.replace(/^www\./, "").toLowerCase() === hostClean;
      } catch {
        return url.toLowerCase().includes(hostClean);
      }
    });
    
    if (hostClean) {
      aioEl.innerHTML = `<b>AI Overview:</b> ${count} source(s) cited. <br/>` + 
        (isCited 
          ? `<span style="color:var(--primary); font-weight:bold;">✓ Your site (${myHost}) is cited in SGE!</span>` 
          : `<span style="color:var(--warn); font-weight:bold;">✗ Your site (${myHost}) is NOT cited. Gap detected.</span>`);
    } else {
      aioEl.innerHTML = `<b>AI Overview:</b> ${count} source(s) cited.`;
    }
  } else {
    aioEl.style.display = "none";
  }
}

async function loadLandscape() {
  const tab = await getActiveTab();
  const url = tab?.url || "";

  if (!isGoogleSerp(url)) {
    $("landscape").textContent = "Active page: " + (url ? new URL(url).hostname : "None");
    $("aio").style.display = "none";
    $("scan").textContent = "Audit active page";
    return;
  }

  $("scan").textContent = "Deep scan this SERP";

  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: "pseolint:landscape" });
    renderLandscapeSummary(reply?.summary);
  } catch {
    $("landscape").textContent = NO_SERP;
    $("aio").style.display = "none";
  }
}

async function deepScan() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
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
    const reply = await chrome.tabs.sendMessage(tab.id, { type: "pseolint:deep-scan" });
    render(reply?.results ?? []);
  } catch {
    $("status").textContent = NO_SERP;
  }
  $("scan").disabled = false;
}

async function auditActivePage(tab) {
  if (!tab || !tab.id) return;
  $("scan").disabled = true;
  $("status").textContent = "Auditing active tab DOM...";
  
  try {
    const [{ result: html }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML
    });
    
    if (!html) {
      $("status").textContent = "Failed to retrieve page HTML.";
      $("scan").disabled = false;
      return;
    }
    
    const scan = scanPage(html, tab.url, 200);
    
    $("sa-url").textContent = tab.url;
    $("sa-words").textContent = `${scan.words} words`;
    $("sa-aeo").textContent = scan.aeoReady ? "Yes" : "No";
    $("sa-og").textContent = scan.ogComplete ? "Complete" : "Missing / Incomplete";
    $("sa-signature").textContent = scan.structureSignature || "N/A";
    
    const flagsContainer = $("sa-flags");
    flagsContainer.textContent = "";
    
    if (scan.isLikelyShell) {
      const tag = document.createElement("span");
      tag.className = "tag templated";
      tag.textContent = "likely SPA shell";
      flagsContainer.append(tag);
    }
    
    if (scan.flags && scan.flags.length > 0) {
      for (const flag of scan.flags) {
        const tag = document.createElement("span");
        const cleanFlag = flag.toLowerCase();
        let cls = "strong";
        if (cleanFlag.includes("thin") || cleanFlag.includes("soft")) cls = "thin";
        else if (cleanFlag.includes("og")) cls = "og";
        else if (cleanFlag.includes("author") || cleanFlag.includes("date")) cls = "eeat";
        
        tag.className = `tag ${cls}`;
        tag.textContent = flag;
        flagsContainer.append(tag);
      }
    } else if (!scan.isLikelyShell) {
      const tag = document.createElement("span");
      tag.className = "tag strong";
      tag.textContent = "no warning flags";
      flagsContainer.append(tag);
    }
    
    $("single-audit").style.display = "block";
    $("status").textContent = "Audit complete!";
  } catch (err) {
    $("status").textContent = "Error auditing active page: " + err.message;
  }
  $("scan").disabled = false;
}

const TAG_CLASS = { 
  thin: "thin", 
  "soft 404": "soft", 
  "no OG tags": "og", 
  templated: "templated", 
  AEO: "aeo",
  "no Author": "eeat",
  "no Date": "eeat"
};

// Render the SERP competitive scorecard from the teardown model. All untrusted
// host strings via textContent (§9); facts on rows, framing only in the summary.
// "Where do I stand?" — match the tracked domain against this SERP. Recon about
// the live SERP (descriptive), not a deep audit of your site (that's the SaaS).
function renderYourSite() {
  const el = $("yoursite");
  if (!myHost || lastResults.length === 0) { el.textContent = ""; return; }
  const t = teardown(lastResults);
  const mine = t.rows.find((r) => r.host === myHost);
  el.textContent = mine
    ? `Your site (${myHost}): #${mine.rank} · ${mine.words}w` + (mine.belowBar ? ` — below the ${t.bar}w bar` : " — clears the bar")
    : `${myHost} isn't on this SERP — the field is open.`;
}

function render(results) {
  lastResults = results;
  const list = $("results");
  list.textContent = "";
  $("headline").textContent = "";
  $("takeaway").textContent = "";
  $("opening").textContent = "";
  $("cta").hidden = true;
  if (results.length === 0) {
    $("status").textContent = "No results found — open a Google results page.";
    return;
  }
  const t = teardown(results);
  const sat = t.saturation;
  $("status").textContent = `Scanned ${t.scanned}/${results.length}` + (t.failed ? ` · ${t.failed} failed` : "");
  $("takeaway").textContent = takeaway(t) + (t.monotony ? " [Warning: High Layout Monotony on SERP - templates overlap heavily]" : ""); // the synthesized "so what"

  const headline = $("headline");
  headline.append(document.createTextNode("This SERP: "));
  const satB = document.createElement("b"); satB.textContent = `${sat.templated}/${sat.total} templated`; headline.append(satB);
  headline.append(document.createTextNode(" · content bar "));
  const barB = document.createElement("b"); barB.textContent = `${t.bar}w`; headline.append(barB);
  if (sat.topHost) headline.append(document.createTextNode(` · ${sat.topHost} ×${sat.topHostCount}`));
  headline.append(document.createTextNode(` · ${t.aeoReady}/${t.scanned} AEO-ready`));
  if (t.monotony) {
    const monB = document.createElement("span");
    monB.style.color = "var(--warn)";
    monB.style.marginLeft = "8px";
    monB.style.fontWeight = "bold";
    monB.textContent = "⚠ Structural Monotony";
    headline.append(monB);
  }

  if (t.opening) {
    const o = $("opening");
    o.append(document.createTextNode("The opening: "));
    const b = document.createElement("b");
    b.textContent = `${t.opening.host} ranks #${t.opening.rank} on ${t.opening.words}w`;
    o.append(b);
    o.append(document.createTextNode(t.opening.tags.length ? ` (${t.opening.tags.join(", ")}).` : "."));
  }

  const maxW = Math.max(1, ...t.rows.map((r) => r.words));
  for (const r of t.rows) {
    const li = document.createElement("li");
    const rank = document.createElement("span"); rank.className = "rank"; rank.textContent = `#${r.rank}`;
    const who = document.createElement("div"); who.className = "who";
    const h = document.createElement("div"); h.className = "host"; h.textContent = r.host;
    const bar = document.createElement("div");
    bar.className = "bar" + (r.belowBar ? " below" : "");
    bar.style.width = `${r.ok && !r.isLikelyShell ? Math.max(4, Math.round((r.words / maxW) * 100)) : 0}%`;
    who.append(h, bar);
    const meta = document.createElement("div"); meta.className = "meta";
    if (!r.ok) {
      const w = document.createElement("span"); w.className = "w"; w.textContent = "unscanned"; meta.append(w);
    } else {
      const w = document.createElement("span"); w.className = "w"; w.textContent = `${r.words}w`; meta.append(w);
      for (const tag of (r.tags.length ? r.tags : ["strong"])) {
        const el = document.createElement("span");
        el.className = `tag ${TAG_CLASS[tag] ?? "strong"}`;
        el.textContent = tag;
        meta.append(el);
      }
      const a = document.createElement("a");
      a.href = AUDIT_PREFILL + encodeURIComponent(r.url);
      a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = "↗";
      a.setAttribute("aria-label", `Open full pseolint audit for ${r.host}`);
      meta.append(a);
    }
    li.append(rank, who, meta);
    list.append(li);
  }
  $("cta").hidden = false;
  renderYourSite();
}

async function handleScanClick() {
  const tab = await getActiveTab();
  if (isGoogleSerp(tab?.url)) {
    await deepScan();
  } else {
    await auditActivePage(tab);
  }
}

$("scan").addEventListener("click", handleScanClick);

// Tracked domain: load from local storage, persist on edit, re-render the match.
chrome.storage?.local?.get?.("domain").then((o) => {
  myHost = userHost(o?.domain ?? "");
  if (myHost) $("domain").value = myHost;
  renderYourSite();
  loadLandscape();
}).catch(() => {});
$("domain").addEventListener("input", (e) => {
  myHost = userHost(e.target.value);
  chrome.storage?.local?.set?.({ domain: myHost }).catch(() => {});
  renderYourSite();
  loadLandscape();
});

async function autoAuditActivePage() {
  const tab = await getActiveTab();
  const url = tab?.url || "";
  if (url && !isGoogleSerp(url)) {
    $("headline").textContent = "";
    $("opening").textContent = "";
    $("takeaway").textContent = "";
    $("results").textContent = "";
    $("cta").hidden = true;
    await auditActivePage(tab);
  } else {
    $("single-audit").style.display = "none";
    await loadLandscape();
  }
}

// Auto-refresh panel state on active tab navigation/switching
chrome.tabs?.onActivated?.addListener(() => {
  autoAuditActivePage();
});
chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    autoAuditActivePage();
  }
});

// Live message listener for observed SERP DOM changes
chrome.runtime.onMessage?.addListener((msg) => {
  if (msg?.type === "pseolint:landscape-updated") {
    renderLandscapeSummary(msg.summary);
  }
});

autoAuditActivePage();
