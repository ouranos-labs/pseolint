import type { RuleResult } from "../../types.js";

export interface LlmsTxtFetcher {
  (url: string): Promise<string | null>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

async function defaultFetch(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minimal shape check for the emerging llms.txt convention:
 *   - First non-empty line is an `# H1` title
 *   - At least one `## ` section heading
 *   - At least one markdown link line under a section
 * Deliberately lenient: the spec is still evolving, so only reject obvious garbage.
 */
export function validateLlmsTxt(content: string): { valid: boolean; reason?: string } {
  const lines = content.split(/\r?\n/);
  let sawTitle = false;
  let sawSection = false;
  let sawLink = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!sawTitle) {
      if (/^#\s+\S/.test(line)) {
        sawTitle = true;
      } else if (line.startsWith("#")) {
        continue;
      } else {
        return { valid: false, reason: "file does not start with an `# ` H1 title" };
      }
      continue;
    }
    if (/^##\s+\S/.test(line)) {
      sawSection = true;
      continue;
    }
    if (/^-\s*\[[^\]]+\]\([^)]+\)/.test(line)) {
      sawLink = true;
    }
  }

  if (!sawTitle) return { valid: false, reason: "missing `# ` H1 title" };
  if (!sawSection) return { valid: false, reason: "no `## ` section headings found" };
  if (!sawLink) return { valid: false, reason: "no markdown link entries found under any section" };
  return { valid: true };
}

/**
 * Check for /llms.txt at the origin. Site-level rule — runs once, not per page.
 */
export interface LlmsTxtRuleOptions {
  /** Timeout in ms for the /llms.txt fetch. Default: 10 000. */
  timeoutMs?: number;
}

export async function llmsTxtRule(
  source: string,
  fetcherOrOptions: LlmsTxtFetcher | LlmsTxtRuleOptions = {},
): Promise<RuleResult[]> {
  if (!/^https?:\/\//i.test(source)) return [];

  const origin = new URL(source).origin;
  const llmsUrl = `${origin}/llms.txt`;

  const fetcher: LlmsTxtFetcher =
    typeof fetcherOrOptions === "function"
      ? fetcherOrOptions
      : (url) => defaultFetch(url, fetcherOrOptions.timeoutMs);

  const text = await fetcher(llmsUrl);
  if (text === null) {
    return [{
      ruleId: "aeo/llms-txt",
      severity: "warning",
      // Always low: llms.txt is a draft proposal with low industry adoption. Absence
      // is not a defect, only a missed opportunity.
      confidence: "low",
      message:
        `No llms.txt found at ${llmsUrl}. ` +
        `llms.txt is a draft standard with low adoption — absence isn't a defect, only a missed opportunity.`,
      fix:
        `Create ${llmsUrl} to guide AI engines toward your most authoritative, citable content. ` +
        `Start with an # H1 title, a blockquote summary, then ## sections listing your key pages as markdown links. ` +
        `See https://llmstxt.org for the emerging convention.`,
    }];
  }

  const check = validateLlmsTxt(text);
  if (!check.valid) {
    return [{
      ruleId: "aeo/llms-txt",
      severity: "warning",
      confidence: "low",
      message: `${llmsUrl} exists but is malformed: ${check.reason}.`,
      fix:
        `Ensure ${llmsUrl} opens with an "# Site Name" H1, has at least one "## Section" heading, ` +
        `and lists pages as "- [Title](https://...): short description". See https://llmstxt.org.`,
    }];
  }

  return [];
}
