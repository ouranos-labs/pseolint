#!/usr/bin/env bun
/**
 * Fully Automated headful SERP Scanner (Puppeteer Edition)
 * Uses Puppeteer to drive Chrome via WebSockets to avoid named-pipe timeouts.
 *
 * Usage:
 *   bun scripts/automate-serp.mjs
 */

import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = join(__dirname, "..", "serp-analysis-results.json");

// ── 63-Query Opportunity List for pseolint.dev ────────────────────────────────
const QUERIES = [
  // Penalty / manual action (symptom front door)
  { q: "google penalty checker", label: "penalty/checker" },
  { q: "how to check for google penalty", label: "penalty/how-to-check" },
  { q: "google manual action checker", label: "penalty/manual-action" },
  { q: "algorithmic penalty google", label: "penalty/algorithmic" },
  { q: "why did my google traffic drop", label: "symptom/traffic-drop" },
  { q: "sudden drop in google rankings", label: "symptom/ranking-drop" },
  { q: "website deindexed google", label: "symptom/deindexed" },
  { q: "pages dropped from google index", label: "symptom/pages-dropped" },
  { q: "google traffic dropped after update", label: "symptom/post-update-drop" },
  { q: "how to recover from google penalty", label: "penalty/recovery" },
  { q: "google penalty recovery service", label: "penalty/recovery-service" },
  { q: "remove google penalty", label: "penalty/removal" },

  // Google systems / policies
  { q: "helpful content update", label: "update/hcu" },
  { q: "helpful content update recovery", label: "update/hcu-recovery" },
  { q: "google core update", label: "update/core" },
  { q: "google core update recovery", label: "update/core-recovery" },
  { q: "site reputation abuse", label: "policy/site-reputation-abuse" },
  { q: "parasite seo", label: "policy/parasite-seo" },
  { q: "scaled content abuse", label: "policy/scaled-content-abuse" },
  { q: "google spam policies", label: "policy/spam-policies" },
  { q: "google spam update", label: "policy/spam-update" },
  { q: "expired domain abuse", label: "policy/expired-domain-abuse" },

  // Content quality
  { q: "thin content checker", label: "quality/thin-content-checker" },
  { q: "thin content seo", label: "quality/thin-content" },
  { q: "how to fix thin content", label: "quality/fix-thin-content" },
  { q: "duplicate content checker", label: "quality/duplicate-content" },
  { q: "doorway pages", label: "quality/doorway-pages" },
  { q: "doorway pages penalty", label: "quality/doorway-penalty" },
  { q: "low quality pages seo", label: "quality/low-quality-pages" },
  { q: "content quality checker", label: "quality/content-quality-checker" },
  { q: "boilerplate content seo", label: "quality/boilerplate" },

  // Programmatic SEO (practitioner)
  { q: "programmatic seo", label: "pseo/overview" },
  { q: "programmatic seo tools", label: "pseo/tools" },
  { q: "programmatic seo best practices", label: "pseo/best-practices" },
  { q: "programmatic seo penalty", label: "pseo/penalty" },
  { q: "programmatic seo google penalty", label: "pseo/google-penalty" },
  { q: "is programmatic seo dead", label: "pseo/is-it-dead" },
  { q: "programmatic seo guide", label: "pseo/guide" },
  { q: "programmatic seo examples", label: "pseo/examples" },
  { q: "how to scale content without penalty", label: "pseo/safe-scaling" },
  { q: "programmatic seo quality", label: "pseo/quality" },
  { q: "programmatic seo risks", label: "pseo/risks" },

  // Product category (bottom-funnel)
  { q: "seo audit tool", label: "product/seo-audit-tool" },
  { q: "technical seo audit", label: "product/technical-audit" },
  { q: "free seo audit", label: "product/free-audit" },
  { q: "seo audit checklist", label: "product/audit-checklist" },
  { q: "site audit tool", label: "product/site-audit" },
  { q: "seo crawler", label: "product/seo-crawler" },
  { q: "seo linter", label: "product/seo-linter" },
  { q: "website seo checker", label: "product/website-checker" },
  { q: "on page seo checker", label: "product/on-page-checker" },

  // Comparison / alternative
  { q: "screaming frog alternative", label: "compare/screaming-frog" },
  { q: "sitebulb alternative", label: "compare/sitebulb" },
  { q: "ahrefs site audit alternative", label: "compare/ahrefs" },
  { q: "semrush site audit alternative", label: "compare/semrush" },
  { q: "best seo audit tool", label: "compare/best-audit-tool" },

  // AEO / AI
  { q: "answer engine optimization", label: "aeo/overview" },
  { q: "how to get cited by ai overviews", label: "aeo/ai-citations" },
  { q: "how to rank in ai overviews", label: "aeo/rank-ai-overviews" },
  { q: "llms.txt", label: "aeo/llms-txt" },
  { q: "ai content detection seo", label: "aeo/ai-content" },
  { q: "generative engine optimization", label: "aeo/geo" },
  { q: "optimize for ai search", label: "aeo/ai-search" },
];

const results = [];

// Google's own surfaces (and its /url redirector host) are never "results".
const SKIP_HOST = /(^|\.)(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|youtube\.com)$/i;

function cleanResultUrl(href) {
  if (!href) return null;
  let u;
  try {
    u = new URL(href, "https://www.google.com");
  } catch {
    return null;
  }
  if (u.pathname === "/url") {
    const real = u.searchParams.get("q") || u.searchParams.get("url");
    if (!real) return null;
    try {
      u = new URL(real);
    } catch {
      return null;
    }
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (SKIP_HOST.test(u.hostname)) return null;
  return u.href;
}

// ── Opportunity Scoring ───────────────────────────────────────────────────────
function printOpportunitySummary() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║           SERP Opportunity Summary - pseolint.dev    ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const opps = [];
  for (const item of results) {
    const summary = item.landscape?.summary;
    const total = summary?.total ?? 0;
    const templated = summary?.templated ?? 0;
    const pSEORatio = total > 0 ? templated / total : 0;
    const score = Math.round(pSEORatio * 100);
    opps.push({ label: item.label, query: item.query, total, templated, pSEORatio: Math.round(pSEORatio * 100), score });
  }

  opps.sort((a, b) => b.score - a.score);

  console.log("Queries ranked by opportunity (higher = templated/pSEO competition):\n");
  for (const op of opps) {
    const bar = "█".repeat(Math.min(Math.round(op.score / 5), 20));
    console.log(`  [${String(op.score).padStart(3)}] ${bar}`);
    console.log(`        ${op.label}  ·  "${op.query}"`);
    console.log(`        ${op.total} results · ${op.pSEORatio}% templated`);
    console.log();
  }
}

// ── Main Scraper ──────────────────────────────────────────────────────────────
async function main() {
  console.log("⚡ Launching automated browser (headful Chrome via Puppeteer)...");
  
  const userDataDir = join(__dirname, "..", ".chrome-user-data");
  const extensionPath = join(__dirname, "..", "apps", "extension");
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    userDataDir: userDataDir,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  });

  const page = (await browser.pages())[0] || (await browser.newPage());

  console.log(`\n⚡ Starting automatic scan of ${QUERIES.length} queries...`);
  console.log("👉 If a Google CAPTCHA screen appears, please solve it in the Chrome window.");

  for (let i = 0; i < QUERIES.length; i++) {
    const { q, label } = QUERIES[i];
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&num=20`;

    console.log(`\n[${i + 1}/${QUERIES.length}] Scanning "${q}"...`);

    let success = false;
    let pageData = null;

    while (!success) {
      try {
        await page.goto(googleUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
        
        // Evaluate the DOM detection logic directly
        pageData = await page.evaluate(() => {
          const SKIP_HOST = /(^|\.)(google\.[a-z.]+|gstatic\.com|googleusercontent\.com|youtube\.com)$/i;

          function cleanResultUrl(href) {
            if (!href) return null;
            let u;
            try {
              u = new URL(href, "https://www.google.com");
            } catch {
              return null;
            }
            if (u.pathname === "/url") {
              const real = u.searchParams.get("q") || u.searchParams.get("url");
              if (!real) return null;
              try {
                u = new URL(real);
              } catch {
                return null;
              }
            }
            if (u.protocol !== "https:" && u.protocol !== "http:") return null;
            if (SKIP_HOST.test(u.hostname)) return null;
            return u.href;
          }

          // Google serves its "unusual traffic" wall at /sorry/ with a recaptcha form.
          // The bare substring "robot" false-positives on any SERP mentioning robots.txt
          // (e.g. the "llms.txt" query); anchor on the real block signals instead.
          const htmlText = document.body.innerText;
          const isCaptcha =
            location.pathname.startsWith("/sorry") ||
            !!document.querySelector("form#captcha-form, iframe[src*='recaptcha']") ||
            htmlText.includes("trafic exceptionnel") ||
            htmlText.includes("exceptional traffic") ||
            htmlText.includes("unusual traffic");
          if (isCaptcha) {
            return { error: "captcha" };
          }

          function candidateAnchors() {
            const set = new Set(document.querySelectorAll("a:has(h3)"));
            for (const h of document.querySelectorAll("h3")) {
              const a = h.closest("a");
              if (a) set.add(a);
            }
            return Array.from(set);
          }

          function detectResults() {
            const anchors = candidateAnchors();
            const byUrl = new Map();
            for (const a of anchors) {
              const url = cleanResultUrl(a.href);
              if (!url || byUrl.has(url)) continue;

              const h3 = a.querySelector("h3");
              const serpTitle = h3 ? h3.textContent.trim() : "";

              const gContainer = a.closest(".g, .tF23ub");
              const snippetEl = gContainer ? gContainer.querySelector(".VwiC3b, .yXK7c, .MUbCcc") : null;
              let serpSnippet = snippetEl ? snippetEl.textContent.trim() : "";

              let serpDate = "";
              const dateMatch = serpSnippet.match(/^([^ (–]+)\s*[) –]\s*/);
              if (dateMatch) {
                const dateText = dateMatch[1].trim();
                if (/\b(\d+|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(dateText)) {
                  serpDate = dateText;
                  serpSnippet = serpSnippet.replace(/^[^ (–]+[) –]\s*/, "");
                }
              }

              byUrl.set(url, {
                url,
                serpTitle,
                serpSnippet,
                serpDate
              });
            }
            return Array.from(byUrl.values());
          }

          function scrapeAio() {
            const citations = [];
            const container = document.querySelector("div.Kevs9, #Odp5De");
            if (container) {
              const links = container.querySelectorAll("a[href]");
              for (const a of links) {
                const url = cleanResultUrl(a.href);
                if (url) citations.push(url);
              }
            }
            for (const a of document.querySelectorAll("a.PMDqCb")) {
              const url = cleanResultUrl(a.href);
              if (url) citations.push(url);
            }
            return Array.from(new Set(citations));
          }

          const resultsList = detectResults();

          // Clustering
          const groups = new Map();
          for (const { url } of resultsList) {
            let u;
            try { u = new URL(url); } catch { continue; }
            const host = u.hostname.replace(/^www\./, "");
            const segs = u.pathname.split("/").filter(Boolean);
            if (segs.length < 2) continue;
            const parent = "/" + segs.slice(0, -1).join("/");
            const key = `${host} ${parent}`;
            if (!groups.has(key)) groups.set(key, { host, parent, urls: [] });
            groups.get(key).urls.push(url);
          }

          const clusters = Array.from(groups.values())
            .filter((g) => g.urls.length >= 2)
            .map((g) => ({ host: g.host, pattern: `${g.parent}/:slug`, count: g.urls.length, urls: g.urls }))
            .sort((a, b) => b.count - a.count);

          const templatedUrls = new Set(clusters.flatMap((c) => c.urls));

          return {
            total: resultsList.length,
            templatedUrls: Array.from(templatedUrls),
            clusters: clusters.map((c) => ({ host: c.host, pattern: c.pattern, count: c.count })),
            aioCitations: scrapeAio(),
            results: resultsList.map((r, i) => ({
              rank: i + 1,
              url: r.url,
              title: r.serpTitle,
              snippet: r.serpSnippet,
              date: r.serpDate,
              templated: templatedUrls.has(r.url)
            }))
          };
        });

        if (pageData?.error === "captcha") {
          console.log("  ⚠️ CAPTCHA detected. Please solve it in the Chrome window now...");
          // Wait up to 5 minutes (300,000ms) for you to solve the CAPTCHA and for the page to navigate back
          await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 300000 });
        } else {
          success = true;
        }

      } catch (err) {
        console.log(`  ✗ Navigation or solve timeout: ${err.message}. Retrying query...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    const s = pageData;
    console.log(`  ✓ ${s?.total ?? 0} results · ${s?.templatedUrls?.length ?? 0} templated`);

    results.push({
      query: q,
      label,
      googleUrl,
      timestamp: new Date().toISOString(),
      landscape: {
        summary: {
          total: s.total,
          templated: s.templatedUrls.length,
          hostCount: new Set(s.clusters.map((c) => c.host)).size,
          clusters: s.clusters,
          aioCitations: s.aioCitations,
          results: s.results
        }
      },
      deepScan: null
    });

    // Persist after every query so a kill / block mid-run doesn't lose progress.
    writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), queries: results }, null, 2));

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log("\n⚡ Writing results to file...");
  writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), queries: results }, null, 2));

  console.log("⚡ Closing browser...");
  await browser.close();

  printOpportunitySummary();
  console.log("Scan complete!");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
