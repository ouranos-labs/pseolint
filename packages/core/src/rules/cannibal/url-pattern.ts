import type { ParsedPage, RuleResult } from "../../types.js";

function lastSegment(url: string): { directory: string; tokens: string[] } {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  const stripped = pathname.replace(/\/+$/, "");
  const lastSlash = stripped.lastIndexOf("/");
  const directory = lastSlash >= 0 ? stripped.slice(0, lastSlash) : "";
  const segment = lastSlash >= 0 ? stripped.slice(lastSlash + 1) : stripped;

  return {
    directory,
    tokens: segment.split("-").filter(Boolean).sort()
  };
}

export function urlPatternRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  const parsed = pages.map((page) => ({ url: page.url, ...lastSegment(page.url) }));

  for (let i = 0; i < parsed.length; i += 1) {
    for (let j = i + 1; j < parsed.length; j += 1) {
      const a = parsed[i];
      const b = parsed[j];

      if (a.directory !== b.directory || a.directory === "") {
        continue;
      }
      if (a.tokens.length === 0 || b.tokens.length === 0) {
        continue;
      }
      if (a.url === b.url) {
        continue;
      }
      if (a.tokens.join("-") === b.tokens.join("-")) {
        findings.push({
          ruleId: "cannibal/url-pattern",
          severity: "info",
          message: `${pages[i].url} and ${pages[j].url} have the same URL tokens in different order, creating ambiguous intent overlap.`,
          pageUrl: pages[i].url,
          relatedUrls: [pages[j].url]
        });
      }
    }
  }

  return findings;
}
