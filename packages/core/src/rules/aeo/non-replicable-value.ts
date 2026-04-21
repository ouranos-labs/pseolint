import { load } from "cheerio";
import type { ParsedPage, RuleResult } from "../../types.js";

export interface NonReplicableValueOptions {
  /** Extra selectors that count as interactive/non-replicable. */
  interactiveSelectors?: string[];
  /** Severity override. Default: "warning". */
  severity?: "info" | "warning" | "error";
}

const DEFAULT_INTERACTIVE_SELECTORS = [
  "form",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "iframe",
  "button[type=submit]",
  "canvas",
  "[data-interactive]",
  "[data-calculator]",
  "[data-tool]",
  "[data-widget]",
  "[x-data]",
  ".calculator",
  ".tool",
  ".checker",
  ".generator",
  ".interactive",
  ".widget",
  ".comparator",
];

const DOWNLOAD_PATTERN = /\.(pdf|docx?|xlsx?|csv|zip|pptx?)(?:$|[?#])/i;

const GATED_PATTERNS: RegExp[] = [
  /\bsign\s*(in|up)\s+to\s+(read|access|view|download|continue)/i,
  /\bpaywall\b/i,
  /\bsubscribe\s+to\s+read\b/i,
  /\blog\s*in\s+to\s+(read|access|view|download|continue)/i,
];

function hasInteractiveElement($: ReturnType<typeof load>, html: string, extraSelectors: string[]): boolean {
  const selectors = [...DEFAULT_INTERACTIVE_SELECTORS, ...extraSelectors];
  for (const sel of selectors) {
    try {
      if ($(sel).length > 0) return true;
    } catch {
      // invalid selector — skip
    }
  }
  // Framework-generated component markers use hashed attribute names; scan raw HTML for common patterns.
  if (/\bdata-(reactroot|react-[\w-]+|vue-[\w-]+|v-[\w-]+|svelte-[\w-]+)\b/i.test(html)) return true;
  return false;
}

function hasDownloadableAsset($: ReturnType<typeof load>): boolean {
  let found = false;
  $("a[href]").each((_, el) => {
    if (found) return false;
    const href = $(el).attr("href") ?? "";
    if (DOWNLOAD_PATTERN.test(href) || /[?&]format=(pdf|docx?|xlsx?|csv)\b/i.test(href)) {
      found = true;
      return false;
    }
    if ($(el).attr("download") !== undefined) {
      found = true;
      return false;
    }
    return undefined;
  });
  return found;
}

function hasGatedContent(text: string): boolean {
  return GATED_PATTERNS.some((re) => re.test(text));
}

export function nonReplicableValueRule(
  pages: ParsedPage[],
  options?: NonReplicableValueOptions,
): RuleResult[] {
  const extra = options?.interactiveSelectors ?? [];
  const severity = options?.severity ?? "warning";
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const $ = load(page.html);
    const interactive = hasInteractiveElement($, page.html, extra);
    const downloadable = hasDownloadableAsset($);
    const gated = hasGatedContent(page.contentText);

    if (interactive || downloadable || gated) continue;

    findings.push({
      ruleId: "aeo/non-replicable-value",
      severity,
      message: `${page.url} contains only text AI can fully summarize — no interactive element, downloadable asset, or gated content detected.`,
      pageUrl: page.url,
      fix:
        `Add a non-replicable value so users have a reason to click through. Options for a pSEO template: ` +
        `(1) a calculator with entity-specific variables (e.g. filing fee estimator), ` +
        `(2) an interactive checklist users can complete, ` +
        `(3) a downloadable PDF or document with the download attribute visible above the fold, ` +
        `(4) a live preview / generator tool, ` +
        `(5) a gated resource (account required). AI can replicate your text. It cannot replicate your calculator.`,
    });
  }

  return findings;
}
