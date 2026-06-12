/**
 * Generates constructed calibration fixtures for two spam policies that have
 * NO reliable real-world live example:
 *   - hidden-text abuse (CSS-hidden keyword block; technique is invisible by design)
 *   - doorway pages (near-identical {city} pages funneling to one destination)
 *
 * These are deliberately synthetic recall targets: they let the harness measure
 * whether the engine detects these policies. Re-run to regenerate the fixtures.
 *
 *   bun run scripts/gen-constructed-fixtures.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(__dirname, "../packages/core/calibration/fixtures");

function writeFixture(hostDir, manifest, files) {
  const dir = join(FIX, hostDir);
  mkdirSync(dir, { recursive: true });
  for (const [name, html] of Object.entries(files)) {
    writeFileSync(join(dir, name), html, "utf-8");
  }
  writeFileSync(join(dir, "_manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(`wrote ${hostDir}/ — ${Object.keys(files).length} pages`);
}

// ---- 1. Doorway: near-identical {city} pages all linking to /contact -------
const DOORWAY_HOST = "https://doorwayspam.example";
const cities = ["Austin", "Dallas", "Houston", "Phoenix", "Denver", "Seattle"];
const slug = (c) => c.toLowerCase();
const doorwayFiles = {};
const doorwayManifest = {};
for (const city of cities) {
  const s = slug(city);
  const url = `${DOORWAY_HOST}/emergency-plumber-${s}`;
  const file = `emergency-plumber-${s}.html`;
  doorwayManifest[url] = file;
  doorwayFiles[file] = `<!DOCTYPE html><html lang="en"><head>
<title>Emergency Plumber in ${city} | FastPlumb</title>
<meta name="description" content="24/7 emergency plumber in ${city}. Call FastPlumb for fast, affordable plumbing repair in ${city}.">
<link rel="canonical" href="${url}">
</head><body>
<header><a href="${DOORWAY_HOST}/">FastPlumb</a></header>
<main>
<h1>Emergency Plumber in ${city}</h1>
<p>Need an emergency plumber in ${city}? FastPlumb provides 24/7 plumbing repair across ${city} and the nearby ${city} metro area. Our ${city} plumbers fix leaks, clogs, and burst pipes fast. Call now for affordable plumbing service in ${city}.</p>
<p>We are the top-rated emergency plumber in ${city}. Whether you need ${city} drain cleaning or ${city} water heater repair, our ${city} team is ready around the clock. Contact us for the best plumber in ${city} today.</p>
<p><a href="${DOORWAY_HOST}/contact">Contact us</a> to book your ${city} plumber now.</p>
</main>
<footer><a href="${DOORWAY_HOST}/contact">Contact</a></footer>
</body></html>
`;
}
doorwayManifest[`${DOORWAY_HOST}/contact`] = "contact.html";
doorwayFiles["contact.html"] = `<!DOCTYPE html><html lang="en"><head>
<title>Contact FastPlumb</title>
<meta name="description" content="Contact FastPlumb to book an emergency plumber.">
<link rel="canonical" href="${DOORWAY_HOST}/contact">
</head><body>
<main><h1>Contact Us</h1>
<form action="/lead" method="post"><input name="phone" placeholder="Your phone"><button>Call me back</button></form>
</main></body></html>
`;
writeFixture("doorwayspam_example", doorwayManifest, doorwayFiles);

// ---- 2. Hidden text: thin visible content + CSS-hidden keyword block -------
const HT_HOST = "https://hiddentextspam.example";
const htProducts = ["cheap-widgets", "discount-gadgets", "bulk-gizmos", "wholesale-doohickeys"];
const stuffWords = (term) =>
  Array.from({ length: 90 }, (_, i) =>
    ["cheap", "buy", "discount", "best", "online", "wholesale", "bulk", "sale", "deal", "top"][i % 10] + " " + term,
  ).join(" ");
const htFiles = {};
const htManifest = {};
for (const p of htProducts) {
  const term = p.replace(/-/g, " ");
  const url = `${HT_HOST}/${p}`;
  const file = `${p}.html`;
  htManifest[url] = file;
  htFiles[file] = `<!DOCTYPE html><html lang="en"><head>
<title>${term} | WidgetHub</title>
<meta name="description" content="Shop ${term} at WidgetHub.">
<link rel="canonical" href="${url}">
</head><body>
<main>
<h1>${term}</h1>
<p>Welcome to WidgetHub. We sell ${term}.</p>
<div style="position:absolute;left:-9999px;top:-9999px;color:#ffffff;font-size:0;background:#ffffff;" aria-hidden="false">
${stuffWords(term)}
</div>
</main></body></html>
`;
}
htManifest[`${HT_HOST}/`] = "index.html";
htFiles["index.html"] = `<!DOCTYPE html><html lang="en"><head>
<title>WidgetHub</title>
<meta name="description" content="WidgetHub store.">
<link rel="canonical" href="${HT_HOST}/">
</head><body>
<main><h1>WidgetHub</h1><p>We sell widgets and gadgets.</p>
<ul>${htProducts.map((p) => `<li><a href="${HT_HOST}/${p}">${p.replace(/-/g, " ")}</a></li>`).join("")}</ul>
</main></body></html>
`;
writeFixture("hiddentextspam_example", htManifest, htFiles);

console.log("done");
