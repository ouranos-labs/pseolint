import type { AuditSummary, RuleResult, Severity } from "../types.js";

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 100,
  error: 50,
  warning: 10,
  info: 1,
};

function severityTone(severity: Severity): "destructive" | "warning" | "muted" {
  switch (severity) {
    case "critical":
    case "error":
      return "destructive";
    case "warning":
      return "warning";
    case "info":
      return "muted";
  }
}

function scoreTone(score: number): "success" | "warning" | "destructive" {
  if (score <= 40) return "success";
  if (score <= 69) return "warning";
  return "destructive";
}

function scoreVerdict(score: number): string {
  if (score <= 20) return "Clean run";
  if (score <= 40) return "Low risk";
  if (score <= 69) return "Watch list";
  if (score <= 84) return "Elevated risk";
  return "Doorway garden";
}

function categoryTone(pct: number): "success" | "warning" | "destructive" {
  if (pct <= 40) return "success";
  if (pct <= 69) return "warning";
  return "destructive";
}

function effortLabel(effort: string): string {
  switch (effort) {
    case "quick": return "quick fix";
    case "moderate": return "moderate";
    case "structural": return "structural";
    default: return effort;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortenUrl(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

function categoryLabel(name: string): string {
  const map: Record<string, string> = {
    spam: "Spam signals",
    content: "Content quality",
    links: "Link graph",
    tech: "Technical SEO",
    schema: "Structured data",
    cannibal: "Cannibalisation",
    aeo: "AEO readiness",
  };
  return map[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * AEO-specific score band label. Low score = AI-Ready (site is citable by
 * LLMs in AI Overviews / answer engines); high score = Ghost (not discoverable).
 */
function aeoScoreLabel(score: number): string {
  if (score <= 20) return "AI-Ready";
  if (score <= 40) return "Partial";
  if (score <= 60) return "Vulnerable";
  if (score <= 80) return "Invisible";
  return "Ghost";
}

/** Group findings by ruleId. Preserves encounter order per bucket. */
function groupByRule(findings: RuleResult[]): Map<string, RuleResult[]> {
  const m = new Map<string, RuleResult[]>();
  for (const f of findings) {
    const bucket = m.get(f.ruleId);
    if (bucket) bucket.push(f);
    else m.set(f.ruleId, [f]);
  }
  return m;
}

/**
 * Impact ranking: severity weight × distinct-page count. Ties broken by severity,
 * then by pageCount, then alphabetical ruleId for determinism.
 */
type Impact = {
  ruleId: string;
  severity: Severity;
  pageCount: number;
  representative: RuleResult;
  impact: number;
};

function rankByImpact(findings: RuleResult[]): Impact[] {
  const byRule = groupByRule(findings);
  const impacts: Impact[] = [];
  for (const [ruleId, items] of byRule) {
    const sev = items[0].severity;
    impacts.push({
      ruleId,
      severity: sev,
      pageCount: items.length,
      representative: items[0],
      impact: SEVERITY_WEIGHT[sev] * items.length,
    });
  }
  impacts.sort((a, b) => {
    if (b.impact !== a.impact) return b.impact - a.impact;
    const sa = SEVERITY_ORDER.indexOf(a.severity);
    const sb = SEVERITY_ORDER.indexOf(b.severity);
    if (sa !== sb) return sa - sb;
    if (b.pageCount !== a.pageCount) return b.pageCount - a.pageCount;
    return a.ruleId.localeCompare(b.ruleId);
  });
  return impacts;
}

function renderTriageHtml(triage: NonNullable<AuditSummary["triage"]>): string {
  const sorted = triage.rootCauses.slice().sort((a, b) => a.fixOrder - b.fixOrder);
  const cost = triage.estimatedCostUsd !== undefined ? ` · est $${triage.estimatedCostUsd.toFixed(2)}` : "";
  const cacheLabel = triage.cacheHit ? "cached" : "fresh";
  const tokens = `${triage.tokenUsage.input.toLocaleString()} in / ${triage.tokenUsage.output.toLocaleString()} out`;
  const causes = sorted.map((c) => `
    <li class="cause">
      <div class="cause-head">
        <span class="cause-order">${c.fixOrder}</span>
        <h3>${escapeHtml(c.label)}</h3>
        <span class="sev sev-${severityTone(c.severity)}">${escapeHtml(c.severity)}</span>
      </div>
      <p class="cause-meta">${c.findingsCount} findings · ${c.affectedRuleIds.map(escapeHtml).join(", ")}</p>
      <p class="cause-body">${escapeHtml(c.rationale)}</p>
    </li>`).join("");

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

function renderTopFixes(impacts: Impact[]): string {
  if (impacts.length === 0) return "";
  const top = impacts.slice(0, 5);
  const rows = top.map((imp, idx) => {
    const r = imp.representative;
    const effortPill = r.effort
      ? `<span class="effort-pill effort-${escapeHtml(r.effort)}">${escapeHtml(effortLabel(r.effort))}</span>`
      : "";
    const pagesLabel = imp.pageCount === 1 ? "1 page" : `${imp.pageCount} pages`;
    return `<li class="top-fix">
      <span class="top-fix-rank">${idx + 1}</span>
      <div class="top-fix-body">
        <div class="top-fix-head">
          <code class="rule-id">${escapeHtml(imp.ruleId)}</code>
          <span class="sev sev-${severityTone(imp.severity)}">${escapeHtml(imp.severity)}</span>
          ${effortPill}
          <span class="top-fix-pages mono">${pagesLabel}</span>
        </div>
        <p class="top-fix-msg">${escapeHtml(r.message)}</p>
      </div>
    </li>`;
  }).join("");

  return `
<section class="top-fixes">
  <header class="section-head">
    <span class="eyebrow">Top fixes by impact</span>
    <span class="meta-mono">severity × pages affected</span>
  </header>
  <ol class="top-fix-list">${rows}</ol>
</section>`;
}

function renderRuleCard(ruleId: string, items: RuleResult[], sev: Severity): string {
  const representative = items[0];
  const effortPill = representative.effort
    ? ` <span class="effort-pill effort-${escapeHtml(representative.effort)}">${escapeHtml(effortLabel(representative.effort))}</span>`
    : "";
  const pagesLabel = items.length === 1 ? "1 page" : `${items.length} pages`;

  // Sample + full URL list — only include findings that have a pageUrl.
  const urls = items.map((i) => i.pageUrl).filter((u): u is string => !!u);
  let pageList = "";
  if (urls.length > 0) {
    const preview = urls.slice(0, 3);
    const rest = urls.slice(3);
    const previewHtml = `<ul class="page-preview">${preview.map((u) => `<li class="mono">${escapeHtml(shortenUrl(u))}</li>`).join("")}</ul>`;
    const restHtml = rest.length > 0
      ? `<details class="page-extra">
           <summary>${rest.length} more ${rest.length === 1 ? "page" : "pages"}</summary>
           <ul class="page-list">${rest.map((u) => `<li class="mono">${escapeHtml(shortenUrl(u))}</li>`).join("")}</ul>
         </details>`
      : "";
    pageList = previewHtml + restHtml;
  }

  // Cluster context (if any finding has it, show the first one — site-wide rules only fire once).
  let cluster = "";
  const withCluster = items.find((i) => i.context?.type === "cluster");
  if (withCluster && withCluster.context?.type === "cluster") {
    const ctx = withCluster.context;
    const [minSim, maxSim] = ctx.similarityRange;
    const worstPairsHtml = ctx.worstPairs
      .map(p => `<li><span class="mono">${escapeHtml(shortenUrl(p.left))}</span> <span class="arrow">↔</span> <span class="mono">${escapeHtml(shortenUrl(p.right))}</span> <span class="sim">${(p.similarity * 100).toFixed(1)}%</span></li>`)
      .join("");
    const membersHtml = ctx.members
      .map(m => `<li class="mono">${escapeHtml(shortenUrl(m))}</li>`)
      .join("");
    cluster = `
<details>
  <summary>${ctx.clusterSize} pages in cluster · ${(minSim * 100).toFixed(0)}–${(maxSim * 100).toFixed(0)}% similar</summary>
  <div class="cluster-body">
    <p class="cluster-label">Worst pairs</p>
    <ul class="pair-list">${worstPairsHtml}</ul>
    <p class="cluster-label">All members</p>
    <ul class="member-list">${membersHtml}</ul>
  </div>
</details>`;
  }

  const fix = representative.fix ? `<div class="fix"><span class="fix-label">Fix</span>${escapeHtml(representative.fix)}</div>` : "";
  const ref = representative.ref ? `<a href="${escapeHtml(representative.ref)}" class="ref" target="_blank" rel="noopener">ref ↗</a>` : "";

  return `<li class="finding finding-${severityTone(sev)}">
    <div class="finding-head">
      <code class="rule-id">${escapeHtml(ruleId)}</code>${effortPill}
      <span class="finding-pages mono">${pagesLabel}</span>
    </div>
    <p class="finding-msg">${escapeHtml(representative.message)}</p>
    ${pageList}
    ${cluster}
    ${fix}
    ${ref}
  </li>`;
}

export function formatHtml(summary: AuditSummary): string {
  const grouped = new Map<Severity, RuleResult[]>();
  for (const sev of SEVERITY_ORDER) grouped.set(sev, []);
  for (const f of summary.findings) grouped.get(f.severity)!.push(f);

  const counts: Record<Severity, number> = {
    critical: grouped.get("critical")!.length,
    error: grouped.get("error")!.length,
    warning: grouped.get("warning")!.length,
    info: grouped.get("info")!.length,
  };
  const totalErrors = counts.critical + counts.error;

  const impacts = rankByImpact(summary.findings);
  const topFixesHtml = renderTopFixes(impacts);

  const categoryRows = Object.entries(summary.categoryScores)
    .map(([name, value]) => {
      const pct = value as number;
      const tone = categoryTone(pct);
      return `<tr>
        <td class="cat-name">${escapeHtml(categoryLabel(name))}</td>
        <td class="cat-bar"><div class="bar-bg"><div class="bar-fill bar-${tone}" style="width:${pct}%"></div></div></td>
        <td class="cat-val mono tabular">${pct}</td>
      </tr>`;
    })
    .join("");

  const findingsSections = SEVERITY_ORDER.map((sev) => {
    const items = grouped.get(sev)!;
    if (items.length === 0) return "";
    const byRule = groupByRule(items);
    // Preserve rule-level ordering by rank (severity × pageCount) within the severity group.
    const orderedRuleIds = Array.from(byRule.entries())
      .sort((a, b) => {
        if (b[1].length !== a[1].length) return b[1].length - a[1].length;
        return a[0].localeCompare(b[0]);
      })
      .map(([ruleId]) => ruleId);
    const itemsHtml = orderedRuleIds.map((rid) => renderRuleCard(rid, byRule.get(rid)!, sev)).join("");
    const ruleCount = byRule.size;
    return `
    <div class="sev-group">
      <h3 class="sev-heading sev-${severityTone(sev)}">
        <span class="sev-dot"></span>${SEVERITY_LABEL[sev]}
        <span class="sev-count">${ruleCount} ${ruleCount === 1 ? "rule" : "rules"} · ${items.length} ${items.length === 1 ? "finding" : "findings"}</span>
      </h3>
      <ul class="finding-list">${itemsHtml}</ul>
    </div>`;
  }).join("");

  const tone = scoreTone(summary.score);
  const verdict = scoreVerdict(summary.score);

  const groupScoresHtml = summary.groupScores && summary.groupPageCounts ? `
<section class="card">
  <header class="section-head">
    <span class="eyebrow">Group scores</span>
  </header>
  <table class="data-table">
    <thead><tr><th>Group</th><th>Score</th><th>Pages</th></tr></thead>
    <tbody>${Object.entries(summary.groupScores).map(([name, value]) => {
      const count = summary.groupPageCounts![name] ?? 0;
      const gTone = categoryTone(value as number);
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td class="mono tabular tone-${gTone}">${value}</td>
        <td class="mono tabular muted">${count}</td>
      </tr>`;
    }).join("")}</tbody>
  </table>
</section>` : "";

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
    --success:#39d19f; --warning:#fbb838; --destructive:#e94b4b; --primary:#39d19f;
    --r:18px; --r-lg:28px;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html{color-scheme:dark}
  body{
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    background:var(--bg); color:var(--fg);
    font-feature-settings:"rlig" 1,"calt" 1;
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
  .status-dot.tone-warning{background:var(--warning)} .status-dot.tone-destructive{background:var(--destructive)}

  h1.title{margin-top:12px;font-size:clamp(32px,5vw,56px);line-height:1;letter-spacing:-0.01em}
  .title-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 12px;margin-top:12px}
  .src-link{color:var(--muted);font-size:12px;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;text-decoration:none}
  .src-link:hover{color:var(--fg)}
  .lead{margin-top:12px;color:var(--muted);font-size:14px;max-width:640px}

  .card{margin-top:28px;padding:28px;background:color-mix(in oklab,var(--card) 85%,transparent);
        border:1px solid var(--border);border-radius:var(--r-lg)}
  .hero{display:grid;grid-template-columns:auto 1fr;gap:36px;align-items:center}
  @media (max-width:640px){.hero{grid-template-columns:1fr;gap:24px}}
  .score-block{display:flex;flex-direction:column;align-items:flex-start;min-width:180px}
  .score{font-family:"Instrument Serif","Times New Roman",Georgia,serif;font-weight:400;
         font-size:128px;line-height:0.9;font-variant-numeric:tabular-nums;letter-spacing:-0.02em}
  .tone-success{color:var(--success)} .tone-warning{color:var(--warning)} .tone-destructive{color:var(--destructive)}
  .score-label{margin-top:6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted)}
  .verdict{margin-top:14px;display:inline-flex;align-items:center;gap:8px;
           padding:5px 10px;border:1px solid var(--border-strong);border-radius:999px;
           background:var(--card-2);font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
           font-size:11px;color:var(--muted)}
  .verdict-dot{width:5px;height:5px;border-radius:999px;background:var(--success)}

  .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px 28px;margin-top:8px}
  @media (max-width:640px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
  .stat-label{font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted)}
  .stat-val{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
            font-size:20px;font-variant-numeric:tabular-nums;margin-top:2px}

  .template-banner{margin-top:20px;padding:14px 18px;border:1px solid color-mix(in oklab,var(--warning) 40%,transparent);
                   border-radius:var(--r);background:color-mix(in oklab,var(--warning) 8%,transparent);color:var(--fg);font-size:13px}
  .template-banner strong{color:var(--warning)}

  .section-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:18px}
  .data-table{width:100%;border-collapse:collapse}
  .data-table th,.data-table td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--border);font-size:14px}
  .data-table th{font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);font-weight:600}
  .data-table tr:last-child td{border-bottom:0}
  .cat-name{width:40%}
  .cat-bar{width:auto}
  .cat-val{width:56px;text-align:right}
  .bar-bg{background:var(--border);border-radius:999px;height:8px;width:100%;overflow:hidden}
  .bar-fill{height:100%;border-radius:999px;transition:width .4s ease}
  .bar-success{background:var(--success)} .bar-warning{background:var(--warning)} .bar-destructive{background:var(--destructive)}

  .aeo-callout{margin-top:20px;padding:16px 20px;background:color-mix(in oklab,var(--card) 85%,transparent);
               border:1px solid var(--border);border-radius:var(--r-lg)}
  .aeo-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:10px}
  .aeo-body{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center}
  @media (max-width:640px){.aeo-body{grid-template-columns:1fr;gap:8px}}
  .aeo-label{font-family:"Instrument Serif","Times New Roman",Georgia,serif;font-style:italic;font-size:28px;line-height:1;letter-spacing:-0.01em}
  .aeo-bar{display:block;height:8px;background:var(--border);border-radius:999px;overflow:hidden}
  .aeo-bar .bar-fill{height:100%;display:block;border-radius:999px}
  .aeo-meta{font-size:11px;color:var(--muted)}

  .top-fixes{margin-top:28px;padding:24px 28px 28px;background:color-mix(in oklab,var(--primary) 6%,var(--card) 94%);
             border:1px solid color-mix(in oklab,var(--primary) 25%,var(--border));border-radius:var(--r-lg)}
  .top-fix-list{list-style:none;display:flex;flex-direction:column;gap:10px}
  .top-fix{display:grid;grid-template-columns:32px 1fr;gap:12px;align-items:start;padding:12px 14px;
           background:var(--card);border:1px solid var(--border);border-radius:14px}
  .top-fix-rank{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:999px;
                background:color-mix(in oklab,var(--primary) 22%,transparent);color:var(--primary);
                font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:12px;font-weight:700;margin-top:1px}
  .top-fix-body{min-width:0}
  .top-fix-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px}
  .top-fix-pages{color:var(--muted);font-size:11px;margin-left:auto}
  .top-fix-msg{color:var(--fg);font-size:14px}

  .findings-head{display:flex;align-items:baseline;justify-content:space-between;margin:56px 0 18px}
  .findings-head h2{font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);font-weight:600}
  .findings-head .meta{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:12px;color:var(--muted)}

  .sev-group{margin-top:28px}
  .sev-group:first-child{margin-top:0}
  .sev-heading{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;margin-bottom:10px}
  .sev-dot{display:inline-block;width:8px;height:8px;border-radius:999px;background:currentColor}
  .sev-count{margin-left:auto;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
             font-size:12px;color:var(--muted);font-weight:400}
  .sev-destructive{color:var(--destructive)} .sev-warning{color:var(--warning)} .sev-muted{color:var(--muted)}
  .sev-heading.sev-muted{color:var(--muted-2)}

  .finding-list{list-style:none;column-count:2;column-gap:10px;column-fill:balance}
  @media (max-width:720px){.finding-list{column-count:1}}
  .finding{position:relative;padding:14px 16px 14px 18px;background:var(--card);
           border:1px solid var(--border);border-radius:var(--r);overflow:hidden;
           break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid;
           margin-bottom:10px;display:inline-block;width:100%}
  .finding::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--border-strong)}
  .finding-destructive::before{background:var(--destructive)}
  .finding-warning::before{background:var(--warning)}
  .finding-muted::before{background:var(--muted-2)}
  .finding-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px}
  .rule-id{font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;font-size:12px;
           color:var(--fg);background:var(--card-2);padding:2px 8px;border-radius:6px;border:1px solid var(--border)}
  .finding-pages{color:var(--muted);font-size:11px;margin-left:auto}
  .finding-msg{color:var(--fg);font-size:14px}
  .page-preview{list-style:none;display:flex;flex-direction:column;gap:2px;margin-top:8px;font-size:12px;color:var(--muted)}
  .page-extra{margin-top:6px}
  .page-extra>summary{cursor:pointer;color:var(--muted);font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
                      font-size:12px;list-style:none;padding:4px 0}
  .page-extra>summary::-webkit-details-marker{display:none}
  .page-extra>summary::before{content:"▸ ";color:var(--muted-2)}
  .page-extra[open]>summary::before{content:"▾ "}
  .page-list{list-style:none;display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--muted);
             max-height:240px;overflow-y:auto;padding:6px 0 0}

  .effort-pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;
               font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:lowercase;
               border:1px solid transparent}
  .effort-quick{background:color-mix(in oklab,var(--success) 14%,transparent);
                color:var(--success);border-color:color-mix(in oklab,var(--success) 35%,transparent)}
  .effort-moderate{background:color-mix(in oklab,var(--warning) 14%,transparent);
                   color:var(--warning);border-color:color-mix(in oklab,var(--warning) 35%,transparent)}
  .effort-structural{background:color-mix(in oklab,var(--destructive) 14%,transparent);
                     color:var(--destructive);border-color:color-mix(in oklab,var(--destructive) 35%,transparent)}

  .sev{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10px;
       font-weight:600;text-transform:lowercase;letter-spacing:0.04em;border:1px solid transparent}
  .sev-destructive.sev,.sev.sev-destructive{background:color-mix(in oklab,var(--destructive) 14%,transparent);color:var(--destructive);border-color:color-mix(in oklab,var(--destructive) 35%,transparent)}
  .sev-warning.sev,.sev.sev-warning{background:color-mix(in oklab,var(--warning) 14%,transparent);color:var(--warning);border-color:color-mix(in oklab,var(--warning) 35%,transparent)}
  .sev-muted.sev,.sev.sev-muted{background:var(--card-2);color:var(--muted);border-color:var(--border-strong)}

  .fix{margin-top:8px;padding:10px 12px;background:var(--card-2);border-radius:10px;
       color:var(--muted);font-size:13px;line-height:1.55}
  .fix-label{display:inline-block;margin-right:8px;padding:1px 6px;border-radius:4px;
             background:color-mix(in oklab,var(--primary) 18%,transparent);color:var(--primary);
             font-size:10px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;vertical-align:1px}
  .ref{display:inline-block;margin-top:8px;color:var(--primary);font-size:12px;text-decoration:none}
  .ref:hover{text-decoration:underline}

  .finding details{margin-top:10px;border:1px solid var(--border);border-radius:12px;background:var(--card-2)}
  .finding details.page-extra{border:0;background:transparent;margin-top:6px}
  .finding details>summary{cursor:pointer;padding:10px 14px;color:var(--muted);font-size:12px;
                           font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;list-style:none}
  .finding details.page-extra>summary{padding:4px 0}
  .finding details>summary::-webkit-details-marker{display:none}
  .finding details>summary::before{content:"▸ ";color:var(--muted-2)}
  .finding details[open]>summary::before{content:"▾ "}
  .cluster-body{padding:0 14px 14px;border-top:1px solid var(--border)}
  .cluster-label{margin:12px 0 6px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--muted);font-weight:600}
  .pair-list,.member-list{list-style:none;display:flex;flex-direction:column;gap:4px;font-size:12px}
  .member-list{max-height:220px;overflow-y:auto;padding-right:4px}
  .arrow{color:var(--muted-2)}
  .sim{color:var(--warning);font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}

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

  ::selection{background:color-mix(in oklab,var(--primary) 75%,transparent);color:#0b1a14}
  ::-webkit-scrollbar{width:8px;height:8px}
  ::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:999px}
</style>
</head>
<body>
<main>
  <div class="status-row">
    <span class="status-dot tone-${tone}"></span>
    pseolint · audit complete
  </div>

  <div class="title-row">
    <h1 class="title display">Audit report</h1>
    <span class="src-link">${summary.pageCount} pages · ${summary.findings.length} findings</span>
  </div>
  <p class="lead">Scored against 40+ rules covering Google's public SpamBrain guidance, programmatic-SEO research, and Answer Engine Optimization (AEO) — how citable your pages are to LLMs in AI Overviews. Risk score — lower is safer.</p>

  <section class="card hero">
    <div class="score-block">
      <span class="score tone-${tone}">${summary.score}</span>
      <span class="score-label">Risk score · /100</span>
      <span class="verdict"><span class="verdict-dot tone-${tone}" style="background:var(--${tone})"></span>${escapeHtml(verdict)}</span>
    </div>
    <dl class="stats">
      <div><dt class="stat-label">Pages</dt><dd class="stat-val">${summary.pageCount}</dd></div>
      <div><dt class="stat-label">Errors</dt><dd class="stat-val tone-destructive">${totalErrors}</dd></div>
      <div><dt class="stat-label">Warnings</dt><dd class="stat-val tone-warning">${counts.warning}</dd></div>
      <div><dt class="stat-label">Info</dt><dd class="stat-val muted">${counts.info}</dd></div>
    </dl>
  </section>

  ${summary.templateDetected ? `<div class="template-banner"><strong>Template-generated content detected.</strong> Fix suggestions are tailored for template authors — one change can fix hundreds of pages.</div>` : ""}

  ${(() => {
    const aeoScore = summary.categoryScores?.aeo;
    if (aeoScore === undefined) return "";
    const aeoTone = categoryTone(aeoScore);
    const label = aeoScoreLabel(aeoScore);
    const invert = 100 - aeoScore;
    return `
<section class="aeo-callout">
  <div class="aeo-head">
    <span class="eyebrow">AEO readiness</span>
    <span class="meta-mono">answer-engine citability</span>
  </div>
  <div class="aeo-body">
    <span class="aeo-label tone-${aeoTone}">${escapeHtml(label)}</span>
    <span class="aeo-bar"><span class="bar-fill bar-${aeoTone}" style="width:${invert}%"></span></span>
    <span class="aeo-meta mono">${invert}/100 ready · ${aeoScore}/100 risk</span>
  </div>
</section>`;
  })()}

  ${topFixesHtml}

  <section class="card">
    <header class="section-head">
      <span class="eyebrow">Category scores</span>
      <span class="meta-mono">higher = more risk</span>
    </header>
    <table class="data-table">
      <tbody>${categoryRows}</tbody>
    </table>
  </section>

  ${groupScoresHtml}

  ${summary.triage ? renderTriageHtml(summary.triage) : ""}

  <div class="findings-head">
    <h2>Findings · ${summary.findings.length}</h2>
    <span class="meta">grouped by rule · sampled ${summary.pageCount} page${summary.pageCount === 1 ? "" : "s"}</span>
  </div>
  ${findingsSections}

  <section class="footer-note">
    <strong>About this report.</strong> Score is a structured heuristic, not a verdict from Google. Categories are weighted equally. Severities escalate: info → warning → error → critical. Effort tags (<span class="effort-pill effort-quick">quick fix</span> <span class="effort-pill effort-moderate">moderate</span> <span class="effort-pill effort-structural">structural</span>) estimate the change cost per finding. "Top fixes by impact" ranks by severity × pages affected — the same heuristic Pro uses for its fix queue (which also factors Search Console impressions once connected).
    <br><br>
    <strong>Analytics-safe.</strong> Rendered audits intercept outbound beacons to 40+ telemetry endpoints (GA, PostHog, Mixpanel, Segment, Hotjar, Sentry, Cloudflare/Vercel Insights, etc.) so your dashboards stay untouched — no fake sessions, no polluted funnels.
  </section>
</main>
</body>
</html>`;
}
