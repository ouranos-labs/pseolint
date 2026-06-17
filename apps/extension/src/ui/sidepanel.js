// Power surface. Owns the deep-scan gesture + host-permission request (only valid
// from an extension page), shows live coverage + a flagged-results list. Talks to
// the active SERP tab's content script (covered by the google.com/search host perm).
import { teardown, takeaway } from "../shared/teardown.js";

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
    // Distinguish "not a SERP" (no summary) from "on a SERP, nothing templated".
    $("landscape").textContent = !s
      ? NO_SERP
      : s.templated
        ? `${s.templated}/${s.total} results templated · ${s.hostCount} host(s)`
        : `${s.total} results · none look templated`;
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

const TAG_CLASS = { thin: "thin", "soft 404": "soft", "no OG tags": "og", templated: "templated", AEO: "aeo" };

// Render the SERP competitive scorecard from the teardown model. All untrusted
// host strings via textContent (§9); facts on rows, framing only in the summary.
function render(results) {
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
  $("takeaway").textContent = takeaway(t); // the synthesized "so what"

  const headline = $("headline");
  headline.append(document.createTextNode("This SERP: "));
  const satB = document.createElement("b"); satB.textContent = `${sat.templated}/${sat.total} templated`; headline.append(satB);
  headline.append(document.createTextNode(" · content bar "));
  const barB = document.createElement("b"); barB.textContent = `${t.bar}w`; headline.append(barB);
  if (sat.topHost) headline.append(document.createTextNode(` · ${sat.topHost} ×${sat.topHostCount}`));
  headline.append(document.createTextNode(` · ${t.aeoReady}/${t.scanned} AEO-ready`));

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
}

$("scan").addEventListener("click", deepScan);
loadLandscape();
