import type { RuleResult } from "../../types.js";

async function fetchTextIfOk(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

export async function robotsSitemapPresenceRule(source: string): Promise<RuleResult[]> {
  if (!/^https?:\/\//i.test(source)) {
    return [];
  }

  const sourceUrl = new URL(source);
  const origin = sourceUrl.origin;
  const robotsUrl = `${origin}/robots.txt`;
  const sitemapUrl = `${origin}/sitemap.xml`;
  const findings: RuleResult[] = [];

  const robotsText = await fetchTextIfOk(robotsUrl);
  if (!robotsText) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "warning",
      message: `Could not fetch ${robotsUrl}.`
    });
    return findings;
  }

  if (!/^\s*sitemap\s*:/gim.test(robotsText)) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "info",
      message: `${robotsUrl} does not declare a Sitemap directive.`
    });
  }

  const sitemapText = await fetchTextIfOk(sitemapUrl);
  if (!sitemapText) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "warning",
      message: `Could not fetch ${sitemapUrl}.`
    });
    return findings;
  }

  const lowered = sitemapText.toLowerCase();
  if (!lowered.includes("<urlset") && !lowered.includes("<sitemapindex")) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "warning",
      message: `${sitemapUrl} was fetched but does not look like sitemap XML.`
    });
  }

  return findings;
}
