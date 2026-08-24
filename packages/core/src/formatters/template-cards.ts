/**
 * v0.5.11: per-template card rendering helpers.
 *
 * One shared module called by console, markdown, and html formatters.
 * Each exported function takes a `Template[]` and returns a format-specific
 * string segment. The formatters splice it in above the per-URL findings list
 * when `summary.templates.length >= 2 && !opts.legacyFlat`.
 */
import type { Template, Verdict, Grade } from "../types.js";

/** Options shared across all per-template card renderers. */
export interface TemplateCardOptions {
  /** When true, skip per-template cards entirely (--legacy-flat). */
  legacyFlat?: boolean;
  /**
   * When set, highlight / annotate the matching template card.
   * Silently ignored when no template matches the signature.
   */
  filterTemplate?: string;
}

// ── shared helpers ────────────────────────────────────────────────────────

/** True when templates array is present, has ≥2 entries, and not legacy-flat. */
export function shouldRenderTemplateCards(
  templates: Template[] | undefined,
  opts: TemplateCardOptions,
): boolean {
  if (opts.legacyFlat) return false;
  return Array.isArray(templates) && templates.length >= 2;
}

function coveragePct(template: Template): string {
  const denom = template.totalDiscoveredUrls > 0 ? template.totalDiscoveredUrls : template.totalUrls;
  if (denom === 0) return "0%";
  return `${((template.totalUrls / denom) * 100).toFixed(1)}%`;
}

function topDriverLine(template: Template): string {
  const td = template.variance.topDriver;
  if (!td) return "";
  const sampleCount = template.auditedUrls.length;
  const failCount = Math.round(td.fireRate * sampleCount);
  return `${failCount}/${sampleCount} samples fail \`${td.ruleId}\``;
}

function uniformityPct(template: Template): string {
  return `${Math.round(template.variance.uniformityScore * 100)}%`;
}

// ── Console renderer ──────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED_BRIGHT = "\x1b[91m";
const ORANGE = "\x1b[38;5;208m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";

function verdictColorConsole(v: Verdict): string {
  switch (v) {
    case "ready":      return GREEN;
    case "caution":    return YELLOW;
    case "concerning": return MAGENTA;
    case "critical":   return RED + BOLD;
  }
}

function gradeColorConsole(g: Grade): string {
  switch (g) {
    case "A": case "B": return GREEN;
    case "C":           return YELLOW;
    case "D":           return ORANGE;
    case "F":           return RED + BOLD;
  }
}

/**
 * Render per-template cards for the console formatter.
 * Returns an empty string when there is nothing to render.
 */
export function renderTemplateCardsConsole(
  templates: Template[],
  opts: TemplateCardOptions,
  noColor = false,
): string {
  if (!shouldRenderTemplateCards(templates, opts)) return "";

  const lines: string[] = [];
  lines.push(`${BOLD}Per-template breakdown (${templates.length} templates):${RESET}`);
  lines.push("");

  for (const t of templates) {
    const isHighlighted = opts.filterTemplate === t.signature;
    const marker = isHighlighted ? `${CYAN}▶ ${RESET}` : "  ";
    const vColor = verdictColorConsole(t.verdict);
    const grade = t.categories.integrity.grade;
    const gColor = gradeColorConsole(grade);

    const coverage = `${t.auditedUrls.length}/${t.totalUrls} URLs (${coveragePct(t)})`;
    const topDriver = topDriverLine(t);
    const uniformity = `uniformity ${uniformityPct(t)}`;

    lines.push(
      `${marker}${BOLD}${t.signature}${RESET}  ${vColor}${t.verdict.toUpperCase()}${RESET}  ${gColor}${grade}${RESET}`,
    );
    lines.push(`  ${DIM}${coverage}${RESET}  ${DIM}${uniformity}${RESET}`);
    if (topDriver) {
      lines.push(`  ${topDriver}`);
    }
    lines.push("");
  }

  const out = lines.join("\n");
  if (noColor) return out.replace(/\x1b\[[0-9;]*m/g, "");
  return out;
}

// ── Markdown renderer ─────────────────────────────────────────────────────

const VERDICT_GLYPH_MD: Record<Verdict, string> = {
  ready: "✅",
  caution: "⚠️",
  concerning: "⚠️",
  critical: "🔴",
};

/**
 * Render per-template cards for the markdown formatter.
 * Returns an empty string when there is nothing to render.
 */
export function renderTemplateCardsMarkdown(
  templates: Template[],
  opts: TemplateCardOptions,
): string {
  if (!shouldRenderTemplateCards(templates, opts)) return "";

  const lines: string[] = [];
  lines.push("## Templates");
  lines.push("");
  lines.push("| Template | Verdict | Grade | Coverage | Uniformity | Top driver |");
  lines.push("|---|---|---|---|---|---|");

  for (const t of templates) {
    const glyph = VERDICT_GLYPH_MD[t.verdict];
    const grade = t.categories.integrity.grade;
    const coverage = `${t.auditedUrls.length}/${t.totalUrls} (${coveragePct(t)})`;
    const uniformity = uniformityPct(t);
    const topDriver = topDriverLine(t);
    const highlight = opts.filterTemplate === t.signature ? " ◀" : "";
    lines.push(
      `| \`${t.signature}\`${highlight} | ${glyph} ${t.verdict} | ${grade} | ${coverage} | ${uniformity} | ${topDriver || "n/a"} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

// ── HTML renderer ─────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VERDICT_TONE_HTML: Record<Verdict, string> = {
  ready: "success",
  caution: "warning",
  concerning: "destructive",
  critical: "critical",
};

const GRADE_TONE_HTML: Record<Grade, string> = {
  A: "success", B: "success", C: "warning", D: "destructive", F: "critical",
};

/**
 * Render per-template cards for the HTML formatter.
 * Returns an empty string when there is nothing to render.
 * The caller must ensure the CSS variables and existing styles are in scope:
 * this helper generates markup only, no <style> block.
 */
export function renderTemplateCardsHtml(
  templates: Template[],
  opts: TemplateCardOptions,
): string {
  if (!shouldRenderTemplateCards(templates, opts)) return "";

  const cards = templates.map((t) => {
    const vTone = VERDICT_TONE_HTML[t.verdict];
    const grade = t.categories.integrity.grade;
    const gTone = GRADE_TONE_HTML[grade];
    const coverage = `${t.auditedUrls.length}/${t.totalUrls} URLs (${coveragePct(t)})`;
    const topDriver = topDriverLine(t);
    const uniformity = uniformityPct(t);
    const isHighlighted = opts.filterTemplate === t.signature;
    const highlightAttr = isHighlighted ? ' data-highlighted="true"' : "";

    return `<div class="tmpl-card tmpl-${vTone}"${highlightAttr}>
  <div class="tmpl-head">
    <code class="tmpl-sig">${escapeHtml(t.signature)}</code>
    <span class="verdict-badge tone-${vTone}">${escapeHtml(t.verdict)}</span>
    <span class="tmpl-grade tone-${gTone}">${escapeHtml(grade)}</span>
  </div>
  <div class="tmpl-stats">
    <span class="tmpl-coverage">${escapeHtml(coverage)}</span>
    <span class="tmpl-uniformity">uniformity ${escapeHtml(uniformity)}</span>
    ${topDriver ? `<span class="tmpl-driver">${escapeHtml(topDriver)}</span>` : ""}
  </div>
</div>`;
  }).join("\n");

  return `<section class="template-cards">
<h2 class="section-title">Templates (${templates.length})</h2>
<div class="tmpl-grid">
${cards}
</div>
</section>`;
}

/**
 * CSS rules for the per-template card grid. Injected once by the HTML formatter
 * into the document <style> block.
 */
export const TEMPLATE_CARDS_CSS = `
  .template-cards{margin-top:32px}
  .template-cards .section-title{font-size:13px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:var(--muted);margin-bottom:14px}
  .tmpl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
  .tmpl-card{padding:16px 18px;border-radius:var(--r);background:var(--card);border:1px solid var(--border)}
  .tmpl-card[data-highlighted="true"]{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary)}
  .tmpl-card.tmpl-success{border-left:3px solid var(--success)}
  .tmpl-card.tmpl-warning{border-left:3px solid var(--warning)}
  .tmpl-card.tmpl-destructive{border-left:3px solid var(--destructive)}
  .tmpl-card.tmpl-critical{border-left:3px solid var(--critical)}
  .tmpl-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
  .tmpl-sig{font-size:12px;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;color:var(--fg);background:var(--card-2);padding:2px 8px;border-radius:6px;border:1px solid var(--border)}
  .tmpl-grade{font-size:14px;font-weight:700;margin-left:auto}
  .tone-success{color:var(--success)} .tone-warning{color:var(--warning)} .tone-destructive{color:var(--destructive)} .tone-critical{color:var(--critical)}
  .tmpl-stats{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--muted);font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace}
  .tmpl-driver{color:var(--fg)}
`;
