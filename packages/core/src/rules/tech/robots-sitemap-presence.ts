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
      message: `Could not fetch ${robotsUrl}.`,
      fix: `Create a robots.txt file at ${robotsUrl} and include a Sitemap directive pointing to your sitemap.`
    });
    return findings;
  }

  if (!/^\s*sitemap\s*:/gim.test(robotsText)) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "info",
      message: `${robotsUrl} does not declare a Sitemap directive.`,
      fix: `Add a Sitemap directive to ${robotsUrl}, e.g.: Sitemap: ${sitemapUrl}`
    });
  }

  const sitemapText = await fetchTextIfOk(sitemapUrl);
  if (!sitemapText) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "warning",
      message: `Could not fetch ${sitemapUrl}.`,
      fix: `Create an XML sitemap at ${sitemapUrl} and reference it in ${robotsUrl}.`
    });
    return findings;
  }

  const lowered = sitemapText.toLowerCase();
  if (!lowered.includes("<urlset") && !lowered.includes("<sitemapindex")) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "warning",
      message: `${sitemapUrl} was fetched but does not look like sitemap XML.`,
      fix: `Ensure ${sitemapUrl} is valid sitemap XML containing a <urlset> or <sitemapindex> root element.`
    });
  }

  return findings;
}
