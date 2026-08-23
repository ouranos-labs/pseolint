// Power surface. Owns the deep-scan gesture + host-permission request (only valid
// from an extension page), shows live coverage + a flagged-results list. Talks to
// the active SERP tab's content script (covered by the google.com/search host perm).
import { isGoogleSearch, isWebSerp } from "../content/serp/detect.js";
import { teardown, takeaway, userHost, buildWin } from "../shared/teardown.js";

const SCAN_PERMISSION = { origins: ["https://*/*"] };
const AUDIT_PREFILL = "https://pseolint.dev/?prefill=";
const NO_SERP = "Open a Google results page to analyze it.";
const NOT_WEB = "Switch to the All tab: pseolint reads Web results.";
const $ = (id) => document.getElementById(id);

let lastResults = []; // cached so "your site" can re-render when the domain changes
let myHost = ""; // the user's tracked domain (stored locally, never transmitted)
let serpQuery = ""; // the current SERP's query (?q=), carried into the win deep-link

// Wipe the deep-scan scorecard (takeaway/headline/opening/results/cta/opps). Called
// when we leave a SERP or the user navigates to a new query: the old teardown is
// stale. Landscape summary + scan button are handled by the caller.
function clearScorecard() {
  lastResults = [];
  for (const id of ["status", "takeaway", "headline", "opening", "results"]) $(id).textContent = "";
  $("cta").hidden = true;
  $("cta-sub").hidden = true;
  $("serp-opportunities").style.display = "none";
}

// The SERP query (?q=): carried into the win-bridge deep-link so the SaaS can
// frame the audit as "win the '<query>' SERP". "" when absent/unparseable.
function serpKeyword(url) {
  try { return new URL(url).searchParams.get("q") || ""; } catch { return ""; }
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

// Not a scannable Web SERP → dormant. Distinguish a Google vertical (Images/News,
// "switch to All") from not-a-SERP-at-all, and clear the scorecard either way.
function showNotScannable(url) {
  $("landscape").textContent = isGoogleSearch(url) ? NOT_WEB : NO_SERP;
  $("aio").style.display = "none";
  $("scan").disabled = true;
  $("scan").textContent = "Deep scan this SERP";
  clearScorecard();
}

// Refresh the landscape summary (only). Does NOT touch the scorecard, so editing
// the tracked domain while viewing results doesn't wipe them; navigation clears
// the scorecard separately via onTabChange.
async function loadLandscape() {
  const tab = await getActiveTab();
  const url = tab?.url || "";
  if (!isWebSerp(url)) { showNotScannable(url); return; }

  $("scan").disabled = false;
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
  serpQuery = serpKeyword(tab.url);
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

const TAG_CLASS = { 
  thin: "thin",
  "soft 404": "soft",
  "no OG tags": "og",
  templated: "templated",
  AEO: "aeo",
  "no Author": "eeat",
  "no Date": "eeat",
  "title rewritten": "opp",
  "no meta desc": "opp",
  "meta desc ignored": "opp",
  "no schema": "opp"
};

// Render the SERP competitive scorecard from the teardown model. All untrusted
// host strings via textContent (§9); facts on rows, framing only in the summary.
// "Where do I stand?"; match the tracked domain against this SERP. Recon about
// the live SERP (descriptive), not a deep audit of your site (that's the SaaS).
function renderYourSite() {
  const el = $("yoursite");
  if (!myHost || lastResults.length === 0) { el.textContent = ""; return; }
  const t = teardown(lastResults);
  const mine = t.rows.find((r) => r.host === myHost);
  el.textContent = mine
    ? `Your site (${myHost}): #${mine.rank} · ${mine.words}w` + (mine.belowBar ? `, below the ${t.bar}w bar` : ", clears the bar")
    : `${myHost} isn't on this SERP; the field is open.`;
}

function render(results) {
  lastResults = results;
  const list = $("results");
  list.textContent = "";
  $("headline").textContent = "";
  $("takeaway").textContent = "";
  $("opening").textContent = "";
  $("cta").hidden = true;
  $("cta-sub").hidden = true;
  if (results.length === 0) {
    $("status").textContent = "No results found: open a Google results page.";
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

  // Calculate opportunities
  let titleRewritten = 0;
  let noMetaDesc = 0;
  let metaDescIgnored = 0;
  let eeatGaps = 0;
  let noSchema = 0;
  let thinContent = 0;

  for (const r of t.rows) {
    if (!r.ok) continue;
    if (r.tags.includes("title rewritten")) titleRewritten++;
    if (r.tags.includes("no meta desc")) noMetaDesc++;
    if (r.tags.includes("meta desc ignored")) metaDescIgnored++;
    if (r.tags.includes("no Author") || r.tags.includes("no Date")) eeatGaps++;
    if (r.tags.includes("no schema")) noSchema++;
    if (r.tags.includes("thin")) thinContent++;
  }

  const oppList = $("opportunities-list");
  oppList.textContent = "";
  let oppsFound = false;

  const addOpp = (label, count, desc) => {
    if (count > 0) {
      oppsFound = true;
      const item = document.createElement("div");
      item.className = "opportunity-item";
      const bullet = document.createElement("span");
      bullet.className = "opportunity-bullet";
      bullet.textContent = "•";
      const content = document.createElement("span");
      content.innerHTML = `<b>${label}</b>: ${count} competitor(s) ${desc}`;
      item.append(bullet, content);
      oppList.append(item);
    }
  };

  addOpp("Title Rewrites", titleRewritten, "have titles rewritten by Google (keyword/intent alignment gap).");
  addOpp("Missing Meta Descriptions", noMetaDesc, "lack a meta description (direct CTR improvement gap).");
  addOpp("Meta Description Ignored", metaDescIgnored, "have meta descriptions ignored/rewritten by Google (poor search relevance).");
  addOpp("E-E-A-T Metadata Gaps", eeatGaps, "lack Author or publication Date signals (credibility gap).");
  addOpp("No Structured Data", noSchema, "lack JSON-LD schema markup (rich snippets/AEO gap).");
  addOpp("Thin Content Gaps", thinContent, "have thin content with low word counts (< 150 words).");

  if (oppsFound) {
    $("serp-opportunities").style.display = "block";
  } else {
    $("serp-opportunities").style.display = "none";
  }

  // Win bridge, the primary conversion: point the hot "found an opening" moment
  // at the hosted audit (the moat), adapted to the user's position on this SERP.
  const win = buildWin(t, myHost, serpQuery);
  const cta = $("cta");
  const ctaSub = $("cta-sub");
  if (win && win.mode === "set-domain") {
    cta.textContent = win.primary;
    cta.href = "https://pseolint.dev";
    cta.dataset.prompt = "1"; // click focuses the domain input (handler below)
  } else if (win) {
    cta.textContent = win.primary;
    cta.href = win.href;
    delete cta.dataset.prompt;
  } else { // no opening: generic fallback
    cta.textContent = "Audit your own site →";
    cta.href = "https://pseolint.dev";
    delete cta.dataset.prompt;
  }
  ctaSub.textContent = win && win.sub ? win.sub : "";
  ctaSub.hidden = !(win && win.sub);
  cta.hidden = false;
  renderYourSite();
}

async function handleScanClick() {
  const tab = await getActiveTab();
  if (isWebSerp(tab?.url)) {
    await deepScan();
  }
}

$("scan").addEventListener("click", handleScanClick);

// In set-domain mode the win CTA prompts for the domain rather than navigating
// (degrades to pseolint.dev if JS is disabled, since it keeps a real href).
$("cta").addEventListener("click", (e) => {
  if ($("cta").dataset.prompt) { e.preventDefault(); $("domain").focus(); }
});

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

// A tab switch or a navigation makes the previous SERP's deep-scan stale: clear
// the scorecard, then re-derive landscape state from the (new) active tab.
async function onTabChange() {
  clearScorecard();
  await loadLandscape();
}

// Auto-refresh on active tab switching AND navigation. changeInfo.url catches SPA
// query/vertical changes on the Google SERP that never reach status:"complete".
// onUpdated fires for EVERY tab, so ignore updates to any tab but the one the panel
// is showing: otherwise a background tab's load wipes the current scorecard.
chrome.tabs?.onActivated?.addListener(onTabChange);
chrome.tabs?.onUpdated?.addListener((tabId, changeInfo) => {
  if (!(changeInfo.status === "complete" || changeInfo.url)) return;
  getActiveTab().then((tab) => { if (tab?.id === tabId) onTabChange(); });
});

// Live updates pushed by the SERP content script. runtime.sendMessage is an
// extension-wide BROADCAST, so a background Google tab's content script reaches
// this listener too: gate on sender.tab being the active tab before acting, or a
// background tab's nav would clear the scorecard the user is looking at. `reset`
// (a real navigation) re-derives full state (vertical hint + drops the stale
// scorecard); a plain update refreshes the summary only.
chrome.runtime.onMessage?.addListener((msg, sender) => {
  if (msg?.type !== "pseolint:landscape-updated") return;
  getActiveTab().then((tab) => {
    if (!sender.tab || sender.tab.id !== tab?.id) return; // ignore background tabs
    if (msg.reset) onTabChange();
    else renderLandscapeSummary(msg.summary);
  });
});

onTabChange();
