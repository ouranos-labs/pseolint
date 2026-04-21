import type { AuditSummary, RuleResult, Severity } from "../types.js";

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  error: "Error",
  warning: "Warning",
  info: "Info",
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
  };
  return map[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
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
    const itemsHtml = items
      .map((item) => {
        const effortPill = item.effort
          ? ` <span class="effort-pill effort-${escapeHtml(item.effort)}">${escapeHtml(effortLabel(item.effort))}</span>`
          : "";
        const pageUrl = item.pageUrl
          ? ` <span class="page-url mono">${escapeHtml(shortenUrl(item.pageUrl))}</span>`
          : "";
        let cluster = "";
        if (item.context?.type === "cluster") {
          const ctx = item.context;
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
        const fix = item.fix ? `<div class="fix"><span class="fix-label">Fix</span>${escapeHtml(item.fix)}</div>` : "";
        const ref = item.ref ? `<a href="${escapeHtml(item.ref)}" class="ref" target="_blank" rel="noopener">ref ↗</a>` : "";
        return `<li class="finding finding-${severityTone(sev)}">
          <div class="finding-head">
            <code class="rule-id">${escapeHtml(item.ruleId)}</code>${effortPill}${pageUrl}
          </div>
          <p class="finding-msg">${escapeHtml(item.message)}</p>
          ${cluster}
          ${fix}
          ${ref}
        </li>`;
      })
      .join("");
    return `
    <div class="sev-group">
      <h3 class="sev-heading sev-${severityTone(sev)}">
        <span class="sev-dot"></span>${SEVERITY_LABEL[sev]}
        <span class="sev-count">${items.length}</span>
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
  .finding-msg{color:var(--fg);font-size:14px}
  .page-url{color:var(--muted);font-size:11px;margin-left:auto}

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
  .finding details>summary{cursor:pointer;padding:10px 14px;color:var(--muted);font-size:12px;
                           font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;list-style:none}
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
  <p class="lead">Scored against 35 rules inferred from Google's public SpamBrain guidance and programmatic-SEO research. Risk score — lower is safer.</p>

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
    <span class="meta">sampled ${summary.pageCount} page${summary.pageCount === 1 ? "" : "s"}</span>
  </div>
  ${findingsSections}

  <section class="footer-note">
    <strong>About this report.</strong> Score is a structured heuristic, not a verdict from Google. Categories are weighted equally. Severities escalate: info → warning → error → critical. Effort tags (<span class="effort-pill effort-quick">quick fix</span> <span class="effort-pill effort-moderate">moderate</span> <span class="effort-pill effort-structural">structural</span>) estimate the change cost per finding.
  </section>
</main>
</body>
</html>`;
}
