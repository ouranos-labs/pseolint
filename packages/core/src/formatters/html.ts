import type { AuditSummary, FixEffort, RuleResult, Severity } from "../types.js";

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

function severityColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "#dc2626";
    case "error":
      return "#ea580c";
    case "warning":
      return "#ca8a04";
    case "info":
      return "#2563eb";
  }
}

function scoreColor(score: number): string {
  if (score <= 20) return "#16a34a";
  if (score <= 40) return "#ca8a04";
  if (score <= 60) return "#ea580c";
  return "#dc2626";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function effortColor(effort: string): string {
  switch (effort) {
    case "quick": return "#16a34a";
    case "moderate": return "#ca8a04";
    case "structural": return "#dc2626";
    default: return "#64748b";
  }
}

function shortenUrl(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

function renderTriageHtml(triage: NonNullable<AuditSummary["triage"]>): string {
  const sorted = triage.rootCauses.slice().sort((a, b) => a.fixOrder - b.fixOrder);
  const cost = triage.estimatedCostUsd !== undefined ? `, est $${triage.estimatedCostUsd.toFixed(2)}` : "";
  const cacheLabel = triage.cacheHit ? "cached" : "cache miss";
  const causes = sorted.map((c) => `
    <li>
      <h3>${c.fixOrder}. ${escapeHtml(c.label)}</h3>
      <p class="meta">${escapeHtml(c.severity)} &middot; ${c.findingsCount} findings &middot; ${c.affectedRuleIds.map(escapeHtml).join(", ")}</p>
      <p>${escapeHtml(c.rationale)}</p>
    </li>`).join("\n");

  return `
<section class="ai-triage">
  <header>
    <h2>AI Triage</h2>
    <p class="meta">${escapeHtml(triage.modelUsed)} (${cacheLabel}) &mdash; ${triage.tokenUsage.input.toLocaleString()} in / ${triage.tokenUsage.output.toLocaleString()} out${cost}</p>
  </header>
  ${triage.narrative ? `<p class="narrative">${escapeHtml(triage.narrative)}</p>` : ""}
  <ol>${causes}</ol>
</section>`;
}

export function formatHtml(summary: AuditSummary): string {
  const grouped = new Map<Severity, RuleResult[]>();
  for (const sev of SEVERITY_ORDER) {
    grouped.set(sev, []);
  }
  for (const f of summary.findings) {
    grouped.get(f.severity)!.push(f);
  }

  const categoryRows = Object.entries(summary.categoryScores)
    .map(([name, value]) => {
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      const pct = value as number;
      return `<tr>
        <td>${escapeHtml(label)}</td>
        <td>
          <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${scoreColor(pct)}"></div></div>
        </td>
        <td>${pct}</td>
      </tr>`;
    })
    .join("\n");

  const findingsSections = SEVERITY_ORDER.map((sev) => {
    const items = grouped.get(sev)!;
    if (items.length === 0) return "";
    const itemsHtml = items
      .map(
        (item) => {
          let li = `<li><strong>${escapeHtml(item.ruleId)}</strong>`;
          if (item.effort) {
            li += ` <span class="effort-pill" style="background:${effortColor(item.effort)}">${escapeHtml(item.effort)}</span>`;
          }
          li += `: ${escapeHtml(item.message)}`;
          if (item.context?.type === "cluster") {
            const ctx = item.context;
            const [minSim, maxSim] = ctx.similarityRange;
            const worstPairsHtml = ctx.worstPairs
              .map(p => `<li>${escapeHtml(shortenUrl(p.left))} &#8596; ${escapeHtml(shortenUrl(p.right))} (${(p.similarity * 100).toFixed(1)}%)</li>`)
              .join("\n");
            const membersHtml = ctx.members
              .map(m => `<li>${escapeHtml(shortenUrl(m))}</li>`)
              .join("\n");
            li += `
<details>
  <summary>${ctx.clusterSize} pages in cluster (${(minSim * 100).toFixed(0)}&ndash;${(maxSim * 100).toFixed(0)}% similar)</summary>
  <div class="cluster-details">
    <strong>Worst pairs:</strong>
    <ul>${worstPairsHtml}</ul>
    <strong>All members:</strong>
    <ul class="member-list">${membersHtml}</ul>
  </div>
</details>`;
          }
          if (item.fix) {
            li += `<div class="fix">Fix: ${escapeHtml(item.fix)}</div>`;
          }
          if (item.ref) {
            li += ` <a href="${escapeHtml(item.ref)}" class="ref" target="_blank">Ref</a>`;
          }
          li += `</li>`;
          return li;
        }
      )
      .join("\n");
    return `<h3 style="color:${severityColor(sev)}">${sev.charAt(0).toUpperCase() + sev.slice(1)} (${items.length})</h3>
    <ul>${itemsHtml}</ul>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>pSEOlint Audit Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1e293b;background:#f8fafc}
  h1{margin-bottom:.5rem}
  h2{margin-top:1.5rem;margin-bottom:.5rem;border-bottom:1px solid #e2e8f0;padding-bottom:.25rem}
  h3{margin-top:1rem;margin-bottom:.25rem}
  table{width:100%;border-collapse:collapse;margin:.5rem 0}
  th,td{text-align:left;padding:.35rem .5rem;border-bottom:1px solid #e2e8f0}
  th{font-weight:600}
  td:last-child{text-align:right;width:3rem}
  .score{font-size:2rem;font-weight:700}
  .meta{color:#64748b;margin-bottom:1rem}
  .bar-bg{background:#e2e8f0;border-radius:4px;height:14px;width:100%}
  .bar-fill{height:100%;border-radius:4px;transition:width .3s}
  ul{list-style:disc;padding-left:1.5rem;margin-bottom:.5rem}
  li{margin:.2rem 0}
  .fix{color:#64748b;font-size:.9em;margin-top:.2rem}
  .ref{color:#2563eb;font-size:.85em}
  .effort-pill{display:inline-block;padding:.1rem .4rem;border-radius:9999px;color:white;font-size:.75em;font-weight:600;vertical-align:middle}
  .template-banner{background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:.5rem 1rem;margin:.5rem 0;color:#92400e;font-size:.9em}
  details{margin:.25rem 0}
  summary{cursor:pointer;color:#2563eb;font-size:.9em}
  .cluster-details{padding:.5rem;background:#f1f5f9;border-radius:4px;margin:.25rem 0;font-size:.85em}
  .cluster-details ul{margin:.25rem 0}
  .member-list{max-height:200px;overflow-y:auto}
</style>
</head>
<body>
<h1>pSEOlint Audit Report</h1>
<p class="meta">Pages analysed: ${summary.pageCount}</p>
<p class="score" style="color:${scoreColor(summary.score)}">SpamBrain Risk Score: ${summary.score}/100</p>
${summary.templateDetected ? `<p class="template-banner">Template-generated content detected. Fix suggestions are tailored for template authors.</p>` : ""}
<h2>Category Scores</h2>
<table>
  <thead><tr><th>Category</th><th>Bar</th><th>Score</th></tr></thead>
  <tbody>${categoryRows}</tbody>
</table>

${summary.groupScores && summary.groupPageCounts ? `
<h2>Group Scores</h2>
<table>
  <thead><tr><th>Group</th><th>Score</th><th>Pages</th></tr></thead>
  <tbody>${Object.entries(summary.groupScores).map(([name, value]) => {
    const count = summary.groupPageCounts![name] ?? 0;
    return `<tr><td>${escapeHtml(name)}</td><td style="text-align:right">${value}</td><td style="text-align:right">${count}</td></tr>`;
  }).join("\n")}</tbody>
</table>` : ""}

${summary.triage ? renderTriageHtml(summary.triage) : ""}

<h2>Findings</h2>
${findingsSections}
</body>
</html>`;
}
