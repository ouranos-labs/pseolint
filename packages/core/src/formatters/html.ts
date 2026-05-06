import type {
  AuditSummary,
  CategoryGrade,
  CategoryGrades,
  CategoryKey,
  Confidence,
  Grade,
  RuleResult,
  Verdict,
} from "../types.js";
import type { ReadinessReport } from "../fetch-observer.js";
import type { SiteClassification } from "../site-classifier.js";
import {
  renderTemplateCardsHtml,
  shouldRenderTemplateCards,
  TEMPLATE_CARDS_CSS,
} from "./template-cards.js";

export interface HtmlFormatOptions {
  /** No-op for HTML — every finding is rendered regardless. Accepted for option-signature parity. */
  verbose?: boolean;
  /** v0.5.11 — when true (default), render per-template cards when ≥2 templates were detected. */
  perTemplate?: boolean;
  /** v0.5.11 — filter per-URL findings to this template signature. */
  filterTemplate?: string;
  /** v0.5.11 — skip per-template view; render flat per-URL list. */
  legacyFlat?: boolean;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  ready: "Ready",
  caution: "Caution",
  concerning: "Concerning",
  critical: "Critical",
};

const VERDICT_TONE: Record<Verdict, "success" | "warning" | "destructive" | "critical"> = {
  ready: "success",
  caution: "warning",
  concerning: "destructive",
  critical: "critical",
};

const GRADE_TONE: Record<Grade, "success" | "warning" | "destructive" | "critical"> = {
  A: "success",
  B: "success",
  C: "warning",
  D: "destructive",
  F: "critical",
};

const CATEGORY_LABEL: Record<Exclude<CategoryKey, "audit">, string> = {
  integrity: "Integrity",
  discoverability: "Discoverability",
  citation: "Citation",
  data: "Data",
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortenUrl(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function severityTone(s: string): "destructive" | "warning" | "muted" {
  if (s === "critical" || s === "error") return "destructive";
  if (s === "warning") return "warning";
  return "muted";
}

function effortLabel(effort: string): string {
  switch (effort) {
    case "quick":
      return "quick fix";
    case "moderate":
      return "moderate";
    case "structural":
      return "structural";
    default:
      return effort;
  }
}

function renderCategoryTile(label: string, cell: CategoryGrade): string {
  const tone = GRADE_TONE[cell.grade];
  const issuesLabel =
    cell.issues === 0 ? "no issues" : `${cell.issues} ${cell.issues === 1 ? "issue" : "issues"}`;
  return `<div class="cat-tile cat-${tone}">
    <div class="cat-grade">${escapeHtml(cell.grade)}</div>
    <div class="cat-label">${escapeHtml(label)}</div>
    <div class="cat-issues mono">${escapeHtml(issuesLabel)}</div>
  </div>`;
}

function renderCategoryTiles(categories: CategoryGrades): string {
  const order: Array<Exclude<CategoryKey, "audit">> = [
    "integrity",
    "discoverability",
    "citation",
    "data",
  ];
  return order
    .map((key) => {
      const cell = categories[key];
      if (!cell) return "";
      return renderCategoryTile(CATEGORY_LABEL[key], cell);
    })
    .join("");
}

function confidenceCaveat(c: Confidence | undefined): string | null {
  if (c === "low") return "low confidence — known false-positive risk on this site type";
  if (c === "speculative") return "speculative — heuristic match; verify before acting";
  return null;
}

function renderFindingRow(f: RuleResult): string {
  const tone = severityTone(f.severity);
  const effortPill = f.effort
    ? ` <span class="effort-pill effort-${escapeHtml(f.effort)}">${escapeHtml(effortLabel(f.effort))}</span>`
    : "";
  const url = f.pageUrl ? `<span class="finding-url mono">${escapeHtml(shortenUrl(f.pageUrl))}</span>` : "";
  const fix = f.fix ? `<div class="fix"><span class="fix-label">Fix</span>${escapeHtml(f.fix)}</div>` : "";
  const docsHref =
    f.docsUrl ?? `https://pseolint.dev/rules/${f.ruleId.split("/").pop() ?? f.ruleId}`;
  const caveat = confidenceCaveat(f.confidence);
  const caveatPill = caveat
    ? `<div class="caveat">${escapeHtml(caveat)}</div>`
    : "";

  // Cluster context (collapsed details) — only on findings that carry one.
  let cluster = "";
  if (f.context?.type === "cluster") {
    const ctx = f.context;
    const [minSim, maxSim] = ctx.similarityRange;
    const worstPairs = ctx.worstPairs
      .map(
        (p) =>
          `<li><span class="mono">${escapeHtml(shortenUrl(p.left))}</span> ↔ <span class="mono">${escapeHtml(shortenUrl(p.right))}</span> <span class="sim mono">${(p.similarity * 100).toFixed(1)}%</span></li>`,
      )
      .join("");
    const members = ctx.members
      .map((m) => `<li class="mono">${escapeHtml(shortenUrl(m))}</li>`)
      .join("");
    cluster = `<details class="cluster">
      <summary>${ctx.clusterSize} pages in cluster · ${(minSim * 100).toFixed(0)}–${(maxSim * 100).toFixed(0)}% similar</summary>
      <p class="cluster-label">Worst pairs</p>
      <ul class="pair-list">${worstPairs}</ul>
      <p class="cluster-label">All members</p>
      <ul class="member-list">${members}</ul>
    </details>`;
  }

  return `<li class="finding finding-${tone}">
    <div class="finding-head">
      <code class="rule-id">${escapeHtml(f.ruleId)}</code>${effortPill}
      ${url}
    </div>
    <p class="finding-msg">${escapeHtml(f.message)}</p>
    ${caveatPill}
    ${fix}
    ${cluster}
    <a class="docs-link" href="${escapeHtml(docsHref)}" target="_blank" rel="noopener">${escapeHtml(docsHref.replace(/^https?:\/\//, ""))} ↗</a>
  </li>`;
}

/** v0.4.3 — "Audited as <type>" line shown under the verdict badge. */
function auditedAsHtml(c: SiteClassification | undefined): string {
  if (!c) return "";
  const confPct = Math.round(c.confidence * 100);
  const suppressed = c.suppressedRules.length;
  const suppressedPart =
    suppressed > 0
      ? ` ${suppressed} pSEO-only rule${suppressed === 1 ? "" : "s"} suppressed.`
      : "";
  return `<div class="audited-as">Audited as <strong>${escapeHtml(c.type)}</strong> (${confPct}% confidence).${escapeHtml(suppressedPart)}</div>`;
}

function renderBucketSection(label: string, items: RuleResult[], tone: string): string {
  if (items.length === 0) {
    return `<section class="bucket bucket-empty">
      <h2 class="bucket-heading bucket-${tone}"><span class="bucket-dot"></span>${escapeHtml(label)} <span class="bucket-count">none</span></h2>
    </section>`;
  }
  const rows = items.map(renderFindingRow).join("");
  return `<section class="bucket">
    <h2 class="bucket-heading bucket-${tone}"><span class="bucket-dot"></span>${escapeHtml(label)} <span class="bucket-count">${items.length}</span></h2>
    <ul class="finding-list">${rows}</ul>
  </section>`;
}

function renderOriginReadinessCard(report: ReadinessReport | null | undefined): string {
  if (!report) return "";
  const verdictTone =
    report.verdict === "ready"
      ? "success"
      : report.verdict === "concerning"
        ? "warning"
        : "destructive";
  const fw = report.detectedFramework ? ` · framework: ${escapeHtml(report.detectedFramework)}` : "";
  return `<section class="card readiness">
    <header class="section-head">
      <span class="eyebrow">Origin readiness</span>
      <span class="meta-mono">${report.liveFetchCount} live fetch${report.liveFetchCount === 1 ? "" : "es"}${fw}</span>
    </header>
    <div class="readiness-grid">
      <div><span class="stat-label">Verdict</span><span class="stat-val tone-${verdictTone}">${escapeHtml(report.verdict)}</span></div>
      <div><span class="stat-label">Median</span><span class="stat-val mono">${report.medianMs} ms</span></div>
      <div><span class="stat-label">p95</span><span class="stat-val mono">${report.p95Ms} ms</span></div>
      <div><span class="stat-label">5xx ratio</span><span class="stat-val mono">${(report.serverErrorRatio * 100).toFixed(1)}%</span></div>
      <div><span class="stat-label">Cache assist</span><span class="stat-val mono">${(report.cacheAssistRatio * 100).toFixed(0)}%</span></div>
    </div>
  </section>`;
}

function renderTriageHtml(triage: NonNullable<AuditSummary["triage"]>): string {
  const sorted = triage.rootCauses.slice().sort((a, b) => a.fixOrder - b.fixOrder);
  const cost =
    triage.estimatedCostUsd !== undefined ? ` · est $${triage.estimatedCostUsd.toFixed(2)}` : "";
  const cacheLabel = triage.cacheHit ? "cached" : "fresh";
  const tokens = `${triage.tokenUsage.input.toLocaleString()} in / ${triage.tokenUsage.output.toLocaleString()} out`;
  const causes = sorted
    .map(
      (c) => `
    <li class="cause">
      <div class="cause-head">
        <span class="cause-order">${c.fixOrder}</span>
        <h3>${escapeHtml(c.label)}</h3>
        <span class="sev sev-${severityTone(c.severity)}">${escapeHtml(c.severity)}</span>
      </div>
      <p class="cause-meta">${c.findingsCount} findings · ${c.affectedRuleIds.map(escapeHtml).join(", ")}</p>
      <p class="cause-body">${escapeHtml(c.rationale)}</p>
    </li>`,
    )
    .join("");

  return `
<section class="ai-triage">
  <header class="section-head">
    <span class="eyebrow">AI Triage</span>
    <span class="meta-mono">${escapeHtml(triage.modelUsed)} · ${cacheLabel} · ${tokens}${cost}</span>
  </header>
  ${triage.narrative ? `<p class="narrative">${escapeHtml(triage.narrative)}</p>` : ""}
  <ol class="causes">${causes}</ol>
</section>`;
}

export function formatHtml(summary: AuditSummary, options?: HtmlFormatOptions): string {
  const verdict = summary.verdict;
  const verdictTone = VERDICT_TONE[verdict];
  const perTemplate = options?.perTemplate !== false; // default ON
  const legacyFlat = options?.legacyFlat ?? false;
  const filterTemplate = options?.filterTemplate;
  const crawl = summary.diagnostics?.crawlStats;
  const readiness = summary.diagnostics?.originReadiness;

  // Resolve findings, filtered when --template is active.
  const templates = summary.templates;
  let filteredBlockers = summary.issues.blockers;
  let filteredShouldFix = summary.issues.shouldFix;
  let filteredInfo = summary.issues.informational;
  if (filterTemplate && Array.isArray(templates)) {
    const matchedTemplate = templates.find((t) => t.signature === filterTemplate);
    if (matchedTemplate) {
      const urlSet = new Set(matchedTemplate.auditedUrls);
      const keep = (f: RuleResult): boolean => !f.pageUrl || urlSet.has(f.pageUrl);
      filteredBlockers = summary.issues.blockers.filter(keep);
      filteredShouldFix = summary.issues.shouldFix.filter(keep);
      filteredInfo = summary.issues.informational.filter(keep);
    }
  }

  const cardOpts = { legacyFlat: legacyFlat || !perTemplate, filterTemplate };
  const templateCardsHtml = shouldRenderTemplateCards(templates, cardOpts)
    ? renderTemplateCardsHtml(templates, cardOpts)
    : "";

  const crawlMeta = crawl
    ? `${crawl.fetched} fetched · ${crawl.discovered} discovered · ${crawl.skipped} skipped`
    : `${summary.pageCount} pages`;

  const issues = { blockers: filteredBlockers, shouldFix: filteredShouldFix, informational: filteredInfo };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>pseolint · audit report</title>
<style>
  :root{
    --bg:#16181c; --fg:#eef2f6; --muted:#9aa4ae; --muted-2:#6a7380;
    --card:#1a1d22; --card-2:#1f2329; --border:#262a30; --border-strong:#3a3f47;
    --success:#39d19f; --warning:#fbb838; --destructive:#e94b4b; --critical:#c0185a; --primary:#39d19f;
    --r:18px; --r-lg:28px;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html{color-scheme:dark}
  body{
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    background:var(--bg); color:var(--fg);
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
    line-height:1.5;
  }
  main{max-width:960px;margin:0 auto;padding:56px 24px 80px}
  .mono{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}
  .tabular{font-variant-numeric:tabular-nums}
  .display{font-family:"Instrument Serif","Times New Roman",Georgia,serif;font-style:italic;font-weight:400;letter-spacing:-0.01em}
  .muted{color:var(--muted)}
  .meta-mono{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;color:var(--muted);font-size:12px}
  .eyebrow{font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);font-weight:600}

  .status-row{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:11px;letter-spacing:0.14em;text-transform:uppercase}
  .status-dot{display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--success)}
  .status-dot.tone-warning{background:var(--warning)} .status-dot.tone-destructive{background:var(--destructive)} .status-dot.tone-critical{background:var(--critical)}

  h1.title{margin-top:12px;font-size:clamp(32px,5vw,56px);line-height:1;letter-spacing:-0.01em}
  .title-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 12px;margin-top:12px}
  .src-link{color:var(--muted);font-size:12px;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}
  .lead{margin-top:12px;color:var(--muted);font-size:14px;max-width:640px}

  .card{margin-top:28px;padding:28px;background:color-mix(in oklab,var(--card) 85%,transparent);
        border:1px solid var(--border);border-radius:var(--r-lg)}

  /* Verdict badge */
  .verdict-badge{display:inline-flex;align-items:center;gap:10px;padding:10px 18px;border-radius:999px;
                 border:1px solid var(--border-strong);background:var(--card-2);
                 font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:14px;font-weight:600;
                 text-transform:uppercase;letter-spacing:0.08em}
  .verdict-badge.tone-success{color:var(--success);border-color:color-mix(in oklab,var(--success) 45%,var(--border))}
  .verdict-badge.tone-warning{color:var(--warning);border-color:color-mix(in oklab,var(--warning) 45%,var(--border))}
  .verdict-badge.tone-destructive{color:var(--destructive);border-color:color-mix(in oklab,var(--destructive) 45%,var(--border))}
  .verdict-badge.tone-critical{color:var(--critical);border-color:color-mix(in oklab,var(--critical) 45%,var(--border));background:color-mix(in oklab,var(--critical) 8%,var(--card-2))}
  .verdict-dot{width:8px;height:8px;border-radius:999px;background:currentColor}
  .verdict-headline{display:block;margin-top:14px;font-size:18px;color:var(--fg)}

  /* Category tiles */
  .cat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:24px}
  @media (max-width:640px){.cat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .cat-tile{padding:18px 16px;border-radius:var(--r);background:var(--card);border:1px solid var(--border);
            display:flex;flex-direction:column;align-items:flex-start;gap:6px}
  .cat-grade{font-family:"Instrument Serif","Times New Roman",Georgia,serif;font-style:italic;font-size:48px;line-height:1;font-variant-numeric:tabular-nums}
  .cat-tile.cat-success .cat-grade{color:var(--success)}
  .cat-tile.cat-warning .cat-grade{color:var(--warning)}
  .cat-tile.cat-destructive .cat-grade{color:var(--destructive)}
  .cat-tile.cat-critical .cat-grade{color:var(--critical)}
  .cat-tile.cat-success{border-color:color-mix(in oklab,var(--success) 30%,var(--border))}
  .cat-tile.cat-warning{border-color:color-mix(in oklab,var(--warning) 30%,var(--border))}
  .cat-tile.cat-destructive{border-color:color-mix(in oklab,var(--destructive) 30%,var(--border))}
  .cat-tile.cat-critical{border-color:color-mix(in oklab,var(--critical) 30%,var(--border))}
  .cat-label{font-size:13px;font-weight:600;color:var(--fg)}
  .cat-issues{font-size:11px;color:var(--muted)}

  .template-banner{margin-top:20px;padding:14px 18px;border:1px solid color-mix(in oklab,var(--warning) 40%,transparent);
                   border-radius:var(--r);background:color-mix(in oklab,var(--warning) 8%,transparent);font-size:13px}
  .template-banner strong{color:var(--warning)}

  /* Origin readiness card */
  .readiness-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:8px}
  @media (max-width:720px){.readiness-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .readiness-grid>div{display:flex;flex-direction:column;gap:2px}
  .stat-label{font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted)}
  .stat-val{font-size:18px;font-variant-numeric:tabular-nums}
  .tone-success{color:var(--success)} .tone-warning{color:var(--warning)} .tone-destructive{color:var(--destructive)} .tone-critical{color:var(--critical)}

  .section-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:18px}

  /* Buckets */
  .bucket{margin-top:36px}
  .bucket-empty{opacity:0.55}
  .bucket-heading{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;margin-bottom:14px;
                  text-transform:uppercase;letter-spacing:0.08em}
  .bucket-dot{display:inline-block;width:8px;height:8px;border-radius:999px;background:currentColor}
  .bucket-count{margin-left:auto;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
                font-size:12px;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0}
  .bucket-destructive{color:var(--destructive)}
  .bucket-warning{color:var(--warning)}
  .bucket-muted{color:var(--muted-2)}

  .finding-list{list-style:none;display:flex;flex-direction:column;gap:10px}
  .finding{position:relative;padding:14px 16px 14px 18px;background:var(--card);
           border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
  .finding::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--border-strong)}
  .finding-destructive::before{background:var(--destructive)}
  .finding-warning::before{background:var(--warning)}
  .finding-muted::before{background:var(--muted-2)}
  .finding-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px}
  .rule-id{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:12px;
           color:var(--fg);background:var(--card-2);padding:2px 8px;border-radius:6px;border:1px solid var(--border)}
  .finding-url{color:var(--muted);font-size:12px;margin-left:auto}
  .finding-msg{color:var(--fg);font-size:14px}

  .effort-pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;
               font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:lowercase;border:1px solid transparent}
  .effort-quick{background:color-mix(in oklab,var(--success) 14%,transparent);color:var(--success);border-color:color-mix(in oklab,var(--success) 35%,transparent)}
  .effort-moderate{background:color-mix(in oklab,var(--warning) 14%,transparent);color:var(--warning);border-color:color-mix(in oklab,var(--warning) 35%,transparent)}
  .effort-structural{background:color-mix(in oklab,var(--destructive) 14%,transparent);color:var(--destructive);border-color:color-mix(in oklab,var(--destructive) 35%,transparent)}

  .sev{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;text-transform:lowercase;letter-spacing:0.04em;border:1px solid transparent}
  .sev.sev-destructive{background:color-mix(in oklab,var(--destructive) 14%,transparent);color:var(--destructive);border-color:color-mix(in oklab,var(--destructive) 35%,transparent)}
  .sev.sev-warning{background:color-mix(in oklab,var(--warning) 14%,transparent);color:var(--warning);border-color:color-mix(in oklab,var(--warning) 35%,transparent)}
  .sev.sev-muted{background:var(--card-2);color:var(--muted);border-color:var(--border-strong)}

  .caveat{margin-top:6px;padding:6px 10px;border-radius:8px;background:color-mix(in oklab,var(--warning) 8%,transparent);color:var(--warning);font-size:12px;line-height:1.4;border:1px solid color-mix(in oklab,var(--warning) 22%,transparent)}
  .audited-as{display:block;margin-top:10px;font-size:13px;color:var(--muted);font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}
  .audited-as strong{color:var(--fg)}
  .fix{margin-top:8px;padding:10px 12px;background:var(--card-2);border-radius:10px;color:var(--muted);font-size:13px;line-height:1.55}
  .fix-label{display:inline-block;margin-right:8px;padding:1px 6px;border-radius:4px;
             background:color-mix(in oklab,var(--primary) 18%,transparent);color:var(--primary);
             font-size:10px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;vertical-align:1px}
  .docs-link{display:inline-block;margin-top:8px;color:var(--primary);font-size:12px;text-decoration:none;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}
  .docs-link:hover{text-decoration:underline}

  details.cluster{margin-top:10px;border:1px solid var(--border);border-radius:12px;background:var(--card-2);padding:0 14px 14px}
  details.cluster>summary{cursor:pointer;padding:10px 0;color:var(--muted);font-size:12px;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;list-style:none}
  details.cluster>summary::-webkit-details-marker{display:none}
  details.cluster>summary::before{content:"▸ ";color:var(--muted-2)}
  details.cluster[open]>summary::before{content:"▾ "}
  .cluster-label{margin:12px 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);font-weight:600}
  .pair-list,.member-list{list-style:none;display:flex;flex-direction:column;gap:4px;font-size:12px}
  .member-list{max-height:220px;overflow-y:auto;padding-right:4px}
  .sim{color:var(--warning)}

  .ai-triage{margin-top:28px;padding:28px;background:color-mix(in oklab,var(--card) 85%,transparent);
             border:1px solid var(--border);border-radius:var(--r-lg)}
  .ai-triage .narrative{color:var(--fg);font-size:15px;line-height:1.6;margin-bottom:18px}
  .causes{list-style:none;display:flex;flex-direction:column;gap:12px}
  .cause{padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:14px}
  .cause-head{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .cause-order{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:999px;
               background:color-mix(in oklab,var(--primary) 20%,transparent);color:var(--primary);
               font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:11px;font-weight:700}
  .cause h3{font-size:15px;font-weight:600}
  .cause-meta{color:var(--muted);font-size:12px;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;margin-bottom:6px}
  .cause-body{color:var(--fg);font-size:14px;line-height:1.55}

  .footer-note{margin-top:56px;padding:20px 22px;border:1px solid var(--border);border-radius:var(--r-lg);
               background:color-mix(in oklab,var(--card) 60%,transparent);color:var(--muted);font-size:12px;line-height:1.6}
  .footer-note strong{color:var(--fg);font-weight:600}
${TEMPLATE_CARDS_CSS}
</style>
</head>
<body>
<main>
  <div class="status-row">
    <span class="status-dot tone-${verdictTone}"></span>
    pseolint · audit complete
  </div>

  <div class="title-row">
    <h1 class="title display">Audit report</h1>
    <span class="src-link">${escapeHtml(crawlMeta)}</span>
  </div>
  <p class="lead">Schema ${escapeHtml(summary.schemaVersion)}. Verdict, category grades, and bucketed issues — see docs links per finding for what each rule checks.</p>

  <section class="card">
    <span class="verdict-badge tone-${verdictTone}"><span class="verdict-dot"></span>${escapeHtml(VERDICT_LABEL[verdict])}</span>
    ${auditedAsHtml(summary.siteClassification)}
    <span class="verdict-headline">${escapeHtml(summary.headline)}</span>
    <div class="cat-grid">${renderCategoryTiles(summary.categories)}</div>
  </section>

  ${summary.templateDetected ? `<div class="template-banner"><strong>Template-generated content detected.</strong> Fix suggestions are tailored for template authors — one change can fix hundreds of pages.</div>` : ""}

  ${renderOriginReadinessCard(readiness)}

  ${templateCardsHtml}

  ${renderBucketSection("Blockers", issues.blockers, "destructive")}
  ${renderBucketSection("Should fix", issues.shouldFix, "warning")}
  ${renderBucketSection("Informational", issues.informational, "muted")}

  ${summary.triage ? renderTriageHtml(summary.triage) : ""}

  <section class="footer-note">
    <strong>About this report.</strong> Verdict and grades are structured heuristics, not a verdict from Google. Severities escalate: info → warning → error → critical. Effort tags
    (<span class="effort-pill effort-quick">quick fix</span> <span class="effort-pill effort-moderate">moderate</span> <span class="effort-pill effort-structural">structural</span>)
    estimate the change cost per finding. Findings are bucketed: <em>blockers</em> must be fixed before shipping, <em>should fix</em> before scaling, <em>informational</em> for trend-watching.
  </section>
</main>
</body>
</html>`;
}
