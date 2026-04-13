import type { AuditSummary, RuleResult, Severity } from "../types.js";

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
        (item) =>
          `<li><strong>${escapeHtml(item.ruleId)}</strong>: ${escapeHtml(item.message)}</li>`
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
</style>
</head>
<body>
<h1>pSEOlint Audit Report</h1>
<p class="meta">Pages analysed: ${summary.pageCount}</p>
<p class="score" style="color:${scoreColor(summary.score)}">SpamBrain Risk Score: ${summary.score}/100</p>

<h2>Category Scores</h2>
<table>
  <thead><tr><th>Category</th><th>Bar</th><th>Score</th></tr></thead>
  <tbody>${categoryRows}</tbody>
</table>

<h2>Findings</h2>
${findingsSections}
</body>
</html>`;
}
