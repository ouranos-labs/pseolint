import type { ParsedPage, RuleResult } from "../../types.js";
import { clusterKeyForUrl } from "./cluster-key.js";

const INDEX_NAMES = ["index.html", "index.htm"] as const;

function indexUrlsForCluster(clusterDir: string, pageUrl: string): string[] {
  if (/^https?:\/\//i.test(pageUrl)) {
    try {
      const base = new URL(clusterDir);
      return INDEX_NAMES.map((name) => new URL(name, base).href);
    } catch {
      return [];
    }
  }
  const sep = pageUrl.includes("\\") ? "\\" : "/";
  const d = clusterDir.replace(/[/\\]+$/, "");
  return INDEX_NAMES.map((n) => `${d}${sep}${n}`);
}

/**
 * Hub/index coverage for medium-sized directories, plus info when a cluster is skipped
 * because it exceeds `maxSiblings`.
 */
export function hubPagesRule(
  pages: ParsedPage[],
  knownUrls: Set<string>,
  minSiblings: number,
  maxSiblings: number
): RuleResult[] {
  if (pages.length === 0) {
    return [];
  }

  const byCluster = new Map<string, ParsedPage[]>();
  for (const p of pages) {
    const key = clusterKeyForUrl(p.url);
    const list = byCluster.get(key) ?? [];
    list.push(p);
    byCluster.set(key, list);
  }

  const findings: RuleResult[] = [];

  for (const [clusterDir, group] of byCluster.entries()) {
    if (group.length < minSiblings) {
      continue;
    }

    if (group.length > maxSiblings) {
      findings.push({
        ruleId: "links/hub-pages-skipped",
        severity: "info",
        message: `Hub/index check skipped for cluster ${clusterDir} (${group.length} pages > max ${maxSiblings}).`,
        relatedUrls: group.map((p) => p.url).sort()
      });
      continue;
    }

    const siblingUrls = new Set(group.map((p) => p.url));
    const indexCandidates = indexUrlsForCluster(clusterDir, group[0].url);
    const hasIndex = indexCandidates.some((u) => knownUrls.has(u));

    const linksToAllSiblings = (page: ParsedPage): boolean => {
      const linked = new Set(
        page.resolvedHrefs.filter((u) => knownUrls.has(u) && siblingUrls.has(u))
      );
      linked.add(page.url);
      for (const s of siblingUrls) {
        if (!linked.has(s)) {
          return false;
        }
      }
      return true;
    };

    const hasHub = hasIndex || group.some((p) => linksToAllSiblings(p));

    if (!hasHub) {
      findings.push({
        ruleId: "links/hub-pages",
        severity: "warning",
        message: `No hub/index page detected for cluster ${clusterDir} (${group.length} pages).`,
        relatedUrls: Array.from(siblingUrls).sort()
      });
    }
  }

  return findings;
}
